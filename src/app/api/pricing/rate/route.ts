import type { NextRequest } from "next/server";
import { getFxRateQuote } from "@/features/pricing/services/fx-rate.service";
import { APIError, successResponse, errorResponse } from "@/lib/auth/api-helpers";
import { checkRateLimit } from "@/lib/rate-limit";
import { RATE_LIMIT } from "@/config/security";

/** Seconds the nav pill may reuse a rate before asking again. */
const CACHE_MAX_AGE_SECONDS = 300;
const STALE_WHILE_REVALIDATE_SECONDS = 3600;

/**
 * GET /api/pricing/rate?base=USD
 *
 * Public: the live FX pill in the app nav reads this on every page load, so it
 * carries no auth and is cached hard. `export const revalidate` would not apply
 * — reading request headers for the rate-limit key makes the handler dynamic —
 * so the freshness contract is the `Cache-Control` header below: a rate is at
 * most a few minutes stale, and the CDN can serve the old one while refreshing.
 *
 * 400 unsupported base · 429 rate limited · 503 no rate stored yet.
 */
export async function GET(request: NextRequest) {
  try {
    const ip = request.headers.get("x-forwarded-for") ?? "unknown";
    if (!checkRateLimit(`fx-rate:${ip}`, RATE_LIMIT.fxRate).allowed) {
      throw new APIError(429, "Too many requests");
    }

    const data = await getFxRateQuote(request.nextUrl.searchParams.get("base"));

    const response = successResponse(data);
    response.headers.set(
      "Cache-Control",
      `public, max-age=${CACHE_MAX_AGE_SECONDS}, stale-while-revalidate=${STALE_WHILE_REVALIDATE_SECONDS}`,
    );
    return response;
  } catch (error) {
    return errorResponse(error);
  }
}
