import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  CAR_ORDER_STATUSES,
  type CarOrderRow,
  type CarOrderStatus,
  type CarPriceSource,
} from "@/features/cars/car-orders.types";
import type { CarPriceState } from "@/config/constants";
import type { CarEnquiryRow } from "@/features/cars/types";

/**
 * `car_orders` access (migration 068).
 *
 * DATA ACCESS ONLY. Whether a listing may be bought, where the price comes
 * from, which transitions are legal, the `audit_logs` row every mutation owes
 * and the 409 a customer sees are all
 * `features/cars/services/car-orders.service.ts` and
 * `features/payments/services/payments.service.ts` — CLAUDE.md: `db/queries`
 * holds no business logic and no auth checks. There is not a single `user.id`
 * comparison in this file; the service that calls it does that.
 *
 * SERVICE ROLE THROUGHOUT, which is why this module is `server-only`. 068
 * grants `authenticated` nothing but SELECT and gives it no write policy at
 * all, following 061 — so every write here would be refused through a
 * cookie-bound client, and a customer cannot set their own order to `paid`.
 *
 * `updated_at` IS STAMPED BY HAND on every UPDATE. There is no shared trigger
 * function in this schema; `db/queries/order-groups.ts` and
 * `db/queries/cars.ts` do the same.
 *
 * ERRORS ARE NOT SWALLOWED, and the distinction between "the row moved on" and
 * "the write failed" is preserved exactly. `updateCarOrderStatus` returns false
 * for the first and THROWS for the second, because the callback/webhook race
 * reads that boolean as "somebody else already settled this, skip the side
 * effects" — and a failed write reported as false would tell a customer their
 * car is paid for while the row stayed pending.
 */

const COLUMNS =
  "id, car_listing_id, user_id, price_pesewas, price_state, price_source, car_enquiry_id, car_label, deposit_pesewas, deposit_percent, balance_pesewas, status, payment_id, deposit_paid_at, paid_at, balance_amount_pesewas, balance_note, balance_recorded_by, cancelled_at, cancel_reason, created_at, updated_at";

/**
 * The `car_enquiries` columns this module reads. A subset: the purchase path
 * needs who the enquiry belongs to, which car it is about, and the two figures
 * that can be agreed — not the prose.
 */
const AGREED_ENQUIRY_COLUMNS =
  "id, car_listing_id, user_id, kind, offer_pesewas, status, quoted_pesewas, answered_at, created_at";

/** Postgres unique violation. */
const UNIQUE_VIOLATION = "23505";
/** Postgres CHECK violation — one of 068's invariants refused the row. */
const CHECK_VIOLATION = "23514";

/**
 * `uq_car_orders_live` refused the insert: this car already has a live order.
 *
 * Thrown instead of a bare `Error` so the service can answer 409 without reading
 * Postgres error codes itself, the way `CarSlugTakenError` works in
 * `db/queries/cars.ts`.
 *
 * THIS IS THE RACE BEING SETTLED, not an edge case. Two customers press Buy 40
 * ms apart, both SELECT and see no order, both INSERT; the index refuses the
 * second and this is how that refusal reaches a customer as a sentence. A
 * `SELECT` first cannot replace it — it can only make the common case a nicer
 * message, which is exactly what the service uses it for.
 */
export class CarAlreadySoldError extends Error {
  constructor() {
    super("This car already has a live order");
    this.name = "CarAlreadySoldError";
  }
}

/** One of 068's CHECK constraints refused the row. */
export class CarOrderInvariantError extends Error {
  constructor(detail: string) {
    super(detail);
    this.name = "CarOrderInvariantError";
  }
}

export interface CarOrderInsert {
  car_listing_id: string;
  user_id: string;
  /**
   * The full agreed price, decided by the service: the listing's figure, or this
   * customer's own quote or accepted offer. The client never sends a price.
   */
  price_pesewas: number;
  price_state: CarPriceState;
  /** Where that figure came from (069). `listing` iff `car_enquiry_id` is null. */
  price_source: CarPriceSource;
  car_enquiry_id: string | null;
  car_label: string;
  /** What Paystack will be asked for, computed by the service and frozen here. */
  deposit_pesewas: number;
  deposit_percent: number;
}

/** A new order at `pending_payment`, or `CarAlreadySoldError` if beaten to it. */
export async function insertCarOrder(input: CarOrderInsert): Promise<CarOrderRow> {
  const { data, error } = await createAdminClient()
    .from("car_orders")
    .insert(input)
    .select(COLUMNS)
    .single();

  if (error) {
    if (error.code === UNIQUE_VIOLATION) throw new CarAlreadySoldError();
    if (error.code === CHECK_VIOLATION) throw new CarOrderInvariantError(error.message);
    throw new Error(`Failed to create the car order: ${error.message}`);
  }
  return normalizeRow(data as Record<string, unknown>);
}

export async function getCarOrderById(id: string): Promise<CarOrderRow | null> {
  const { data, error } = await createAdminClient()
    .from("car_orders")
    .select(COLUMNS)
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(`Failed to load the car order: ${error.message}`);
  return data ? normalizeRow(data as Record<string, unknown>) : null;
}

/**
 * The one order holding this car, if any.
 *
 * "Live" is the same set `uq_car_orders_live` covers: everything except
 * `cancelled`. The index guarantees there is at most one, so `maybeSingle` here
 * is a statement about the schema rather than a hope — but the filter is written
 * out explicitly rather than leaning on the index, because this client bypasses
 * RLS and reads its own predicate.
 *
 * Used for the MESSAGE, not for the guarantee: the service asks this so it can
 * tell the customer "you are already buying this car, finish paying" instead of
 * a bare conflict, and so a buyer whose payment failed can retry against the
 * same order. What actually stops a double sale is the insert failing.
 */
export async function findLiveCarOrderForListing(
  carListingId: string,
): Promise<CarOrderRow | null> {
  const { data, error } = await createAdminClient()
    .from("car_orders")
    .select(COLUMNS)
    .eq("car_listing_id", carListingId)
    .neq("status", CAR_ORDER_STATUSES.CANCELLED)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`Failed to check the car's orders: ${error.message}`);
  return data ? normalizeRow(data as Record<string, unknown>) : null;
}

/**
 * The columns a transition is allowed to set alongside the status itself.
 *
 * DELIBERATELY NOT `Partial<CarOrderRow>`. Every column in this list is written
 * by exactly one transition — the payment attribution by the settle, the balance
 * receipt by the admin recording it, the cancellation stamps by the release —
 * and a wider type would let any caller move the PRICE or the DEPOSIT in the
 * same UPDATE as a status change. Those two are snapshots and nothing may touch
 * them after the insert; `balance_pesewas` is generated by the database and
 * cannot be written at all.
 */
export type CarOrderStatusPatch = Partial<
  Pick<
    CarOrderRow,
    | "payment_id"
    | "deposit_paid_at"
    | "paid_at"
    | "balance_amount_pesewas"
    | "balance_note"
    | "balance_recorded_by"
    | "cancelled_at"
    | "cancel_reason"
  >
>;

/**
 * Guarded transition: only a row still in `from` moves. Returns whether one did.
 *
 * `.eq("status", from)` is the compare-and-set the money path is built on.
 * Paystack reports one charge twice — once when it redirects the customer's
 * browser back, once over the webhook — and the two arrive concurrently. Both
 * can read a `pending_payment` car order; only the UPDATE that still matches one
 * comes back with a row. The loser gets `false` and must skip the audit row and
 * every other side effect rather than repeat it.
 *
 * FALSE MEANS "SOMEBODY ELSE GOT THERE FIRST", AND NOTHING ELSE. A real database
 * failure throws, exactly as `updateOrderGroupStatus` does and for the same
 * reason `transitionPaymentStatus` spells out at length: treating a failed write
 * as a lost race would report a car as sold and paid for while the row quietly
 * stayed pending.
 */
export async function updateCarOrderStatus(
  id: string,
  from: CarOrderStatus,
  to: CarOrderStatus,
  patch: CarOrderStatusPatch = {},
): Promise<boolean> {
  const { data, error } = await createAdminClient()
    .from("car_orders")
    .update({ status: to, updated_at: new Date().toISOString(), ...patch })
    .eq("id", id)
    .eq("status", from)
    .select("id");

  if (error) {
    if (error.code === CHECK_VIOLATION) throw new CarOrderInvariantError(error.message);
    throw new Error(`Failed to update the car order: ${error.message}`);
  }
  return (data?.length ?? 0) > 0;
}

/**
 * Car orders still at `pending_payment` that were created before `cutoffIso`,
 * oldest first — the abandoned checkouts the reconciliation sweep releases.
 *
 * WHY THIS READ EXISTS AT ALL. `uq_car_orders_live` covers every state except
 * `cancelled`, so a `pending_payment` row holds its vehicle out of sale for as
 * long as it lives. Paystack never reports an abandoned checkout — there is no
 * such webhook — so nothing closes that row on its own, and without a sweep a
 * customer who opened Paystack and shut the tab takes the car off the market
 * permanently. This is the list that sweep works from.
 *
 * `pending_payment` IS THE ONLY STATUS ASKED FOR, and that is the first of the
 * three things standing between this query and the catastrophe of cancelling a
 * car somebody has paid for: a settled order is `paid`, and `paid` is not in
 * this result set. The other two are the service's — it skips any car order
 * with a live payment, and the cancel itself is a guarded
 * `pending_payment → cancelled` UPDATE that matches nothing if the row moved
 * while the batch was being worked.
 *
 * NOT filtered on payments here, deliberately: which payments count as live is
 * `findActivePayment`'s rule and it belongs with the rest of the business logic.
 */
export async function listStalePendingCarOrders(
  cutoffIso: string,
  limit: number,
): Promise<CarOrderRow[]> {
  const { data, error } = await createAdminClient()
    .from("car_orders")
    .select(COLUMNS)
    .eq("status", CAR_ORDER_STATUSES.PENDING_PAYMENT)
    .lt("created_at", cutoffIso)
    .order("created_at", { ascending: true })
    .limit(limit);

  if (error) throw new Error(`Failed to list the unpaid car orders: ${error.message}`);
  return ((data ?? []) as Record<string, unknown>[]).map(normalizeRow);
}

// ── The agreed price (069) ──────────────────────────────────────────────────

/**
 * The enquiries on this car that belong to THIS customer and could carry an
 * agreed figure, newest first.
 *
 * WHY THIS READ LIVES IN `car-orders.ts` AND NOT IN `cars.ts`. It is not part of
 * 067's enquiry queue — nothing here answers, counts or lists an enquiry for an
 * admin. It is the PURCHASE PATH's read of the one thing that decides what a
 * customer is charged, and it sits next to the table that snapshots the answer.
 *
 * `user_id` IS FILTERED IN SQL, NOT LEFT TO RLS, and that is the line standing
 * between a customer and somebody else's price. This module holds a service-role
 * client which bypasses every policy, so `car_enquiries owner read` makes no
 * promise to this code path at all: a query that forgot this `.eq` would happily
 * hand back the quote another buyer was given for the same vehicle, and the
 * checkout would charge it. The caller passes the SESSION's user id — there is
 * no argument here a request could reach.
 *
 * WHICH STATUSES, AND WHY NOT `open`. `answered` and `accepted` are the only two
 * that mean a person has committed to a number: `open` is a customer waiting,
 * `declined` is a no, `withdrawn` is a customer who took it back. Whether the
 * row then actually carries a usable figure (a quote on a price request, an
 * offer amount on an accepted offer) is the SERVICE's rule, not this one — no
 * business logic in `db/queries`, so this returns the candidates and the service
 * decides what "agreed" means.
 *
 * Ordered by when it was answered, newest first, with `created_at` as the
 * tiebreak: a customer may have an old accepted offer and a newer quote on the
 * same car, and the most recent thing a person said is the one that stands.
 */
export async function listAgreedCarEnquiriesForUser(
  carListingId: string,
  userId: string,
): Promise<CarEnquiryRow[]> {
  const { data, error } = await createAdminClient()
    .from("car_enquiries")
    .select(AGREED_ENQUIRY_COLUMNS)
    .eq("car_listing_id", carListingId)
    .eq("user_id", userId)
    .in("status", ["answered", "accepted"])
    .order("answered_at", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(10);

  if (error) throw new Error(`Failed to load the car enquiries: ${error.message}`);
  return ((data ?? []) as Record<string, unknown>[]).map(normalizeAgreedEnquiry);
}

/**
 * The subset of a `car_enquiries` row this path reads, with the numerics
 * normalised. The columns it does not select are filled with their empty values
 * rather than left undefined, so the shape is a real `CarEnquiryRow` and nobody
 * downstream has to know which half came back.
 */
function normalizeAgreedEnquiry(row: Record<string, unknown>): CarEnquiryRow {
  return {
    id: String(row.id),
    car_listing_id: String(row.car_listing_id),
    user_id: String(row.user_id),
    kind: row.kind as CarEnquiryRow["kind"],
    offer_pesewas: numberOrNull(row.offer_pesewas),
    message: null,
    status: row.status as CarEnquiryRow["status"],
    admin_response: null,
    quoted_pesewas: numberOrNull(row.quoted_pesewas),
    answered_by: null,
    answered_at: (row.answered_at as string | null) ?? null,
    created_at: String(row.created_at),
    updated_at: String(row.created_at),
  };
}

/** A customer's own purchases, newest first. */
export async function listCarOrdersForUser(userId: string): Promise<CarOrderRow[]> {
  const { data, error } = await createAdminClient()
    .from("car_orders")
    .select(COLUMNS)
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) throw new Error(`Failed to load your car orders: ${error.message}`);
  return ((data ?? []) as Record<string, unknown>[]).map(normalizeRow);
}

// ── Row normalisation (PostgREST widens numerics to strings) ────────────────

function normalizeRow(row: Record<string, unknown>): CarOrderRow {
  return {
    id: String(row.id),
    car_listing_id: String(row.car_listing_id),
    user_id: String(row.user_id),
    // `Number(...)` and not a cast: the column is INTEGER, but PostgREST has
    // handed numerics back as strings often enough in this codebase that
    // `db/queries/order-groups.ts` normalises every one of them. A price that
    // arrives as "18500000" and is compared with `> 0` would pass and then be
    // sent to Paystack as a string.
    price_pesewas: Number(row.price_pesewas),
    price_state: row.price_state as CarOrderRow["price_state"],
    price_source: (row.price_source as CarPriceSource | undefined) ?? "listing",
    car_enquiry_id: (row.car_enquiry_id as string | null) ?? null,
    car_label: String(row.car_label),
    // Same `Number(...)` treatment as the price, for the same reason: a deposit
    // that arrives as "7740000" would pass `> 0` and be handed to Paystack as a
    // string. The `??` fallbacks cover a row read before 069 applied — a deposit
    // of the whole price and a balance of nothing, which is what those rows are.
    deposit_pesewas: Number(row.deposit_pesewas ?? row.price_pesewas),
    deposit_percent: Number(row.deposit_percent ?? 100),
    balance_pesewas: Number(row.balance_pesewas ?? 0),
    status: row.status as CarOrderStatus,
    payment_id: (row.payment_id as string | null) ?? null,
    deposit_paid_at: (row.deposit_paid_at as string | null) ?? (row.paid_at as string | null) ?? null,
    paid_at: (row.paid_at as string | null) ?? null,
    balance_amount_pesewas: numberOrNull(row.balance_amount_pesewas),
    balance_note: (row.balance_note as string | null) ?? null,
    balance_recorded_by: (row.balance_recorded_by as string | null) ?? null,
    cancelled_at: (row.cancelled_at as string | null) ?? null,
    cancel_reason: (row.cancel_reason as string | null) ?? null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

/** `Number(null)` is 0, which would turn "nothing recorded" into "GH₵0 received". */
function numberOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
