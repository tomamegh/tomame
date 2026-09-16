import "server-only";

import { getCarListingById } from "@/db/queries/cars";
import {
  CarAlreadySoldError,
  findLiveCarOrderForListing,
  getCarOrderById,
  insertCarOrder,
  listAgreedCarEnquiriesForUser,
  listCarOrdersForUser,
  updateCarOrderStatus,
} from "@/db/queries/car-orders";
import { getSiteSettingsMap } from "@/db/queries/site-settings";
import { AUDIT_ACTOR_ROLES, AUDIT_ENTITY_TYPES } from "@/config/constants";
import { logAuditEvent } from "@/features/audit/services/audit.service";
import { initializePayment } from "@/features/payments/services/payments.service";
import { APIError } from "@/lib/auth/api-helpers";
import { logger } from "@/lib/logger";
import type { PlatformUser } from "@/features/users/types";
import { carTitle } from "../format";
import type { CarListingRow } from "../types";
import {
  CAR_DEPOSIT_PERCENT_KEY,
  CAR_ORDER_STATUSES,
  CAR_PRICE_SOURCES,
  carDepositPesewas,
  DEFAULT_CAR_DEPOSIT_PERCENT,
  isAllowedCarOrderTransition,
  listingPurchaseBlockedReason,
  normalizeCarDepositPercent,
  toCarOrderView,
  type CarOrderRow,
  type CarOrderStatus,
  type CarOrderView,
  type CarPriceSource,
  type CarPurchaseTerms,
} from "../car-orders.types";
import type { CarEnquiryRow } from "../types";
import type { CarCheckoutInput } from "../car-orders.schema";

/**
 * Buying a car (migrations 068 and 069) — the business logic 067 left out.
 *
 * TWO DECISIONS, AND 069 REVERSED THE FIRST OF THEM.
 *
 * A DEPOSIT RESERVES THE CAR; THE BALANCE IS SETTLED OFFLINE. 068 said full
 * pre-payment, no deposits, and this file said so too. It was decided on the
 * shape of the code rather than the shape of the money: Ghanaian Mobile Money
 * wallets have per-transaction and daily ceilings far below a six-figure
 * vehicle, so one Paystack charge for GH₵258,000 is very likely impossible for
 * the customer to complete. So Paystack is asked for a DEPOSIT —
 * `car_deposit_percent`, 30 by default, computed here and snapshotted onto the
 * order — and the rest is paid by bank transfer or in person and RECORDED by an
 * admin through `recordCarBalancePayment`. There is still exactly one Paystack
 * transaction per car, which is why `assertNoActivePayment` is untouched and
 * still means what it always meant.
 *
 * THE AGREED FIGURE IS THAT CUSTOMER'S PRICE. 067 lets an admin answer a price
 * request with a quote and accept an offer; 068 then priced checkout from the
 * listing alone and never read `car_enquiries`. Both defects that follows were
 * live on production: an `on_request` car stayed unbuyable after it was quoted
 * (a Mercedes E300, quoted at GH₵120,000, with no way to pay), and an accepted
 * offer of GH₵164,500 on a GH₵212,000 car would have been charged at the asking
 * price. `getCarPurchaseTerms` is the one place that resolves it, and the car
 * page and the charge both read it so the customer cannot be shown one number
 * and billed another.
 *
 * FOUR THINGS THIS FILE IS RESPONSIBLE FOR, and they are all about the price:
 *
 *   1. THE CLIENT SENDS A LISTING ID AND NOTHING ELSE. Every figure — the price,
 *      the deposit, the balance — is decided here, server-side, and copied onto
 *      the `car_orders` row. CLAUDE.md: never trust the client, no
 *      client-provided price totals.
 *   2. THE AGREED PRICE IS PRIVATE TO ITS CUSTOMER. It is resolved from the
 *      SESSION's user id against their own `car_enquiries` rows, which is what
 *      makes two buyers quoted differently for one vehicle safe. The read
 *      filters on `user_id` in SQL (`listAgreedCarEnquiriesForUser`) because the
 *      query layer holds a service-role client and RLS makes it no promises.
 *   3. THE SNAPSHOT IS THEN FINAL. `payments.service.ts` charges
 *      `car_orders.deposit_pesewas` and never looks at the listing, the enquiry
 *      or the settings again — a reprice, a re-quote or an admin moving the
 *      deposit dial between "Buy" and the Paystack callback must not change what
 *      a customer is charged.
 *   4. AN `on_request` CAR IS BUYABLE ONLY BY SOMEBODY WHO HAS BEEN QUOTED. With
 *      no agreed figure it is a conversation, not a purchase, and it is refused
 *      with a sentence; 069's `car_orders_on_request_is_quoted` makes the
 *      alternative unrepresentable even if this check were removed.
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
 * The contract every other screen in the car feature builds against (069).
 *
 * Re-exported from the pure types module rather than declared here so that a
 * client component can `import type { CarPurchaseTerms }` without dragging
 * `server-only` into a bundle. The shape and its rules are documented there.
 */
export type { CarPurchaseTerms };

/**
 * Reserve the car and open a Paystack transaction for the DEPOSIT (069).
 *
 * The order of operations matters and is not arbitrary. The listing is checked,
 * the price is agreed and the row is written BEFORE Paystack is called, so the
 * reservation exists before any money can move — the reverse order would let two
 * customers both reach a checkout page for one vehicle and discover the clash
 * only after one of them had paid.
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

  // THIS CUSTOMER'S PRICE, NOT THE LISTING'S. Resolved from `user.id`, which is
  // the session's, so a quote given to somebody else is unreachable from here.
  const agreed = await findAgreedPrice(listing.id, user.id);

  const blocked = listingPurchaseBlockedReason(listing, agreed?.pesewas ?? null);
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

  // `listingPurchaseBlockedReason` returning null is the proof that ONE of these
  // two is a usable figure, which is what the non-null assertion rests on.
  const pricePesewas = agreed?.pesewas ?? listing.price_pesewas!;
  const percent = await carDepositPercent();

  const carOrder = await claimCar(user, listing, {
    pricePesewas,
    source: agreed?.source ?? CAR_PRICE_SOURCES.LISTING,
    enquiryId: agreed?.enquiryId ?? null,
    depositPesewas: carDepositPesewas(pricePesewas, percent),
    depositPercent: percent,
  });

  // One transaction, for the DEPOSIT snapshotted on that row — which for a
  // customer retrying an older checkout is the deposit THEY were quoted, not
  // whatever the setting says today. `initializePayment` re-reads the car order
  // it is given and refuses a second live charge against it
  // (`assertNoActivePayment`), which is what makes a double-submitted checkout a
  // 409 rather than two Paystack transactions for one vehicle.
  const { payment, authorizationUrl } = await initializePayment(user, {
    carOrderId: carOrder.id,
  });

  return { authorizationUrl, reference: payment.reference };
}

// ── The agreed price, and the terms that follow from it (069) ───────────────

/** A figure a person committed to, and the enquiry that proves it. */
interface AgreedPrice {
  pesewas: number;
  source: CarPriceSource;
  enquiryId: string;
}

/**
 * The figure THIS customer has agreed for THIS car, or null.
 *
 * TWO WAYS TO AGREE, AND NOTHING ELSE COUNTS:
 *
 *   * a `price_request` that is `answered` and carries `quoted_pesewas` — we
 *     named a price and the customer may take it;
 *   * an `offer` that is `accepted` — the amount is `offer_pesewas`, THEIR
 *     figure. Deliberately NOT `quoted_pesewas` on an accepted row: that column
 *     holds what we countered with, and a counter is an answer, not an
 *     acceptance. Charging it would charge a number the customer never said yes
 *     to, which is the same class of bug as charging the asking price.
 *
 * An `answered` OFFER is a counter and is skipped: the ball is with the customer
 * and they have not taken it. An `accepted` PRICE REQUEST cannot carry a figure
 * of its own (`car_enquiries_kind_amount` forbids `offer_pesewas` on one) so it
 * is read through its quote like any other answered request.
 *
 * OWNERSHIP IS PROVEN TWICE, ON PURPOSE. The query filters `user_id` in SQL —
 * the only filter that actually matters, since the query layer's client bypasses
 * RLS — and then every row is re-checked here against the same `userId` and the
 * listing before its figure is used. The second check costs nothing and is the
 * one that would catch a future edit loosening the first.
 *
 * Newest answer wins, which is the ordering the query returns.
 */
async function findAgreedPrice(
  carListingId: string,
  userId: string,
): Promise<AgreedPrice | null> {
  const enquiries = await listAgreedCarEnquiriesForUser(carListingId, userId);

  for (const enquiry of enquiries) {
    if (enquiry.user_id !== userId || enquiry.car_listing_id !== carListingId) {
      // Cannot happen through the query above. If it ever does, it is somebody
      // else's price arriving at this customer's checkout, which is worth an
      // error log and a refusal rather than a charge.
      logger.error("A car enquiry arrived for the wrong customer or car; ignoring it", {
        enquiryId: enquiry.id,
        carListingId,
        userId,
      });
      continue;
    }
    const agreed = agreedFigureOf(enquiry);
    if (agreed) return { ...agreed, enquiryId: enquiry.id };
  }
  return null;
}

/** The committed figure on one enquiry row, or null when it carries none. */
function agreedFigureOf(
  enquiry: CarEnquiryRow,
): { pesewas: number; source: CarPriceSource } | null {
  if (enquiry.kind === "offer" && enquiry.status === "accepted") {
    return usable(enquiry.offer_pesewas)
      ? { pesewas: enquiry.offer_pesewas, source: CAR_PRICE_SOURCES.ACCEPTED_OFFER }
      : null;
  }
  if (enquiry.kind === "price_request" && enquiry.status === "answered") {
    return usable(enquiry.quoted_pesewas)
      ? { pesewas: enquiry.quoted_pesewas, source: CAR_PRICE_SOURCES.QUOTE }
      : null;
  }
  return null;
}

function usable(value: number | null): value is number {
  return value !== null && Number.isInteger(value) && value > 0;
}

/**
 * The deposit percentage in force right now.
 *
 * NEVER THROWS, AND FAILS TOWARDS THE DEPOSIT. A settings read that fell over
 * must not take the car checkout down with it, and it must not fall back to
 * charging 100% either — that would ask a MoMo wallet for the whole vehicle,
 * which is the transaction 069 exists because customers cannot complete. So a
 * failure is logged and `DEFAULT_CAR_DEPOSIT_PERCENT` stands.
 *
 * Read at CHECKOUT ONLY. The figure it produces is snapshotted onto the order;
 * nothing downstream reads this again, so moving the dial changes what the next
 * customer is asked for and nothing about an order already placed.
 */
async function carDepositPercent(): Promise<number> {
  try {
    const settings = await getSiteSettingsMap();
    return normalizeCarDepositPercent(settings[CAR_DEPOSIT_PERCENT_KEY]);
  } catch (error) {
    logger.error("Could not read the car deposit setting; using the default", {
      key: CAR_DEPOSIT_PERCENT_KEY,
      fallbackPercent: DEFAULT_CAR_DEPOSIT_PERCENT,
      error: error instanceof Error ? error.message : String(error),
    });
    return DEFAULT_CAR_DEPOSIT_PERCENT;
  }
}

/**
 * What this customer would pay for this car, and how much of it now.
 *
 * THE ONE READ A CAR PAGE MAKES, and the reason it exists rather than the page
 * assembling the figures itself: the page's "pay GH₵36,000 now" and the
 * checkout's charge must be the same arithmetic, from the same private quote,
 * or a customer is shown one number and billed another.
 *
 * IT NEVER THROWS. A car page must render for a signed-out visitor, for a
 * customer with no enquiry, and on a day when the settings table is unreachable;
 * a failed read is logged and returns null, which the page shows as a car with
 * no purchase terms rather than as a 500. `userId` is null for a visitor, who by
 * definition has agreed nothing and sees the listing's own price.
 *
 * NULL vs `buyable: false` ARE DIFFERENT ANSWERS. Null means the terms could not
 * be worked out — no such car, or something failed. `buyable: false` is a real
 * answer about a real listing: there is nothing agreed and no public price, so
 * the page offers "Ask us for a price" instead of a Buy button.
 */
export async function getCarPurchaseTerms(
  carListingId: string,
  userId: string | null,
): Promise<CarPurchaseTerms | null> {
  try {
    const listing = await getCarListingById(carListingId);
    if (!listing) return null;

    const agreed = userId ? await findAgreedPrice(listing.id, userId) : null;
    const blocked = listingPurchaseBlockedReason(listing, agreed?.pesewas ?? null);

    if (blocked !== null) {
      // Zeroes rather than the listing's unusable figure: a caller that ignores
      // `buyable` prints GH₵0, which is obviously wrong, instead of printing a
      // price that looks right and is not one anybody may be charged.
      return {
        payablePesewas: 0,
        depositPesewas: 0,
        balancePesewas: 0,
        source: agreed?.source ?? CAR_PRICE_SOURCES.LISTING,
        buyable: false,
      };
    }

    const payablePesewas = agreed?.pesewas ?? listing.price_pesewas!;
    const depositPesewas = carDepositPesewas(payablePesewas, await carDepositPercent());

    return {
      payablePesewas,
      depositPesewas,
      balancePesewas: payablePesewas - depositPesewas,
      source: agreed?.source ?? CAR_PRICE_SOURCES.LISTING,
      buyable: true,
    };
  } catch (error) {
    logger.error("Could not work out the purchase terms for a car", {
      carListingId,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
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
async function claimCar(
  user: PlatformUser,
  listing: CarListingRow,
  terms: {
    pricePesewas: number;
    source: CarPriceSource;
    enquiryId: string | null;
    depositPesewas: number;
    depositPercent: number;
  },
): Promise<CarOrderRow> {
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
    if (live.status === CAR_ORDER_STATUSES.DEPOSIT_PAID) {
      // THEIR OWN CAR, DEPOSIT ALREADY PAID (069). Not a second Paystack charge:
      // the balance is settled offline and recorded by an admin, so there is
      // nothing for this endpoint to open. Said in the customer's own terms,
      // with the figure, because "you have already paid" would be wrong and
      // "conflict" tells them nothing.
      throw new APIError(
        409,
        "Your deposit on this car has been received. The balance is arranged with us directly, not through this page.",
      );
    }
    if (live.status !== CAR_ORDER_STATUSES.PENDING_PAYMENT) {
      throw new APIError(409, "You have already paid for this car.");
    }
    /*
      THE TERMS THEY WERE QUOTED, NOT TODAY'S. This row is handed straight back
      and charged again at ITS OWN `deposit_pesewas` — the price, the source and
      the deposit are all snapshots taken when the customer first pressed Buy.
      Recomputing them here would let a reprice, a fresh quote or an admin moving
      the deposit dial change what somebody is asked for mid-retry, which is
      exactly the surprise the snapshot exists to prevent.
    */
    return live;
  }

  try {
    const created = await insertCarOrder({
      car_listing_id: listing.id,
      user_id: user.id,
      // EVERY FIGURE DECIDED SERVER-SIDE AND SNAPSHOTTED HERE. The price is this
      // customer's — their quote, their accepted offer, or the listing's public
      // figure — and `price_source` with `car_enquiry_id` records which, so a
      // dispute about why they paid GH₵164,500 is answered by reading one row.
      price_pesewas: terms.pricePesewas,
      price_state: listing.price_state,
      price_source: terms.source,
      car_enquiry_id: terms.enquiryId,
      car_label: carTitle(listing),
      deposit_pesewas: terms.depositPesewas,
      deposit_percent: terms.depositPercent,
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
        // WHERE THE FIGURE CAME FROM, in the audit trail as well as on the row.
        // When these two disagree with `listingPricePesewas` — an accepted offer
        // below the asking price is meant to — this is the line that says why.
        priceSource: created.price_source,
        carEnquiryId: created.car_enquiry_id,
        // What Paystack is about to be asked for, and what will be collected
        // offline. Recorded at the moment of the decision, not derived later
        // from a setting that may have moved.
        depositPesewas: created.deposit_pesewas,
        depositPercent: created.deposit_percent,
        balancePesewas: created.price_pesewas - created.deposit_pesewas,
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
        // Covers `deposit_paid` as well as `paid` from 069, and the sentence is
        // true of both: a deposit is the customer's money, so unwinding it is a
        // refund and a decision, never a status change a sweep may make.
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
 * WORKS FROM ANY NON-CANCELLED STATE, `deposit_paid` INCLUDED (069). The CAS
 * below is against whatever status was just read, not against a fixed edge, so
 * the state 069 added needs nothing here — a customer who paid a deposit and
 * then walked away is unwound exactly like one who paid in full.
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
      // What actually has to be refunded is the DEPOSIT (069) — the balance, if
      // any, never went through Paystack. Whoever processes the refund reads
      // this row, so it names both figures rather than making them work it out.
      depositPesewas: carOrder.deposit_pesewas,
      balanceRecordedPesewas: carOrder.balance_amount_pesewas,
      reason: trimmed,
    },
  });
  return true;
}

/**
 * Record the balance a customer settled offline: deposit_paid → paid. ADMIN ONLY.
 *
 * THE OTHER HALF OF THE DEPOSIT MODEL (069). Paystack takes the deposit; the
 * rest arrives by bank transfer or in person, and somebody has to say so. Until
 * they do, the car sits at `deposit_paid` — reserved, held by
 * `uq_car_orders_live`, and NOT fully paid.
 *
 * THE AMOUNT IS REQUIRED AND IS CHECKED AGAINST THE ROW. It would have been
 * easier to take the outstanding balance as read and flip the status, and that
 * is precisely the design this refuses: a status button with no number lets a
 * five-figure debt be declared settled by a misclick, and leaves nothing on the
 * row saying what was actually received. So the caller names the figure, it must
 * equal `price_pesewas - deposit_pesewas` to the pesewa, and the number they
 * typed is written to `balance_amount_pesewas` alongside who they are.
 *
 * A PART PAYMENT IS NOT ACCEPTED, and the refusal names both figures so an admin
 * can see the difference rather than guess at it. Part payments would need their
 * own ledger — several rows, a running total, a definition of "enough" — which
 * is a bigger thing than this and must not be smuggled in by letting the amount
 * be anything a person types.
 *
 * NO MONEY MOVES HERE. This does not charge, capture or refund anything: it
 * records a fact about money that already arrived somewhere else. That is also
 * why `assertNoActivePayment` never sees it — there is no second Paystack
 * transaction to guard against, which is what let 069 add a deposit without
 * touching the double-charge guard at all.
 *
 * IDEMPOTENT ON THE STATE MACHINE, both ways. The UPDATE is a guarded
 * compare-and-set from `deposit_paid`, so two admins pressing the button at once
 * produce one transition and one audit row; and a car that is already `paid` (or
 * past it) answers `false` rather than throwing, because the second caller is
 * asking for something that is already true.
 */
export async function recordCarBalancePayment(
  actor: { id: string | null; role: "admin" },
  carOrderId: string,
  input: { amountPesewas: number; note?: string | null },
): Promise<boolean> {
  const carOrder = await getCarOrderById(carOrderId);
  if (!carOrder) throw new APIError(404, "Car order not found");

  // Already fully paid, or past it. Not an error: somebody recorded this
  // balance, and saying so twice must not write a second receipt.
  if (SETTLED_CAR_ORDER_STATUSES.has(carOrder.status)) return false;

  if (carOrder.status !== CAR_ORDER_STATUSES.DEPOSIT_PAID) {
    throw new APIError(
      400,
      carOrder.status === CAR_ORDER_STATUSES.CANCELLED
        ? "This car order was cancelled. Nothing can be recorded against it."
        : "The deposit on this car has not been paid yet, so there is no balance to record.",
    );
  }

  const outstanding = carOrder.price_pesewas - carOrder.deposit_pesewas;
  if (outstanding <= 0) {
    // Unreachable in practice: a car order with no balance is settled straight
    // to `paid` at settlement and never reaches `deposit_paid`. An explicit
    // refusal beats a transition that records a receipt for nothing.
    logger.error("A car order at deposit_paid has no outstanding balance", {
      carOrderId,
      pricePesewas: carOrder.price_pesewas,
      depositPesewas: carOrder.deposit_pesewas,
    });
    throw new APIError(400, "This car order has no outstanding balance to record.");
  }

  if (!Number.isInteger(input.amountPesewas) || input.amountPesewas !== outstanding) {
    throw new APIError(
      400,
      `The balance on this car is ${formatPesewas(outstanding)}. Record that exact amount, or take it up as a separate arrangement.`,
    );
  }

  const now = new Date().toISOString();
  const recorded = await updateCarOrderStatus(
    carOrderId,
    CAR_ORDER_STATUSES.DEPOSIT_PAID,
    CAR_ORDER_STATUSES.PAID,
    {
      // `paid_at` is when the car became FULLY paid, which is this moment — the
      // moment it was recorded. When the transfer actually cleared belongs in
      // the note, because only the admin looking at their bank knows it.
      paid_at: now,
      balance_amount_pesewas: input.amountPesewas,
      balance_note: input.note?.trim() || null,
      balance_recorded_by: actor.id,
    },
  );
  if (!recorded) return false;

  await logAuditEvent({
    actorId: actor.id,
    actorRole: AUDIT_ACTOR_ROLES.ADMIN,
    action: "car_order_balance_recorded",
    entityType: AUDIT_ENTITY_TYPES.CAR_ORDER,
    entityId: carOrderId,
    metadata: {
      from: CAR_ORDER_STATUSES.DEPOSIT_PAID,
      to: CAR_ORDER_STATUSES.PAID,
      carListingId: carOrder.car_listing_id,
      // The whole arithmetic, in the one row somebody will read a year from now:
      // what the car cost, what Paystack took, what came in offline.
      pricePesewas: carOrder.price_pesewas,
      depositPesewas: carOrder.deposit_pesewas,
      balancePesewas: outstanding,
      amountPesewas: input.amountPesewas,
      note: input.note?.trim() || null,
    },
  });
  return true;
}

/**
 * The statuses that mean the car is fully paid for — everything from `paid`
 * onwards. Recording a balance against one of these is a no-op, not an error.
 */
const SETTLED_CAR_ORDER_STATUSES: ReadonlySet<string> = new Set([
  CAR_ORDER_STATUSES.PAID,
  CAR_ORDER_STATUSES.PROCESSING,
  CAR_ORDER_STATUSES.IN_TRANSIT,
  CAR_ORDER_STATUSES.DELIVERED,
]);

/**
 * Pesewas as cedis, for one admin-facing sentence.
 *
 * Deliberately local and deliberately tiny. `src/features/cars/format.ts` is
 * 067's and formats a listing for a customer; this is a refusal message for an
 * admin who has typed the wrong number, and the one thing it must get right is
 * that the figure comes from integer pesewas rather than from a float somebody
 * built by dividing.
 */
function formatPesewas(pesewas: number): string {
  const cedis = Math.trunc(pesewas / 100).toLocaleString("en-GH");
  return `GH₵${cedis}.${String(pesewas % 100).padStart(2, "0")}`;
}
