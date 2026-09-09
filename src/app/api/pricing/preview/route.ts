import { NextRequest } from "next/server";
import { z } from "zod";
import { getAuthenticatedUser } from "@/features/auth/services/auth.service";
import { requireAuth } from "@/lib/auth/guards";
import { APIError, successResponse, errorResponse } from "@/lib/auth/api-helpers";
import { getValidExtractionById } from "@/db/queries/extraction-cache";
import { priceExtraction } from "@/features/extraction/quote.service";
import { calculatePricing } from "@/features/pricing/services/pricing.service";
import { PRICING_TO_REGION } from "@/features/extraction/url";

/**
 * GET /api/pricing/preview
 *
 * Two modes:
 *  - `extraction_cache_id` + `quantity` → priced from the server-side snapshot.
 *    Optional `itemPriceUsd` is honoured ONLY when the snapshot has no price
 *    (the customer is filling a gap; the order will be flagged for review).
 *  - `itemPriceUsd` + `quantity` (+ `category`, `weightLbs`) → manual estimate,
 *    for orders placed without an extraction. Informational only.
 *
 * Nothing returned here is trusted at order time — createOrder recomputes.
 */
const previewSchema = z.object({
  extraction_cache_id: z.string().uuid().optional(),
  itemPriceUsd: z.coerce.number().positive().max(50000).optional(),
  quantity: z.coerce.number().int().min(1).max(100).default(1),
  category: z.string().optional(),
  weightLbs: z.coerce.number().positive().optional(),
  region: z.enum(["usa", "uk", "china"]).optional(),
});

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser();
    requireAuth(user);

    const sp = request.nextUrl.searchParams;
    const parsed = previewSchema.safeParse({
      extraction_cache_id: sp.get("extraction_cache_id") || undefined,
      itemPriceUsd: sp.get("itemPriceUsd") || undefined,
      quantity: sp.get("quantity") || undefined,
      category: sp.get("category") || undefined,
      weightLbs: sp.get("weightLbs") || undefined,
      region: sp.get("region") || undefined,
    });
    if (!parsed.success) {
      throw new APIError(400, parsed.error.issues[0]?.message ?? "Invalid input");
    }
    const input = parsed.data;

    if (input.extraction_cache_id) {
      const row = await getValidExtractionById(input.extraction_cache_id);
      if (!row) throw new APIError(404, "Extraction not found or expired");
      const snapshotHasPrice = row.result.product.price != null && row.result.product.price > 0;
      // The customer may fill a region gap; they may never override a region the store determined.
      const country = row.result.country ?? (input.region ? PRICING_TO_REGION[input.region] : null);
      const { pricing, reason } = await priceExtraction(
        { ...row.result, country },
        input.quantity,
        !snapshotHasPrice && input.itemPriceUsd != null ? { itemPriceUsd: input.itemPriceUsd } : undefined,
      );
      if (!pricing) throw new APIError(422, reason ?? "Pricing unavailable");
      return successResponse(pricing);
    }

    if (input.itemPriceUsd == null) {
      throw new APIError(400, "Provide extraction_cache_id or itemPriceUsd");
    }
    const breakdown = await calculatePricing({
      itemPriceUsd: input.itemPriceUsd,
      quantity: input.quantity,
      category: input.category,
      weightLbs: input.weightLbs,
      region: input.region,
    });
    return successResponse(breakdown);
  } catch (err) {
    return errorResponse(err);
  }
}
