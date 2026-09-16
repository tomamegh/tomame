/**
 * Buying a car: the shapes, the state machine, and the one payability rule
 * (migration 068).
 *
 * PURE, on the same contract as `src/features/orders/services/order-transitions.ts`
 * and `journey-stage.ts`: no `server-only`, no Supabase, no React, no `env`.
 * That purity is what lets all three of `db/queries/car-orders.ts`,
 * `features/cars/services/car-orders.service.ts` and
 * `features/payments/services/payments.service.ts` share this module without
 * anyone importing `lib/supabase/admin.ts` into something that must not have
 * it. It is also what keeps an admin console able to draw its buttons from the
 * same table the service validates against, rather than from a copy kept in
 * step by a comment — which is the drift `order-transitions.ts` was extracted
 * to end.
 *
 * It lives beside `features/cars/types.ts` rather than inside it because that
 * barrel is 067's, and the two are edited by different hands. Import it by its
 * own path: `@/features/cars/car-orders.types`.
 *
 * MONEY IS IN PESEWAS (GHS x 100), as integers, matching `payments.amount`
 * (005) and `car_listings.price_pesewas` (067). CLAUDE.md: payment amounts are
 * in pesewas.
 */

import { CAR_PRICE_STATES, type CarPriceState } from "@/config/constants";

// ── Statuses ────────────────────────────────────────────────────────────────

/**
 * The states a car order can be in.
 *
 * `PENDING_PAYMENT` is spelled out rather than borrowing `orders`' shorter
 * `pending`. 068 is a new table with no legacy spelling to honour, so it uses
 * CLAUDE.md's own word and nobody has to be told that two names mean one thing.
 */
export const CAR_ORDER_STATUSES = {
  PENDING_PAYMENT: "pending_payment",
  /**
   * The Paystack DEPOSIT has settled: the car is reserved, the commitment is
   * real, and the balance has not arrived yet (069).
   *
   * NOT "PARTIALLY PAID" AND NOT "RESERVED". The word matters because two
   * different things are true at once and only one of them is about money —
   * a customer here has paid us and does not yet own the car outright. Every
   * screen that renders this state has to say both halves.
   */
  DEPOSIT_PAID: "deposit_paid",
  /** FULLY paid, from 069: the deposit settled AND the balance was recorded. */
  PAID: "paid",
  PROCESSING: "processing",
  IN_TRANSIT: "in_transit",
  DELIVERED: "delivered",
  CANCELLED: "cancelled",
} as const;

export type CarOrderStatus =
  (typeof CAR_ORDER_STATUSES)[keyof typeof CAR_ORDER_STATUSES];

// ── The state machine ───────────────────────────────────────────────────────

/**
 * The car order state machine's edges — the ONE table.
 *
 * CLAUDE.md's machine, transposed onto this table, with 069's extra step:
 *
 * ```
 * pending_payment → deposit_paid → paid → processing → in_transit → delivered
 * pending_payment → cancelled (only if payment fails)
 * ```
 *
 * `pending_payment → paid` IS STILL HERE ALONGSIDE THE DEPOSIT EDGE, and it is
 * not a leftover. A deposit of 100% — the admin setting turned all the way up,
 * which is 068's model exactly — leaves a balance of zero, and routing that
 * through `deposit_paid` would strand the car waiting for somebody to record a
 * payment of GH₵0 that nobody will ever make. `settleCarOrder` picks the edge
 * from the SNAPSHOTTED balance on the row, so the choice is made from what the
 * customer was actually charged rather than from what the setting says today.
 *
 * `cancelled` is reachable ONLY from `pending_payment`, and 069 does not widen
 * that. A `deposit_paid` car has taken a customer's money: unwinding it is a
 * refund, which is `releaseCarOrder` — an admin, a written reason, and a
 * separate audit action — never an edge a sweep can walk.
 *
 * `delivered` and `cancelled` are absent as keys by design: they are ends of the
 * line, and a status with no entry here offers nothing.
 *
 * ONE DIFFERENCE FROM `ALLOWED_TRANSITIONS` IN `order-transitions.ts`, AND IT IS
 * DELIBERATE. That table lists only the edges an ADMIN may take, so
 * `pending → paid` is missing from it: an order becomes paid because money
 * arrived, never because somebody pressed a button. This table lists the WHOLE
 * machine — including `pending_payment → paid` — because the payment path needs
 * a single place to ask "is this move legal?" too, and a machine with a hole in
 * it is not a machine. `adminCarOrderTransitionsFrom` is what a console must
 * draw its buttons from; it subtracts the edges only the money path may take, so
 * no admin screen can ever offer "Mark as paid" on a car nobody has paid for.
 */
export const CAR_ORDER_ALLOWED_TRANSITIONS = {
  pending_payment: ["deposit_paid", "paid", "cancelled"],
  deposit_paid: ["paid"],
  paid: ["processing"],
  processing: ["in_transit"],
  in_transit: ["delivered"],
} as const satisfies Record<string, readonly CarOrderStatus[]>;

/**
 * Edges that a plain status button may never take, keyed `from→to`.
 *
 * EACH ONE REQUIRES EVIDENCE THAT A STATUS CHANGE DOES NOT CARRY, which is the
 * single rule behind all three:
 *
 *   * `pending_payment → deposit_paid` and `pending_payment → paid` belong to
 *     `settleCarOrder` and to nothing else. That is the moment a customer's
 *     money became ours, and it is written only by the code that verified the
 *     charge with Paystack.
 *   * `deposit_paid → paid` is a HUMAN's move — an admin recording a bank
 *     transfer — and it is still listed here, deliberately. It needs an amount:
 *     `recordCarBalancePayment` requires the figure received, checks it against
 *     the outstanding balance and writes it to the row. A console offering
 *     "Mark as paid" beside "Mark as processing" would let somebody declare a
 *     GH₵180,000 balance settled with one click and no number, which is the
 *     whole failure this separation prevents.
 *
 * `adminCarOrderTransitionsFrom` subtracts these, so a screen drawing its
 * buttons from it cannot offer any of them.
 */
const SYSTEM_ONLY_EDGES: ReadonlySet<string> = new Set([
  `${CAR_ORDER_STATUSES.PENDING_PAYMENT}→${CAR_ORDER_STATUSES.DEPOSIT_PAID}`,
  `${CAR_ORDER_STATUSES.PENDING_PAYMENT}→${CAR_ORDER_STATUSES.PAID}`,
  `${CAR_ORDER_STATUSES.DEPOSIT_PAID}→${CAR_ORDER_STATUSES.PAID}`,
]);

export type CarOrderTransitionDestination =
  (typeof CAR_ORDER_ALLOWED_TRANSITIONS)[keyof typeof CAR_ORDER_ALLOWED_TRANSITIONS][number];

/**
 * The statuses reachable from `status`, or an empty list for a terminal or
 * unrecognised one.
 *
 * `Object.hasOwn` rather than `?? []` is load-bearing, for the reason
 * `allowedTransitionsFrom` spells out at length: a plain object literal inherits
 * from `Object.prototype`, so `CAR_ORDER_ALLOWED_TRANSITIONS["toString"]` is a
 * FUNCTION, not `undefined`, and `?? []` would hand it straight back. A status
 * arriving here is a string from a database column or a URL, not a value this
 * module chose.
 */
export function allowedCarOrderTransitionsFrom(
  status: string,
): readonly CarOrderTransitionDestination[] {
  return Object.hasOwn(CAR_ORDER_ALLOWED_TRANSITIONS, status)
    ? CAR_ORDER_ALLOWED_TRANSITIONS[status as keyof typeof CAR_ORDER_ALLOWED_TRANSITIONS]
    : [];
}

/** Is this move one the machine allows at all, whoever is asking? */
export function isAllowedCarOrderTransition(from: string, to: string): boolean {
  return (allowedCarOrderTransitionsFrom(from) as readonly string[]).includes(to);
}

/**
 * The same, minus the edges only the payment path may take — what a console
 * draws its buttons from.
 */
export function adminCarOrderTransitionsFrom(
  status: string,
): readonly CarOrderTransitionDestination[] {
  return allowedCarOrderTransitionsFrom(status).filter(
    (to) => !SYSTEM_ONLY_EDGES.has(`${status}→${to}`),
  );
}

// ── Rows ────────────────────────────────────────────────────────────────────

/**
 * Where the agreed price came from (069).
 *
 * `accepted_offer` carries the customer's OWN figure (`offer_pesewas`), not the
 * one we countered with — a counter is an answer, not an acceptance.
 */
export const CAR_PRICE_SOURCES = {
  LISTING: "listing",
  QUOTE: "quote",
  ACCEPTED_OFFER: "accepted_offer",
} as const;

export type CarPriceSource =
  (typeof CAR_PRICE_SOURCES)[keyof typeof CAR_PRICE_SOURCES];

/** A `car_orders` row, verbatim. */
export interface CarOrderRow {
  id: string;
  car_listing_id: string;
  user_id: string;
  /**
   * The FULL agreed price, snapshotted at purchase. NEVER re-read from the
   * listing — and from 069 it is not always the listing's figure at all: a
   * customer with a quote or an accepted offer owes THEIR number.
   */
  price_pesewas: number;
  /**
   * Which of 067's price states it was bought under. `on_request` is admitted
   * from 069 and only ever appears with a `price_source` other than `listing`:
   * such a listing carries no public price to buy at.
   */
  price_state: CarPriceState;
  /** Where `price_pesewas` came from, so a dispute needs no join (069). */
  price_source: CarPriceSource;
  /** The enquiry carrying the agreed figure. Null iff `price_source` is `listing`. */
  car_enquiry_id: string | null;
  /** "2019 Toyota Highlander XLE", as it read on the day. */
  car_label: string;
  /** What Paystack was asked for up front, snapshotted at checkout (069). */
  deposit_pesewas: number;
  /** The whole-percent setting that produced it. 100 on every pre-069 row. */
  deposit_percent: number;
  /** `price_pesewas - deposit_pesewas`, computed by the database. Never written. */
  balance_pesewas: number;
  status: CarOrderStatus;
  payment_id: string | null;
  /** When the Paystack deposit settled. */
  deposit_paid_at: string | null;
  /** When the car became FULLY paid — i.e. when the balance was recorded. */
  paid_at: string | null;
  /** The figure an admin recorded as received offline. */
  balance_amount_pesewas: number | null;
  /** How it arrived: "MTN transfer, ref 88213". Free text, never parsed. */
  balance_note: string | null;
  balance_recorded_by: string | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * What a customer's screen is allowed to see.
 *
 * `payment_id` is internal. `balance_recorded_by` is dropped for the same kind
 * of reason from 069: it names the member of staff who receipted the transfer,
 * which is our business, not the buyer's — and an account id is not something to
 * hand out because a field happened to be on the row. Everything else, including
 * the price, the deposit and what is left to pay, is the customer's own fact.
 */
export type CarOrderView = Omit<CarOrderRow, "payment_id" | "balance_recorded_by">;

/** Row to view. The one place the internal columns are dropped. */
export function toCarOrderView(row: CarOrderRow): CarOrderView {
  const { payment_id: _paymentId, balance_recorded_by: _recordedBy, ...rest } = row;
  return rest;
}

// ── Payability ──────────────────────────────────────────────────────────────

/**
 * Why this car order cannot be charged, or null when it can.
 *
 * ITS OWN PREDICATE, NOT `isPayablePricing`. The order path's
 * `chargeBlockedReason` asks whether `order.pricing` is a real
 * `PricingBreakdown` struck by `src/lib/pricing/calculator.ts` — a structure
 * with a pricing method, a freight shape and an exchange rate in it. A car price
 * is four quotes a buyer typed (067 is emphatic that the calculator has never
 * seen a bill of lading and must not be asked to guess at one), so there is no
 * breakdown to hand it.
 *
 * THE TEMPTING WRONG MOVE IS TO SYNTHESISE ONE — build a `PricingBreakdown`
 * literal around the car's total so the existing predicate passes.
 * `src/lib/pricing/payable.ts`'s own doc comment catalogues three production
 * bugs caused by exactly that, and this is a five-figure charge. Two different
 * kinds of price get two different predicates, and each one asks the question
 * that is actually true of its own data.
 *
 * What is actually true here is short, which is the whole argument for a
 * separate function rather than a widened one:
 *
 *   - it must still be awaiting payment. `paid` is reported separately from the
 *     other statuses because "you have already paid for this" and "this order is
 *     not awaiting payment" are different sentences to a customer. From 069
 *     `deposit_paid` falls into the second group on purpose: a car whose deposit
 *     has landed is not chargeable again through Paystack at all, because the
 *     balance is settled offline and recorded by an admin;
 *   - the DEPOSIT must carry a real, positive, whole-pesewa figure no larger
 *     than the price. The columns are `INTEGER NOT NULL` with a CHECK saying
 *     exactly that, so this can only fail if something wrote around the
 *     database — and at the moment money moves, a belt as well as braces costs
 *     nothing.
 *
 * WHAT IS CHECKED IS `deposit_pesewas`, NOT `price_pesewas`, BECAUSE THE DEPOSIT
 * IS WHAT PAYSTACK IS ASKED FOR (069). Checking the price instead would pass a
 * row whose deposit was somehow zero and then send Paystack a charge for
 * nothing.
 *
 * Note what is NOT asked: whether the LISTING is still published, still priced
 * the same, or even still exists. None of those may block a charge, because the
 * price being charged is the snapshot on this row and the customer agreed to it.
 * The listing's state is checked once, at checkout, before the snapshot is taken.
 */
export function carChargeBlockedReason(
  carOrder: Pick<CarOrderRow, "status" | "price_pesewas" | "deposit_pesewas">,
): "paid" | "not_awaiting_payment" | "unpriced" | null {
  if (carOrder.status === CAR_ORDER_STATUSES.PAID) return "paid";
  if (carOrder.status !== CAR_ORDER_STATUSES.PENDING_PAYMENT) return "not_awaiting_payment";
  if (!Number.isInteger(carOrder.price_pesewas) || carOrder.price_pesewas <= 0) return "unpriced";
  if (
    !Number.isInteger(carOrder.deposit_pesewas) ||
    carOrder.deposit_pesewas <= 0 ||
    carOrder.deposit_pesewas > carOrder.price_pesewas
  ) {
    return "unpriced";
  }
  return null;
}

/**
 * Can this listing be bought at all, by THIS customer, as things stand?
 *
 * Checked ONCE, at checkout, before the price is snapshotted — and never again,
 * for the reason `carChargeBlockedReason` gives.
 *
 * `agreedPesewas` IS THE FIX FOR A LIVE PRODUCTION DEFECT (069), AND THE WHOLE
 * REASON THIS FUNCTION TAKES A SECOND ARGUMENT. The version before it refused
 * every `on_request` listing outright, on the argument that such a listing
 * carries no price so buying it could only mean charging zero. True of the
 * LISTING; false of the CUSTOMER. 067 exists to let an admin answer a price
 * request with a figure, and the moment they do, that customer has a price —
 * privately, which is the point of quoting rather than publishing. Under the old
 * rule they were then locked out of paying it: on production a Mercedes E300 sat
 * quoted at GH₵120,000 with no way to buy it.
 *
 * So the question is no longer "does this listing have a public price?" but "is
 * there a figure this customer has agreed to?", and an unpriced listing is only
 * refused when there is no such figure. `agreedPesewas` is resolved SERVER-SIDE
 * from the session's user id against their own `car_enquiries` row; it is never
 * anything a browser sent.
 *
 * WHEN AN AGREED FIGURE EXISTS IT WINS EVEN OVER A PUBLISHED PRICE. An accepted
 * offer of GH₵164,500 on a GH₵212,000 car is the price for that customer; the
 * alternative — accepting an offer and then charging the asking price — is
 * taking GH₵47,500 nobody agreed to.
 *
 * The listing must still be PUBLISHED whatever was agreed: an unpublished
 * listing is a draft or a withdrawn vehicle, and a stale quote must not be a way
 * to buy one.
 */
export function listingPurchaseBlockedReason(
  listing: {
    is_published: boolean;
    price_state: CarPriceState;
    price_pesewas: number | null;
  },
  agreedPesewas: number | null = null,
): "unpublished" | "on_request" | "unpriced" | null {
  if (!listing.is_published) return "unpublished";

  const agreed = isUsablePesewas(agreedPesewas) ? agreedPesewas : null;
  if (agreed !== null) return null;

  // No agreed figure: fall back to the public price, exactly as before 069.
  if (listing.price_state === CAR_PRICE_STATES.ON_REQUEST) return "on_request";
  if (!isUsablePesewas(listing.price_pesewas)) return "unpriced";
  return null;
}

/** A real, positive, whole-pesewa amount — the only kind that may be charged. */
function isUsablePesewas(value: number | null): value is number {
  return value !== null && Number.isInteger(value) && value > 0;
}

// ── The deposit (069) ───────────────────────────────────────────────────────

/**
 * `site_settings` key holding the deposit percentage, seeded by 069.
 *
 * Read through `getSiteSettingsMap` — the same cookieless path
 * `payment_expiry_minutes` is read on — and the row is `is_public` because "pay
 * 30% now" is a term of sale a customer is told before they press Buy.
 */
export const CAR_DEPOSIT_PERCENT_KEY = "car_deposit_percent";

/**
 * What the deposit is when the setting is missing, unreadable or nonsense.
 *
 * 30, NOT 100, AND THE DIRECTION OF THAT FALLBACK IS THE POINT. Failing open at
 * "charge the whole car" would ask a Mobile Money wallet for GH₵258,000 — the
 * exact transaction Ghanaian per-transaction and daily ceilings make impossible,
 * and the reason 069 exists. A deposit path that silently reverts to full
 * payment when a settings read fails is a checkout that stops working for
 * everybody, quietly, on a bad database day. So the fallback is the intended
 * behaviour and the failure is logged.
 */
export const DEFAULT_CAR_DEPOSIT_PERCENT = 30;

/**
 * The setting, narrowed to a whole percentage between 1 and 100.
 *
 * `site_settings.value` is JSONB and comes back as `unknown`: a number today, a
 * string `"30"` the moment somebody edits it through a form, and `null` if the
 * row was never seeded. All three are handled; anything else — 0, 130, "a
 * third", an object — falls back, because a deposit of zero pesewas reserves a
 * car for nothing and a deposit above the price is a charge the CHECK would
 * refuse anyway.
 */
export function normalizeCarDepositPercent(value: unknown): number {
  const parsed = typeof value === "string" ? Number(value.trim()) : value;
  if (typeof parsed !== "number" || !Number.isFinite(parsed)) {
    return DEFAULT_CAR_DEPOSIT_PERCENT;
  }
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 100) {
    return DEFAULT_CAR_DEPOSIT_PERCENT;
  }
  return parsed;
}

/**
 * The deposit for a price, in WHOLE PESEWAS.
 *
 * NEVER `Math.round(cedis * 100)`. Everything here is integer pesewas from end
 * to end — `price` is the column, `percent` is a whole number — so the product
 * is exact and the only rounding is the single division below. Building the
 * figure by converting to cedis first is how GH₵77,400.005 becomes GH₵77,400.01
 * in one place and GH₵77,400.00 in another, and then the balance no longer adds
 * up to the price. (`price × percent` tops out around 2.6e9 for a GH₵260,000
 * car: exact in a double by a wide margin.)
 *
 * ROUNDED UP, by at most one pesewa. Two reasons, both small and both one-way:
 * a deposit is never zero however cheap the car or however low the percentage,
 * and the rounding error lands on the deposit rather than on the balance an
 * admin has to collect in person. Clamped to the price so 100% is exactly the
 * price and never a pesewa more.
 */
export function carDepositPesewas(pricePesewas: number, percent: number): number {
  const deposit = Math.ceil((pricePesewas * percent) / 100);
  return Math.min(Math.max(deposit, 1), pricePesewas);
}

// ── What a car page and the checkout both price from (069) ──────────────────

/**
 * The terms of THIS customer's purchase of THIS car: the full price, what
 * Paystack is asked for now, what is left to settle offline, and where the
 * figure came from.
 *
 * ONE SHAPE FOR THE SCREEN AND THE CHARGE, which is the point of putting it
 * here. The car page shows "GH₵120,000 — pay GH₵36,000 now" and the checkout
 * charges GH₵36,000; both come from `getCarPurchaseTerms`, so a customer cannot
 * be shown one number and billed another. What the browser sends back is still a
 * listing id and nothing else.
 *
 * `buyable` IS FALSE, NOT AN ABSENT OBJECT, when there is nothing agreed on an
 * `on_request` car — the page still has to render, and it renders "Ask us for a
 * price". A caller that ignores `buyable` and prints `payablePesewas` will print
 * a zero; check the flag.
 */
export interface CarPurchaseTerms {
  /** The full agreed price. */
  payablePesewas: number;
  /** What Paystack is asked for now. */
  depositPesewas: number;
  /** `payablePesewas - depositPesewas`, settled offline and recorded by an admin. */
  balancePesewas: number;
  source: CarPriceSource;
  /** False when nothing has been agreed and the listing carries no price. */
  buyable: boolean;
}
