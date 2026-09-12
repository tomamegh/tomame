import { NextRequest } from "next/server";
import { z } from "zod";
import { APIError, successResponse, errorResponse } from "@/lib/auth/api-helpers";
import { searchCatalog } from "@/features/catalog/services/catalog-search.service";
import { checkRateLimit } from "@/lib/rate-limit";
import { RATE_LIMIT } from "@/config/security";
import { CATALOG_SEARCH } from "@/config/catalog";

/**
 * GET /api/catalog/search?q=&limit=
 *
 * Link-free product search over the pre-scraped catalogue (migration 045).
 * Public — part of the no-login quote flow — so it is IP rate-limited and
 * reads only store-public data. Every result carries `product_url` for the
 * hand-off to `/app/orders/new?url=`, and a landed GH₵ total computed
 * server-side by the pricing engine; nothing here is trusted at order time.
 */
const searchSchema = z.object({
  q: z.string().trim().min(CATALOG_SEARCH.minQueryLength).max(CATALOG_SEARCH.maxQueryLength),
  limit: z.coerce.number().int().min(1).max(CATALOG_SEARCH.maxLimit).default(CATALOG_SEARCH.defaultLimit),
});

export async function GET(request: NextRequest) {
  try {
    const ip = request.headers.get("x-forwarded-for") ?? "unknown";
    if (!checkRateLimit(`catalog-search:${ip}`, RATE_LIMIT.general).allowed) {
      throw new APIError(429, "Too many requests");
    }

    const sp = request.nextUrl.searchParams;
    const parsed = searchSchema.safeParse({
      q: sp.get("q") ?? "",
      limit: sp.get("limit") || undefined,
    });
    if (!parsed.success) {
      throw new APIError(400, parsed.error.issues[0]?.message ?? "Invalid input");
    }

    return successResponse(await searchCatalog(parsed.data.q, { limit: parsed.data.limit }));
  } catch (err) {
    return errorResponse(err);
  }
}
