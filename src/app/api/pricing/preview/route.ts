import { NextRequest } from "next/server";
import { z } from "zod";
import { APIError, successResponse, errorResponse } from "@/lib/auth/api-helpers";
import { getValidExtractionById } from "@/db/queries/extraction-cache";
import { applyRateLock, withDeliveryEta } from "@/features/quotes/services/quote-lock.service";
import { calculatePricing } from "@/features/pricing/services/pricing.service";
import { PRICING_TO_REGION } from "@/features/extraction/url";
import { getAuthenticatedUser } from "@/features/auth/services/auth.service";
import { resolveViewer } from "@/lib/quote-session";
import { gapFillOverrides } from "@/features/extraction/quote.service";
import { checkRateLimit } from "@/lib/rate-limit";
import { RATE_LIMIT } from "@/config/security";

/**
 * GET /api/pricing/preview
 *
 * Two modes:
 *  - `extraction_cache_id` + `quantity` → priced from the server-side snapshot
 *    under the viewer's rate lock (minted here if they have none). Optional
 *    `itemPriceUsd` is honoured ONLY when the snapshot has no price
 *    (`gapFillOverrides` — the same rule order intake applies; the order will
 *    be flagged for review).
 *  - `itemPriceUsd` + `quantity` (+ `category`, `weightLbs`) → manual estimate,
 *    for orders placed without an extraction. Informational only.
 *
 * Nothing returned here is trusted at order time — createOrder recomputes.
 * The lock is resolved server-side from the session; no rate or lock id is
 * ever accepted from the query string. Public: part of the no-login quote flow.
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
    const ip = request.headers.get("x-forwarded-for") ?? "unknown";
    if (!checkRateLimit(`pricing-preview:${ip}`, RATE_LIMIT.general).allowed) {
      throw new APIError(429, "Too many requests");
    }

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
      // The customer may fill a region gap; they may never override a region the store determined.
      const country = row.result.country ?? (input.region ? PRICING_TO_REGION[input.region] : null);
      const user = await getAuthenticatedUser();
      const { viewer, finalize } = resolveViewer(request, user?.id ?? null);
      const { pricing, reason } = await applyRateLock({
        viewer,
        extraction: { ...row.result, country },
        extractionCacheId: row.id,
        quantity: input.quantity,
        overrides: gapFillOverrides(row.result, input.itemPriceUsd),
      });
      if (!pricing) throw new APIError(422, reason ?? "Pricing unavailable");
      return finalize(successResponse(pricing));
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
    }, null);
    // No extraction → nothing to lock against; the ETA still applies when the region is known.
    const country = input.region ? PRICING_TO_REGION[input.region] : null;
    return successResponse(await withDeliveryEta(breakdown, country, null, new Date()));
  } catch (err) {
    return errorResponse(err);
  }
}
