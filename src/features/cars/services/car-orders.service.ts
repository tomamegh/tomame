import "server-only";

import { getCarListingById } from "@/db/queries/cars";
import {
  CarAlreadySoldError,
  findLiveCarOrderForListing,
  getCarOrderById,
  insertCarOrder,
  listCarOrdersForUser,
  updateCarOrderStatus,
} from "@/db/queries/car-orders";
import { AUDIT_ACTOR_ROLES, AUDIT_ENTITY_TYPES } from "@/config/constants";
import { logAuditEvent } from "@/features/audit/services/audit.service";
import { initializePayment } from "@/features/payments/services/payments.service";
import { APIError } from "@/lib/auth/api-helpers";
import { logger } from "@/lib/logger";
import type { PlatformUser } from "@/features/users/types";
import { carTitle } from "../format";
import type { CarListingRow } from "../types";
import {
  CAR_ORDER_STATUSES,
  isAllowedCarOrderTransition,
  listingPurchaseBlockedReason,
  toCarOrderView,
  type CarOrderRow,
  type CarOrderStatus,
  type CarOrderView,
} from "../car-orders.types";
import type { CarCheckoutInput } from "../car-orders.schema";

/**
 * Buying a car (migration 068) — the business logic 067 deliberately left out.
 *
 * THE DECISION 067 WAS WAITING ON: full pre-payment, no deposits. One car, one
 * charge, paid in full. The migration header argues it at length; the short
 * version is that a deposit needs several successful payments against one
 * target, which is exactly what `assertNoActivePayment` refuses, and that guard
 * is what stops every customer in this product being charged twice. Nothing
 * here half-permits an instalment.
 *
 * THREE THINGS THIS FILE IS RESPONSIBLE FOR, and they are all about the price:
 *
 *   1. THE CLIENT SENDS A LISTING ID AND NOTHING ELSE. The price is read here,
 *      server-side, from `car_listings`, and copied onto the `car_orders` row.
 *      CLAUDE.md: never trust the client — no client-provided price totals.
 *   2. THE SNAPSHOT IS THEN FINAL. `payments.service.ts` charges
 *      `car_orders.price_pesewas` and never looks at the listing again, because
 *      a buyer correcting a freight quote between "Buy" and the Paystack
 *      callback must not change what a customer is charged.
 *   3. AN `on_request` CAR CANNOT BE BOUGHT. 067's
 *      `car_listings_price_state_has_price` guarantees such a listing carries no
 *      price at all, so a purchase against one could only mean charging zero. It
 *      is refused with a sentence here, and 068's `price_state` CHECK makes the
 *      row unrepresentable even if this check were removed.
 *
 * AND THE RACE IT DOES NOT TRY TO WIN. A car is one physical object, and two
 * customers pressing Buy in the same second is what happens to the one good
 * listing on the site. The read below cannot settle that — both requests read
 * "no order yet" before either writes — so it is used only to produce a better
 * sentence, and the ARBITER is `uq_car_orders_live`, which refuses the second
 * insert and arrives here as `CarAlreadySoldError`.
 *
 * Layering: routes authenticate, rate-limit and shape responses; the reads and
 * writes are `db/queries/car-orders`; nothing here touches an HTTP object.
 */

/** What `/api/cars/checkout` answers with. */
export interface CarCheckoutResult {
  authorizationUrl: string;
  reference: string;
}

/**
 * Reserve the car and open a Paystack transaction for the whole of its price.
 *
 * The order of operations matters and is not arbitrary. The listing is checked
 * and the row is written BEFORE Paystack is called, so the reservation exists
 * before any money can move — the reverse order would let two customers both
 * reach a checkout page for one vehicle and discover the clash only after one of
 * them had paid.
 */
export async function startCarCheckout(
  user: PlatformUser,
  input: CarCheckoutInput,
): Promise<CarCheckoutResult> {
  const listing = await getCarListingById(input.carListingId);
  // A listing that does not exist is a 404; one that exists but is not for sale
  // is a 409, which is the contract this endpoint publishes. The messages are
  // all in the customer's own terms — nothing here names a column or a state.
  if (!listing) throw new APIError(404, "We could not find that car.");

  const blocked = listingPurchaseBlockedReason(listing);
  if (blocked === "unpublished") {
    throw new APIError(409, "This car is not available to buy right now.");
  }
  if (blocked === "on_request") {
    throw new APIError(
      409,
      "This car is priced on request. Ask us for a price and we will come back to you with a figure.",
    );
  }
  if (blocked === "unpriced") {
    // Unreachable while 067's `car_listings_price_state_has_price` holds — a
    // `fixed` or `negotiable` listing always carries a price. Kept because the
    // alternative to an explicit refusal at this line is a charge of zero.
    logger.error("A purchasable car listing has no usable price", {
      carListingId: listing.id,
      priceState: listing.price_state,
    });
    throw new APIError(409, "This car is not available to buy right now.");
  }

  const carOrder = await claimCar(user, listing);

  // One transaction, for the whole of the snapshot. `initializePayment` re-reads
  // the car order it is given and refuses a second live charge against it
  // (`assertNoActivePayment`), which is what makes a double-submitted checkout a
  // 409 rather than two Paystack transactions for one vehicle.
  const { payment, authorizationUrl } = await initializePayment(user, {
    carOrderId: carOrder.id,
  });

  return { authorizationUrl, reference: payment.reference };
}

/**
 * Get the `car_orders` row this checkout will charge — a new one, or the
 * customer's own unfinished one.
 *
 * REUSING THE CUSTOMER'S OWN PENDING ORDER IS NOT A CONVENIENCE, IT IS THE ONLY
 * WAY A RETRY CAN WORK. `uq_car_orders_live` covers every state except
 * `cancelled`, so once a customer has a `pending_payment` row for a car, no
 * second row can ever be inserted for it. If a failed card left that row behind
 * and this function always inserted, the customer would be locked out of the car
 * they were halfway through buying — permanently, by the very index that
 * protects them from being charged twice. So: their own pending order is handed
 * back and charged again. `assertNoActivePayment` one layer down is what stops
 * that becoming a second simultaneous transaction.
 *
 * Somebody else's live order is a 409 whatever state it is in, and the message
 * does not distinguish "reserved" from "sold": both mean the same thing to the
 * customer reading it, and the difference is somebody else's business.
 */
async function claimCar(user: PlatformUser, listing: CarListingRow): Promise<CarOrderRow> {
  const live = await findLiveCarOrderForListing(listing.id);

  if (live) {
    if (live.user_id !== user.id) {
      /*
        RESERVED IS NOT SOLD, AND SAYING SO COSTS SALES. A `pending_payment`
        row is somebody part-way through Paystack who may well never finish;
        the sweep releases the car about an hour after their payment is
        released. Telling the next buyer it is "sold" writes the car off in
        their head for a vehicle that is very often free again minutes later.
        Anything past `pending_payment` really is sold, and says so.

        Neither branch says who the other customer is, or when they started.
      */
      throw new APIError(
        409,
        live.status === CAR_ORDER_STATUSES.PENDING_PAYMENT
          ? "Someone is checking out with this car right now. If they do not finish, it will be back shortly, so do check again."
          : "This car has already been sold.",
      );
    }
    if (live.status !== CAR_ORDER_STATUSES.PENDING_PAYMENT) {
      throw new APIError(409, "You have already paid for this car.");
    }
    return live;
  }

  try {
    const created = await insertCarOrder({
      car_listing_id: listing.id,
      user_id: user.id,
      // THE PRICE, READ SERVER-SIDE AND SNAPSHOTTED. `listingPurchaseBlockedReason`
      // has already established it is a positive integer; the non-null assertion
      // is that check's conclusion, not an assumption.
      price_pesewas: listing.price_pesewas!,
      price_state: listing.price_state as "fixed" | "negotiable",
      car_label: carTitle(listing),
    });

    await logAuditEvent({
      actorId: user.id,
      actorRole: AUDIT_ACTOR_ROLES.USER,
      action: "car_order_created",
      entityType: AUDIT_ENTITY_TYPES.CAR_ORDER,
      entityId: created.id,
      metadata: {
        carListingId: listing.id,
        slug: listing.slug,
        carLabel: created.car_label,
        // Both figures, so a later dispute can be settled without a join: what
        // the listing said at the moment of sale, and what was snapshotted. They
        // are the same number today and this is where it would show if they ever
        // were not.
        pricePesewas: created.price_pesewas,
        listingPricePesewas: listing.price_pesewas,
        priceState: created.price_state,
      },
    });

    return created;
  } catch (error) {
    // The race, settled by the database rather than by the read above: another
    // customer's insert landed between our SELECT and ours. Theirs stands.
    if (error instanceof CarAlreadySoldError) {
      logger.warn("Two customers reached checkout for one car; the index settled it", {
        carListingId: listing.id,
        userId: user.id,
      });
      throw new APIError(409, "This car has already been sold.");
    }
    throw error;
  }
}

/**
 * Release a car that was never paid for: pending_payment → cancelled.
 *
 * THE RELEASE VALVE FOR `uq_car_orders_live`, and the reason `cancelled` is the
 * one state that index excludes. An abandoned checkout leaves a
 * `pending_payment` row holding a vehicle nobody is buying, and until it is
 * cancelled no other customer can be sold that car. Cancelling is therefore not
 * housekeeping — it is putting the car back on the market.
 *
 * CANCELLABLE ONLY FROM `pending_payment`, checked against the shared
 * transitions table and then enforced again by the guarded UPDATE. Unwinding a
 * car that has been PAID for is a refund: money has to move back, and that is a
 * decision with a person in it, not a status change.
 *
 * Returns false when the row had already moved on — the same
 * compare-and-set contract `settleCarOrder` reads, so a sweep and an admin
 * pressing the button at once produce one cancellation and one audit row.
 */
export async function cancelCarOrder(
  actor: { id: string | null; role: "user" | "admin" | "system" },
  carOrderId: string,
  reason: string,
): Promise<boolean> {
  const carOrder = await getCarOrderById(carOrderId);
  if (!carOrder) throw new APIError(404, "Car order not found");

  if (!isAllowedCarOrderTransition(carOrder.status, CAR_ORDER_STATUSES.CANCELLED)) {
    throw new APIError(
      400,
      carOrder.status === CAR_ORDER_STATUSES.CANCELLED
        ? "This car order is already cancelled."
        : "A car order that has been paid for cannot be cancelled. It needs a refund.",
    );
  }

  const cancelled = await updateCarOrderStatus(
    carOrderId,
    CAR_ORDER_STATUSES.PENDING_PAYMENT,
    CAR_ORDER_STATUSES.CANCELLED,
    { cancelled_at: new Date().toISOString(), cancel_reason: reason },
  );
  if (!cancelled) return false;

  await logAuditEvent({
    actorId: actor.id,
    actorRole: actor.role,
    action: "car_order_cancelled",
    entityType: AUDIT_ENTITY_TYPES.CAR_ORDER,
    entityId: carOrderId,
    metadata: {
      from: CAR_ORDER_STATUSES.PENDING_PAYMENT,
      to: CAR_ORDER_STATUSES.CANCELLED,
      carListingId: carOrder.car_listing_id,
      reason,
    },
  });
  return true;
}

/**
 * The customer's own purchases.
 *
 * Filtered by `user_id` HERE rather than relying on 068's `car_orders owner
 * read` policy, for the reason `db/queries/cars.ts` gives about published
 * listings: the query layer holds a service-role client that bypasses RLS, so a
 * promise a policy makes is not a promise made to this code path.
 */
export async function listMyCarOrders(user: PlatformUser): Promise<CarOrderView[]> {
  const rows = await listCarOrdersForUser(user.id);
  return rows.map(toCarOrderView);
}

/** One of the customer's own purchases, or a 404 if it is not theirs. */
export async function getMyCarOrder(user: PlatformUser, carOrderId: string): Promise<CarOrderView> {
  const row = await getCarOrderById(carOrderId);
  // Someone else's purchase is indistinguishable from a missing one: a 403
  // would confirm the id names a real sale.
  if (!row || row.user_id !== user.id) throw new APIError(404, "Car order not found");
  return toCarOrderView(row);
}

/** Re-exported so a console can reach the machine without the query layer. */
export type { CarOrderStatus };

/**
 * Put a car back on the market after a sale has fallen through. ADMIN ONLY.
 *
 * WHY THIS IS NOT `cancelCarOrder`. `uq_car_orders_live` covers every status
 * except `cancelled`, and the state machine only allows `cancelled` from
 * `pending_payment`. Those two together mean a car that was actually PAID for
 * could never return to sale: a refund, a vehicle damaged on the water, a buyer
 * who walks away, and that listing is unsellable to anybody, forever, with no
 * action in the product that fixes it. `cancelCarOrder`'s own refusal says "it
 * needs a refund" and then offers no way to record one. This is that way.
 *
 * IT IS DELIBERATELY A SECOND FUNCTION rather than a wider edge in
 * `CAR_ORDER_ALLOWED_TRANSITIONS`. The reconciliation sweep calls
 * `cancelCarOrder` unattended every five minutes, and the one thing that must
 * never happen is a job taking a paid car back off a customer. Keeping the
 * shared predicate narrow is what makes that impossible by construction; this
 * path is reachable only with an admin actor and a written reason.
 *
 * The money is NOT touched here. Refunding is a Paystack action somebody
 * performs deliberately; this records that the sale is over and frees the car.
 * The audit row is `car_order_released`, distinct from the automatic
 * `car_order_cancelled`, so "a human unwound a sale" is never confused with
 * "nobody ever paid".
 */
export async function releaseCarOrder(
  actor: { id: string | null; role: "admin" },
  carOrderId: string,
  reason: string,
): Promise<boolean> {
  const trimmed = reason.trim();
  if (!trimmed) throw new APIError(400, "Say why this sale is being unwound.");

  const carOrder = await getCarOrderById(carOrderId);
  if (!carOrder) throw new APIError(404, "Car order not found");
  if (carOrder.status === CAR_ORDER_STATUSES.CANCELLED) {
    throw new APIError(400, "This car order is already cancelled.");
  }

  // The CAS is against the status we just read, so a sale that moved on between
  // the read and the write is refused rather than silently unwound from a state
  // the admin never saw.
  const released = await updateCarOrderStatus(
    carOrderId,
    carOrder.status,
    CAR_ORDER_STATUSES.CANCELLED,
    { cancelled_at: new Date().toISOString(), cancel_reason: trimmed },
  );
  if (!released) return false;

  await logAuditEvent({
    actorId: actor.id,
    actorRole: AUDIT_ACTOR_ROLES.ADMIN,
    action: "car_order_released",
    entityType: AUDIT_ENTITY_TYPES.CAR_ORDER,
    entityId: carOrderId,
    metadata: {
      from: carOrder.status,
      to: CAR_ORDER_STATUSES.CANCELLED,
      carListingId: carOrder.car_listing_id,
      // The payment is left attached on purpose: the row is the record that
      // money was taken, and a refund is reconciled against it.
      paymentId: carOrder.payment_id,
      pricePesewas: carOrder.price_pesewas,
      reason: trimmed,
    },
  });
  return true;
}
