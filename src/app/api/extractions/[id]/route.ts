import { NextRequest } from "next/server";
import { APIError, successResponse, errorResponse } from "@/lib/auth/api-helpers";
import { getValidExtractionById } from "@/db/queries/extraction-cache";
import { quoteForViewer } from "@/features/quotes/services/quote-lock.service";
import { isWatching } from "@/features/watches/services/watches.service";
import { getAuthenticatedUser } from "@/features/auth/services/auth.service";
import { resolveViewer } from "@/lib/quote-session";
import { checkRateLimit } from "@/lib/rate-limit";
import { RATE_LIMIT } from "@/config/security";

/**
 * GET /api/extractions/:id?quantity=N
 * A stored extraction as a Quote. Product data is store-public and the quote
 * flow is open to visitors, so no login is needed. Pricing is live for the item
 * price and held by the viewer's rate lock for FX; a first-time visitor gets a
 * quote-session cookie so the lock has an owner.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ip = request.headers.get("x-forwarded-for") ?? "unknown";
    if (!checkRateLimit(`extractions-read:${ip}`, RATE_LIMIT.general).allowed) {
      throw new APIError(429, "Too many requests");
    }
    const { id } = await params;

    const qtyRaw = request.nextUrl.searchParams.get("quantity");
    const quantity = qtyRaw ? Math.min(100, Math.max(1, parseInt(qtyRaw, 10) || 1)) : 1;

    const row = await getValidExtractionById(id);
    if (!row) throw new APIError(404, "Extraction not found or expired");

    const user = await getAuthenticatedUser();
    const { viewer, finalize } = resolveViewer(request, user?.id ?? null);

    const [quote, watching] = await Promise.all([
      quoteForViewer({ ...row.result, extraction_cache_id: row.id, cached: true }, quantity, viewer),
      isWatching(user?.id ?? null, row.url_hash),
    ]);

    return finalize(successResponse({ ...quote, product_url: row.product_url, is_watching: watching }));
  } catch (error) {
    return errorResponse(error);
  }
}
