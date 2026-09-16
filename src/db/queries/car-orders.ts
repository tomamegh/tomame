import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  CAR_ORDER_STATUSES,
  type CarOrderRow,
  type CarOrderStatus,
} from "@/features/cars/car-orders.types";

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
  "id, car_listing_id, user_id, price_pesewas, price_state, car_label, status, payment_id, paid_at, cancelled_at, cancel_reason, created_at, updated_at";

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
  /** Copied from the listing by the service. The client never sends a price. */
  price_pesewas: number;
  price_state: "fixed" | "negotiable";
  car_label: string;
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

/** The columns a transition is allowed to set alongside the status itself. */
export type CarOrderStatusPatch = Partial<
  Pick<CarOrderRow, "payment_id" | "paid_at" | "cancelled_at" | "cancel_reason">
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
    car_label: String(row.car_label),
    status: row.status as CarOrderStatus,
    payment_id: (row.payment_id as string | null) ?? null,
    paid_at: (row.paid_at as string | null) ?? null,
    cancelled_at: (row.cancelled_at as string | null) ?? null,
    cancel_reason: (row.cancel_reason as string | null) ?? null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}
