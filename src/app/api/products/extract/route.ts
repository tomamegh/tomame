import { NextRequest, after } from "next/server";
import { extractProductSchema } from "@/features/extraction/schema";
import { extractPrepared, prepareProductUrl } from "@/features/extraction/extraction.service";
import { quoteForViewer } from "@/features/quotes/services/quote-lock.service";
import { resolveViewer } from "@/lib/quote-session";
import { getCachedExtractionByHash } from "@/db/queries/extraction-cache";
import { getAuthenticatedUser } from "@/features/auth/services/auth.service";
import { APIError, successResponse, errorResponse } from "@/lib/auth/api-helpers";
import { checkRateLimit } from "@/lib/rate-limit";
import { RATE_LIMIT } from "@/config/security";

// Chain budget is 25s (config/extraction.ts). Headroom for enrichment scheduling + pricing.
export const maxDuration = 60;

/**
 * A cache hit calls no vendor, but it still mints a session for a cookie-less
 * caller, and writes an `extraction_requests` row, a `quote_locks` row and an
 * audit row for it (see `extractPrepared` / `quoteForViewer`). Left uncounted,
 * that is unbounded rows at zero vendor cost (SECURITY-REVIEW-2026-09-14, W3).
 *
 * Reuses `RATE_LIMIT.extraction` rather than a new constant: same window, a
 * looser ceiling, in its own bucket so a burst of legitimate cache hits (a
 * visitor re-opening a quote, or browsing several already-cached products)
 * never eats into the tight budget that guards paid vendor calls below. It is
 * still a cap, not a dedup, so a script that never returns the session cookie
 * is bounded per IP per window instead of unbounded — the trade-off is that a
 * shared IP (an office NAT) shares one such bucket, same as the vendor-cost
 * bucket already does.
 */
const CACHE_HIT_RATE_LIMIT = {
  windowMs: RATE_LIMIT.extraction.windowMs,
  maxRequests: RATE_LIMIT.extraction.maxRequests * 5,
};

/**
 * POST /api/products/extract
 * Paste a link → get the product AND a price in one response (a Quote).
 * Never 5xx on a bad page: a partial product with `messages` comes back
 * instead, and the customer can still proceed to admin review.
 *
 * Public: no login needed to get a quote. Sign-in is required at order
 * submission. Abuse is bounded by the per-IP rate limit (a tighter bucket for
 * a fresh vendor call, a looser one for a cache hit) and the product-keyed
 * cache (a repeat paste costs no vendor call).
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
    const { viewer, finalize } = resolveViewer(request, user?.id ?? null);

    // Validate + canonicalize before spending anything — a bad link is a 400,
    // and a cached product costs no vendor-call rate-limit budget.
    const prepared = await prepareProductUrl(parsed.data.product_url);

    // A cached product costs nothing to serve, so it spends no vendor-call
    // rate-limit budget — but it still mints rows for a cookie-less caller, so
    // it spends its own, looser budget instead of none. The response still goes
    // through `extractPrepared` — which re-reads the same cache row and returns
    // immediately — so that every paste, cached or fresh, follows one path and
    // is recorded against the customer there.
    const cached = await getCachedExtractionByHash(prepared.urlHash);
    const ip = request.headers.get("x-forwarded-for") ?? "unknown";
    if (!cached) {
      if (!checkRateLimit(`extraction:${ip}`, RATE_LIMIT.extraction).allowed) {
        throw new APIError(429, "Too many requests. Please wait a few minutes and try again.");
      }
    } else if (!checkRateLimit(`extraction:cache:${ip}`, CACHE_HIT_RATE_LIMIT).allowed) {
      throw new APIError(429, "Too many requests. Please wait a few minutes and try again.");
    }

    const { enrich, ...extraction } = await extractPrepared(prepared, viewer);
    // Weight lookup etc. finishes after the response and updates the cache row;
    // the review page reads the row, so it sees the enriched product.
    if (enrich) after(enrich);
    return finalize(successResponse(await quoteForViewer(extraction, 1, viewer)));
  } catch (error) {
    return errorResponse(error);
  }
}
