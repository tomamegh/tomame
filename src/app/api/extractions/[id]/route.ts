import { NextRequest } from "next/server";
import { APIError, successResponse, errorResponse } from "@/lib/auth/api-helpers";
import { getValidExtractionById } from "@/db/queries/extraction-cache";
import { buildQuote } from "@/features/extraction/quote.service";

/**
 * GET /api/extractions/:id?quantity=N
 * A stored extraction as a Quote. Product data is store-public and the quote
 * flow is open to visitors, so no login is needed; pricing is recomputed live.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    const qtyRaw = request.nextUrl.searchParams.get("quantity");
    const quantity = qtyRaw ? Math.min(100, Math.max(1, parseInt(qtyRaw, 10) || 1)) : 1;

    const row = await getValidExtractionById(id);
    if (!row) throw new APIError(404, "Extraction not found or expired");

    const quote = await buildQuote({ ...row.result, extraction_cache_id: row.id, cached: true }, quantity);
    return successResponse({ ...quote, product_url: row.product_url });
  } catch (error) {
    return errorResponse(error);
  }
}
