import "server-only";

import { getValidExtractionById } from "@/db/queries/extraction-cache";
import { APIError } from "@/lib/auth/api-helpers";
import type { RequestViewer } from "@/db/queries/extraction-requests";
import { extractPrepared, prepareProductUrl } from "../extraction.service";
import { variantChoicesOf, variantUrlFor } from "../variant-choices";

/**
 * The customer picked another size or colour on a quote: read the store's own
 * link for that variant and hand back its quote id. The browser names only a
 * variant id; the link is built here from the snapshot's URL and only for an
 * id the snapshot lists, so this cannot be pointed at any other page.
 *
 * The result is an ordinary extraction — cached per variant link, priced,
 * bagged and ordered like a paste — so nothing downstream changes.
 */
export async function quoteVariant(
  viewer: RequestViewer,
  extractionId: string,
  variantId: string,
): Promise<{ extraction_cache_id: string; enrich?: () => Promise<void> }> {
  const row = await getValidExtractionById(extractionId);
  if (!row) throw new APIError(404, "This quote has expired. Paste the link again.");
  const choices = variantChoicesOf(row.result.product);
  if (!choices) throw new APIError(409, "This listing has no options to choose from.");
  if (choices.selectedId === variantId) return { extraction_cache_id: row.id };
  const url = variantUrlFor(row.product_url, choices, variantId);
  if (!url) throw new APIError(400, "That option is not on this listing.");

  const { enrich, extraction_cache_id } = await extractPrepared(await prepareProductUrl(url), viewer);
  if (!extraction_cache_id) throw new APIError(502, "We couldn't read that option from the store. Try again in a moment.");
  return { extraction_cache_id, enrich };
}
