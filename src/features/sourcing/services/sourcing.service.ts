import "server-only";

import { APIError } from "@/lib/auth/api-helpers";
import { logger } from "@/lib/logger";
import { logAuditEvent } from "@/features/audit/services/audit.service";
import { addToBag } from "@/features/bag/services/bag.service";
import { getExtractionSnapshot } from "@/features/extraction/extraction.service";
import { hashUrl, normalizeUrl } from "@/features/extraction/url";
import { priceExtraction } from "@/features/extraction/quote.service";
import { needsSourcing } from "@/features/quotes/components/format";
import { isPayablePricing } from "@/lib/pricing/payable";
import {
  getRecipientEmail,
  insertNotification,
  markNotificationDelivered,
} from "@/db/queries/notifications";
import { sendEmail } from "@/lib/email/transport";
import { mayEmailUser } from "@/lib/email/notify-preference";
import {
  sourcingAvailableTemplate,
  sourcingUnavailableTemplate,
} from "@/lib/email/templates/sourcing-answered";
import { env } from "@/lib/env";
import { hostOf } from "@/features/bag/components/format";
import { getCartItemById, updateCartItem } from "@/db/queries/carts";
import {
  answerSourcingRequest,
  getSourcingByCartItems,
  getWatchByUserAndHash,
  listSourcingRequests,
  upsertSourcingRequest,
  type PriceWatchRow,
  type SourcingStatus,
} from "@/db/queries/price-watches";
import type { OriginCountry } from "@/features/orders/types";
import type { Viewer } from "@/features/quotes/types";
import type { PlatformUser } from "@/features/users/types";

/**
 * Sourcing requests: the bag line a PERSON has to answer (065).
 *
 * THE PROBLEM. An item the pricing engine cannot price used to be offered the
 * ordinary "Add to bag", which took it, failed to price it, and parked the
 * customer on a disabled "Pay GH₵0.00". Kelvin, 2026-09-14: "A user cannot be
 * directed or shown the add to bag like the normal flow and payment cannot be
 * allowed in such cases... allow add to bag and in that case it sends a request
 * to an admin."
 *
 * So the bag still takes the line — the customer really has chosen the thing —
 * and a sourcing watch is raised against it. A buyer looks the item up and
 * attaches what it costs; only then does the line price, and only then can it
 * be paid for.
 *
 * WHERE THE MONEY IS STRUCK, AND WHERE IT IS NOT. The buyer supplies two FACTS:
 * the item's price in USD and the country it ships from. They never type a cedi
 * total. Those two facts land in the same `gap_price_usd` / `gap_origin_country`
 * columns the quote screen's gap-fillers use, and `calculator.ts` strikes the
 * landed figure from them on the next bag read, exactly as it does for every
 * other line — so checkout, order intake and the payment all stay on the one
 * pricing path CLAUDE.md requires.
 */

export interface SourcingRequestInput {
  extraction_cache_id: string;
  quantity: number;
  /** The customer's own guesses from the quote screen's gap-fillers, if any. */
  estimated_price_usd?: number;
  origin_country?: OriginCountry;
}

export interface SourcingRequestResult {
  watch_id: string;
  cart_item_id: string;
  item_count: number;
  status: SourcingStatus;
}

/**
 * Raise a request. Signed-in only, and the server decides whether the item
 * actually needs one.
 *
 * THE CLIENT DOES NOT GET TO SAY. `needsSourcing` is re-run here against the
 * server's own snapshot rather than trusted from the request, for the same
 * reason order intake re-prices from the cache: a browser that could declare an
 * ordinary Amazon listing "unsourceable" would route a perfectly payable order
 * into a manual queue, and one that could declare an unknown store ordinary
 * would walk it straight to Paystack.
 */
export async function requestSourcing(
  user: PlatformUser,
  viewer: Viewer,
  input: SourcingRequestInput,
): Promise<SourcingRequestResult> {
  const snapshot = await getExtractionSnapshot(input.extraction_cache_id);
  if (!snapshot) throw new APIError(404, "This quote has expired. Paste the link again for a fresh price.");

  const { result } = snapshot;

  /*
    THE GATE HAS TO ACTUALLY PRICE IT.

    This used to pass `hasPricing: false` on the reasoning that a stored snapshot
    carries no breakdown of its own. That reasoning was wrong and it disabled the
    whole check: `needsSourcing`'s last clause is `!hasPricing && !priceMissing`,
    so a perfectly ordinary Amazon listing with a readable price answered TRUE,
    the 400 below never fired, and anything at all could be pushed into the
    buyer's queue — blocking the customer's own checkout on the way past. This is
    the one guard standing between a request body and a person's work queue, so
    it asks the engine the question rather than assuming the answer.

    `isPayablePricing`, not `!= null`: a review verdict is a breakdown of zeroes,
    and reading it as a price here would send the opposite item to the queue —
    the ones that genuinely need a human would be turned away.
  */
  const { pricing } = await priceExtraction(result, input.quantity, null, null);

  if (
    !needsSourcing({
      platform: result.platform,
      country: result.country,
      hasPricing: isPayablePricing(pricing),
      priceMissing: result.product.price == null || !(result.product.price > 0),
    })
  ) {
    throw new APIError(400, "We can price this one ourselves — add it to your bag as normal.");
  }

  // The line first, so the request has something to point at. It prices to
  // nothing, which is correct: there is nothing to price yet.
  const added = await addToBag(viewer, {
    extraction_cache_id: input.extraction_cache_id,
    quantity: input.quantity,
    // The customer's guesses are NOT written onto the line as gap-fillers. They
    // are a hint for the buyer, and a hint must not become a number the bag
    // would price and the customer could pay against.
  });

  const canonical = normalizeUrl(snapshot.productUrl);

  /*
    PRESSING THE BUTTON AGAIN MUST NOT UNDO A BUYER'S WORK.

    The upsert conflicts on (user_id, url_hash) and rewrites every column it is
    given, so the status has to be resolved from whatever the row already holds.
    The reachable case is ordinary: a buyer prices the item, the customer opens
    the quote link again — where the CTA is live once more, because the item is
    still from a store we do not know — and presses it. Writing a literal
    "requested" there would re-queue finished work and lock a bag that was
    payable a second earlier.

    Only a row that is already a sourcing request keeps its status. A PRICE watch
    on the same link is being converted into a request, and that genuinely does
    start at `requested`.
  */
  const existing = await getWatchByUserAndHash(user.id, hashUrl(canonical));
  const status: SourcingStatus =
    existing?.kind === "sourcing" && existing.sourcing_status
      ? existing.sourcing_status
      : "requested";

  const watch = await upsertSourcingRequest({
    sourcing_status: status,
    user_id: user.id,
    product_url: canonical,
    url_hash: hashUrl(canonical),
    product_name: result.product.title ?? null,
    product_image_url: result.product.image ?? null,
    extraction_cache_id: input.extraction_cache_id,
    sourcing_cart_item_id: added.line.id,
    customer_price_hint_usd: input.estimated_price_usd ?? null,
    customer_origin_hint: input.origin_country ?? null,
  });

  await logAuditEvent({
    actorId: user.id,
    actorRole: "user",
    action: "sourcing_requested",
    entityType: "price_watch",
    entityId: watch.id,
    metadata: {
      cart_item_id: added.line.id,
      product_url: canonical,
      platform: result.platform,
      country: result.country,
    },
  });

  return {
    watch_id: watch.id,
    cart_item_id: added.line.id,
    item_count: added.item_count,
    status: watch.sourcing_status ?? "requested",
  };
}

export interface SourcingAnswerInput {
  /** The status the buyer saw; the transition is guarded on it. */
  from: SourcingStatus;
  status: Extract<SourcingStatus, "available" | "unavailable">;
  /** Required for `available`: what the item actually costs, in USD. */
  price_usd?: number;
  /** Required for `available`: where it ships from, so freight can be struck. */
  origin_country?: OriginCountry;
  note?: string;
}

/**
 * The buyer's answer, and the only thing that can make one of these payable.
 *
 * ORDER MATTERS HERE. The watch is answered first and the bag line is filled
 * second, because the two writes are not one transaction and the failure modes
 * are not symmetric: a watch marked `available` whose line was not filled shows
 * the customer "we found it" over a line that still will not price — visibly
 * wrong, and recoverable by answering again. The reverse (a filled line under a
 * request still reading `requested`) would let a customer pay for something the
 * queue still believes nobody has checked.
 */
export async function answerSourcing(
  adminId: string,
  watchId: string,
  input: SourcingAnswerInput,
): Promise<PriceWatchRow> {
  if (input.status === "available") {
    // Belt and braces with the CHECK constraint: this message is one a person
    // reads, and a 23514 from Postgres is not.
    if (!(input.price_usd != null && input.price_usd > 0)) {
      throw new APIError(400, "Enter what the item costs in USD before marking it available.");
    }
    if (!input.origin_country) {
      throw new APIError(400, "Choose the country this item ships from before marking it available.");
    }
  }

  const reviewedAt = new Date().toISOString();
  const watch = await answerSourcingRequest(watchId, input.from, {
    sourcing_status: input.status,
    sourced_price_usd: input.status === "available" ? input.price_usd! : null,
    sourced_origin_country: input.status === "available" ? input.origin_country! : null,
    sourced_note: input.note?.trim() || null,
    reviewed_by: adminId,
    reviewed_at: reviewedAt,
  });
  if (!watch) {
    // Either the id is wrong or somebody else answered it first, and the two are
    // not worth distinguishing to a caller: both mean "the row you were looking
    // at is not the row that is there now". 409 rather than 404 so the queue can
    // say so plainly and refresh, the way the assisted queue already does.
    throw new APIError(409, "Someone else answered this one first. The queue has been refreshed.");
  }

  if (input.status === "available" && watch.sourcing_cart_item_id) {
    await fillLineFromAnswer(watch);
  }

  await logAuditEvent({
    actorId: adminId,
    actorRole: "admin",
    action: input.status === "available" ? "sourcing_marked_available" : "sourcing_marked_unavailable",
    entityType: "price_watch",
    entityId: watch.id,
    metadata: {
      cart_item_id: watch.sourcing_cart_item_id,
      sourced_price_usd: watch.sourced_price_usd,
      sourced_origin_country: watch.sourced_origin_country,
    },
  });

  await notifyCustomer(watch);
  return watch;
}

/**
 * Put the buyer's two facts where the pricing engine already looks.
 *
 * `gap_price_usd` and `gap_origin_country` are the columns the quote screen's
 * own gap-fillers write, and `priceSnapshot` feeds both into the calculator on
 * every bag read. Reusing them means nothing downstream — the bag, the box
 * packing, checkout, order intake, the Paystack amount — needs to know that a
 * human filled them in rather than the customer.
 *
 * The line may be gone: a customer can empty their bag while a buyer is working
 * the queue. That is not an error, and it must not undo the answer — the request
 * keeps its `available` state, and re-adding the item finds it already answered.
 */
async function fillLineFromAnswer(watch: PriceWatchRow): Promise<void> {
  const lineId = watch.sourcing_cart_item_id!;
  const line = await getCartItemById(lineId);
  if (!line) {
    logger.info("sourcing: the answered line is no longer in a bag", { watchId: watch.id, lineId });
    return;
  }

  await updateCartItem(lineId, {
    // `sourced_price_usd`, not `gap_price_usd`: a buyer's figure must outrank the
    // snapshot, and a gap-filler is explicitly ignored where the snapshot has a
    // price of its own. The country still rides the gap column, which already
    // means "use this when the extraction had none" — exactly the case here.
    sourced_price_usd: watch.sourced_price_usd,
    gap_origin_country: watch.sourced_origin_country,
    // The stored breakdown is stale the moment the inputs change, and a stale
    // `pricing` blob is what the bag would otherwise show until something else
    // forced a re-price. Cleared so the next read strikes it fresh.
    pricing: null,
    quote_lock_id: null,
  });
}

/**
 * Tell the customer, and actually send it.
 *
 * THE ROW IS NOT THE MESSAGE. An earlier version of this inserted the
 * notification and stopped, which left the bell correct and the promise broken:
 * no mail was ever attempted, and the row sat `pending` for ever — one
 * permanently stuck row per answer, quietly inflating the `status = 'pending'`
 * count the admin notification-health panel reads. The whole point of the
 * feature is reaching somebody who closed the tab, so it follows the same
 * insert → check preference → send → mark shape as every other sender here
 * (`payment-reconciliation.service.ts`).
 *
 * A customer who has turned email off still gets the bell, and the row is marked
 * `sent` rather than left pending: they HAVE been told, through the channel they
 * allow.
 *
 * Never throws upward. The buyer's answer is recorded and the line is priced;
 * failing the whole request because Resend was down would leave an admin
 * pressing the button again on work that is already finished.
 */
async function notifyCustomer(watch: PriceWatchRow): Promise<void> {
  const available = watch.sourcing_status === "available";
  const event = available ? "sourcing_available" : "sourcing_unavailable";
  let notificationId: string | null = null;

  try {
    notificationId = (
      await insertNotification({
        user_id: watch.user_id,
        channel: "email",
        event,
        payload: {
          watch_id: watch.id,
          product_name: watch.product_name,
          product_url: watch.product_url,
          note: watch.sourced_note,
        },
      })
    ).id;

    const now = new Date().toISOString();
    if (!(await mayEmailUser(watch.user_id))) {
      await markNotificationDelivered(notificationId, { status: "sent", sent_at: now });
      return;
    }

    const email = await getRecipientEmail(watch.user_id);
    if (!email) {
      await markNotificationDelivered(notificationId, { status: "failed" });
      return;
    }

    const data = {
      // The host is what a customer recognises when the page yielded no title.
      productName: watch.product_name ?? hostOf(watch.product_url),
      note: watch.sourced_note,
      destinationUrl: `${env.app.url}/app/bag`,
    };
    const template = available
      ? sourcingAvailableTemplate(data)
      : sourcingUnavailableTemplate(data);

    await sendEmail({ to: email, subject: template.subject, html: template.html });
    await markNotificationDelivered(notificationId, { status: "sent", sent_at: now });
  } catch (error) {
    if (notificationId) {
      await markNotificationDelivered(notificationId, { status: "failed" }).catch(() => undefined);
    }
    logger.error("sourcing: could not tell the customer", {
      watchId: watch.id,
      event,
      notificationId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/** The buyer's queue. */
export async function listSourcingQueue(status: SourcingStatus | null, limit = 100): Promise<PriceWatchRow[]> {
  return listSourcingRequests(status, limit);
}

/** The sourcing state behind a set of bag lines, keyed by line id. */
export async function sourcingForLines(lineIds: readonly string[]): Promise<Map<string, PriceWatchRow>> {
  return getSourcingByCartItems(lineIds);
}
