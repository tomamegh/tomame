import "server-only";

import { getAssistedRequestById, transitionAssistedRequest, type AssistedRequestRow } from "@/db/queries/assisted-requests";
import { getExtractionById, upsertExtractionCache } from "@/db/queries/extraction-cache";
import { getExtractionRequestById, readyFromCache, setPasteOutcome, type ExtractionJobRow } from "@/db/queries/extraction-requests";
import { findChatIdForPaste, insertFinderChatMessage, touchFinderChat } from "@/db/queries/finder-chats";
import { logAuditEvent } from "@/features/audit/services/audit.service";
import { emptyProduct } from "@/features/extraction/scrapers/types";
import { notifyPasteFinished } from "@/features/extraction/services/paste-notify.service";
import type { ExtractionResult } from "@/features/extraction/types";
import { hostOf } from "@/features/bag/components/format";
import { AUDIT_ACTOR_ROLES, AUDIT_ENTITY_TYPES, QUOTE_VALID_HOURS } from "@/config/constants";
import { APIError } from "@/lib/auth/api-helpers";
import { logger } from "@/lib/logger";
import type { PriceManualQuoteInput } from "../schema";

/**
 * A buyer answers a paste no reader could price (110, site brief Fix 1.3).
 *
 * The buyer supplies FACTS — the store's price in USD, the category, a weight
 * when the category is priced by weight — never a cedi total. They are written
 * into the paste's stored read exactly as a staff price correction is
 * (`price_source: "staff"`), so the pricing engine strikes the landed figure on
 * the same path as every other quote, and the customer's chat card turns into a
 * priced quote with its full breakdown and its 24-hour clock.
 */
export async function priceManualQuote(adminId: string, id: string, input: PriceManualQuoteInput): Promise<AssistedRequestRow> {
  const request = await getAssistedRequestById(id);
  if (!request) throw new APIError(404, "Request not found");
  if (request.source !== "paste" || !request.extraction_request_id) throw new APIError(400, "Only a failed paste can be priced here");
  if (request.status !== "open" && request.status !== "contacted") throw new APIError(409, "This request is already closed. Refresh the queue.");

  const paste = await getExtractionRequestById(request.extraction_request_id);
  if (!paste) throw new APIError(409, "The pasted link is gone");

  const now = new Date();
  const previous = paste.extraction_cache_id ? await getExtractionById(paste.extraction_cache_id) : null;
  const result = staffPricedResult(previous?.result ?? null, paste, input, now);
  const cacheId = await upsertExtractionCache({
    urlHash: paste.url_hash,
    productUrl: paste.product_url,
    result,
    complete: true,
    source: null,
    requestedBy: paste.user_id,
    // Lives as long as the free quote: a re-read would only fail again and lose this price.
    expiresAt: new Date(now.getTime() + QUOTE_VALID_HOURS * 3_600_000).toISOString(),
  });
  if (!cacheId) throw new APIError(500, "Could not save the price. Try again.");

  // The request closes first: a second buyer pricing the same link gets the 409.
  const closed = await transitionAssistedRequest({
    id,
    from: request.status,
    to: "resolved",
    handledBy: adminId,
    note: `Priced by hand: $${input.price_usd.toFixed(2)} (${input.category})`,
  });
  if (!closed) throw new APIError(409, "Someone else already answered this one. Refresh the queue.");

  await readyFromCache(paste.id, cacheId);
  await setPasteOutcome(paste.id, "priced_by_staff", now.toISOString());
  await logAuditEvent({
    actorId: adminId,
    actorRole: AUDIT_ACTOR_ROLES.ADMIN,
    action: "manual_quote_priced",
    entityType: AUDIT_ENTITY_TYPES.ASSISTED_REQUEST,
    entityId: id,
    metadata: {
      extraction_request_id: paste.id,
      extraction_cache_id: cacheId,
      price_usd: input.price_usd,
      category: input.category,
      weight_lbs: input.weight_lbs ?? null,
    },
  });

  const title = result.product.title ?? hostOf(paste.product_url);
  await replyInChat(paste.id, `A buyer priced ${title} by hand. The full quote is on its card above. It is a free quote: pay within 24 hours or it will be cancelled.`);
  try {
    await notifyPasteFinished(paste, { status: "ready", extractionCacheId: cacheId });
  } catch (error) {
    logger.error("manual quote: notification failed after pricing", { id, error: error instanceof Error ? error.message : String(error) });
  }
  return closed;
}

/** A buyer closed a paste-sourced request as impossible: the paste records it and the chat says so. */
export async function closeManualQuote(request: AssistedRequestRow): Promise<void> {
  if (request.source !== "paste" || !request.extraction_request_id) return;
  await setPasteOutcome(request.extraction_request_id, "unrecoverable", new Date().toISOString());
  await replyInChat(
    request.extraction_request_id,
    "Our buyer couldn't get this item for you. If you have another link for it, paste it here and we'll price that one.",
  );
}

/** The buyer's facts, written over whatever the failed read left. */
export function staffPricedResult(
  previous: ExtractionResult | null,
  paste: Pick<ExtractionJobRow, "product_url">,
  input: PriceManualQuoteInput,
  now: Date,
): ExtractionResult {
  const base = previous?.product ?? emptyProduct();
  const title = input.title?.trim() || base.title || hostOf(paste.product_url);
  const message = `A buyer checked this price by hand on ${now.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Africa/Accra" })}.`;
  return {
    extraction_attempted: true,
    extraction_success: true,
    platform: previous?.platform ?? null,
    country: "USA",
    product: {
      ...base,
      title,
      price: input.price_usd,
      currency: "USD",
      category: input.category as ExtractionResult["product"]["category"],
      weight_lbs: input.weight_lbs ?? base.weight_lbs ?? null,
    },
    messages: [message],
    errors: [message],
    source: previous?.source ?? null,
    sources: previous?.sources ?? [],
    confidence: previous?.confidence ?? {},
    fetched_at: now.toISOString(),
    price_source: "staff",
    price_confidence: { level: "confirmed", reasons: ["exact_offer"], source: null },
  };
}

async function replyInChat(pasteId: string, content: string): Promise<void> {
  try {
    const chatId = await findChatIdForPaste(pasteId);
    if (!chatId) return;
    await insertFinderChatMessage({ chatId, role: "assistant", content });
    await touchFinderChat(chatId);
  } catch (error) {
    logger.warn("manual quote: chat reply failed", { pasteId, error: error instanceof Error ? error.message : String(error) });
  }
}
