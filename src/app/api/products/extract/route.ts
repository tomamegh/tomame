import { NextRequest, after } from "next/server";
import { extractProductSchema } from "@/features/extraction/schema";
import { extractPrepared, prepareProductUrl } from "@/features/extraction/extraction.service";
import { buildQuote } from "@/features/extraction/quote.service";
import { getCachedExtractionByHash } from "@/db/queries/extraction-cache";
import { getAuthenticatedUser } from "@/features/auth/services/auth.service";
import { APIError, successResponse, errorResponse } from "@/lib/auth/api-helpers";
import { checkRateLimit } from "@/lib/rate-limit";
import { RATE_LIMIT } from "@/config/security";

// Chain budget is 90s (config/extraction.ts). Headroom for pricing + response.
export const maxDuration = 120;

/**
 * POST /api/products/extract
 * Paste a link → get the product AND a price in one response (a Quote).
 * Never 5xx on a bad page: a partial product with `messages` comes back
 * instead, and the customer can still proceed to admin review.
 *
 * Public: no login needed to get a quote. Sign-in is required at order
 * submission. Abuse is bounded by the per-IP rate limit and the product-keyed
 * cache (a repeat paste costs nothing).
 */
export async function POST(request: NextRequest) {
  try {
    const body: unknown = await request.json().catch(() => {
      throw new APIError(400, "Invalid JSON");
    });

    const parsed = extractProductSchema.safeParse(body);
    if (!parsed.success) {
      throw new APIError(400, parsed.error.issues[0]?.message ?? "Invalid input");
    }

    const user = await getAuthenticatedUser();

    // Validate + canonicalize before spending anything — a bad link is a 400,
    // and a cached product costs no rate-limit budget.
    const prepared = await prepareProductUrl(parsed.data.product_url);
    const cached = await getCachedExtractionByHash(prepared.urlHash);
    if (cached) {
      return successResponse(await buildQuote({ ...cached.result, extraction_cache_id: cached.id, cached: true }));
    }

    const ip = request.headers.get("x-forwarded-for") ?? "unknown";
    if (!checkRateLimit(`extraction:${ip}`, RATE_LIMIT.extraction).allowed) {
      throw new APIError(429, "Too many requests. Please wait a few minutes and try again.");
    }

    const { enrich, ...extraction } = await extractPrepared(prepared, user?.id ?? null);
    // Weight lookup etc. finishes after the response and updates the cache row;
    // the review page reads the row, so it sees the enriched product.
    if (enrich) after(enrich);
    return successResponse(await buildQuote(extraction));
  } catch (error) {
    return errorResponse(error);
  }
}
