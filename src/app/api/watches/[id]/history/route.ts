import { NextRequest } from "next/server";
import { getAuthenticatedUser } from "@/features/auth/services/auth.service";
import { requireAuth } from "@/lib/auth/guards";
import { APIError, successResponse, errorResponse } from "@/lib/auth/api-helpers";
import { checkRateLimit } from "@/lib/rate-limit";
import { RATE_LIMIT } from "@/config/security";
import { watchHistoryQuerySchema, watchIdSchema } from "@/features/watches/schema";
import { getWatchHistory } from "@/features/watches/services/watches.service";

/**
 * GET /api/watches/:id/history?days=30 — the observation series behind the
 * sparkline, plus the stats derived from that same window.
 *
 * `days` is clamped to 1–365 rather than rejected when out of range; a
 * non-numeric value is a 400, because that is a broken caller, not a big number.
 * Ownership failures answer 404 (see the DELETE route for why).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getAuthenticatedUser();
    const auth = requireAuth(user);

    if (!checkRateLimit(`watches-history:${auth.id}`, RATE_LIMIT.general).allowed) {
      throw new APIError(429, "Too many requests");
    }

    const { id } = await params;
    const parsedId = watchIdSchema.safeParse(id);
    if (!parsedId.success) throw new APIError(404, "Watch not found");

    const parsedQuery = watchHistoryQuerySchema.safeParse({
      days: request.nextUrl.searchParams.get("days") ?? undefined,
    });
    if (!parsedQuery.success) {
      throw new APIError(400, "`days` must be a number");
    }

    return successResponse(await getWatchHistory(auth.id, parsedId.data, parsedQuery.data.days));
  } catch (error) {
    return errorResponse(error);
  }
}
