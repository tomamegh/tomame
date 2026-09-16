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
 * CLAUDE.md's machine, transposed onto this table:
 *
 * ```
 * pending_payment → paid → processing → in_transit → delivered
 * pending_payment → cancelled (only if payment fails)
 * ```
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
  pending_payment: ["paid", "cancelled"],
  paid: ["processing"],
  processing: ["in_transit"],
  in_transit: ["delivered"],
} as const satisfies Record<string, readonly CarOrderStatus[]>;

/**
 * Edges no human may take, keyed `from→to`.
 *
 * `pending_payment → paid` belongs to `settleCarOrder` and to nothing else. It
 * is the moment a customer's money became ours, and it is written only by the
 * code that verified that money with Paystack.
 */
const SYSTEM_ONLY_EDGES: ReadonlySet<string> = new Set([
  `${CAR_ORDER_STATUSES.PENDING_PAYMENT}→${CAR_ORDER_STATUSES.PAID}`,
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

/** A `car_orders` row, verbatim. */
export interface CarOrderRow {
  id: string;
  car_listing_id: string;
  user_id: string;
  /** The agreed price, snapshotted at purchase. NEVER re-read from the listing. */
  price_pesewas: number;
  /** Which of 067's price states it was bought under. Never `on_request`. */
  price_state: Extract<CarPriceState, "fixed" | "negotiable">;
  /** "2019 Toyota Highlander XLE", as it read on the day. */
  car_label: string;
  status: CarOrderStatus;
  payment_id: string | null;
  paid_at: string | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
  created_at: string;
  updated_at: string;
}

/** What a screen is allowed to see. Identical today; the seam is the point. */
export type CarOrderView = Omit<CarOrderRow, "payment_id">;

/** Row to view. The one place the payment id is dropped. */
export function toCarOrderView(row: CarOrderRow): CarOrderView {
  const { payment_id: _paymentId, ...rest } = row;
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
 *     not awaiting payment" are different sentences to a customer;
 *   - the snapshot must carry a real, positive, whole-pesewa figure. The column
 *     is `INTEGER NOT NULL CHECK (> 0)`, so this can only fail if something
 *     wrote around the database — and at the moment money moves, a belt as well
 *     as braces costs nothing.
 *
 * Note what is NOT asked: whether the LISTING is still published, still priced
 * the same, or even still exists. None of those may block a charge, because the
 * price being charged is the snapshot on this row and the customer agreed to it.
 * The listing's state is checked once, at checkout, before the snapshot is taken.
 */
export function carChargeBlockedReason(
  carOrder: Pick<CarOrderRow, "status" | "price_pesewas">,
): "paid" | "not_awaiting_payment" | "unpriced" | null {
  if (carOrder.status === CAR_ORDER_STATUSES.PAID) return "paid";
  if (carOrder.status !== CAR_ORDER_STATUSES.PENDING_PAYMENT) return "not_awaiting_payment";
  if (!Number.isInteger(carOrder.price_pesewas) || carOrder.price_pesewas <= 0) return "unpriced";
  return null;
}

/**
 * Can this listing be bought at all, as it stands right now?
 *
 * Checked ONCE, at checkout, before the price is snapshotted — and never again,
 * for the reason `carChargeBlockedReason` gives.
 *
 * `on_request` is the case this exists for. 067's
 * `car_listings_price_state_has_price` guarantees such a listing carries no
 * price, so "buy it now" against one could only mean charging zero or charging a
 * number nobody quoted. It is a conversation (`car_enquiries`), not a purchase,
 * and 068's `price_state` CHECK makes a car order that says otherwise
 * unrepresentable. This is the sentence the customer reads instead of hitting
 * that constraint.
 */
export function listingPurchaseBlockedReason(
  listing: {
    is_published: boolean;
    price_state: CarPriceState;
    price_pesewas: number | null;
  },
): "unpublished" | "on_request" | "unpriced" | null {
  if (!listing.is_published) return "unpublished";
  if (listing.price_state === CAR_PRICE_STATES.ON_REQUEST) return "on_request";
  if (
    listing.price_pesewas === null ||
    !Number.isInteger(listing.price_pesewas) ||
    listing.price_pesewas <= 0
  ) {
    return "unpriced";
  }
  return null;
}
