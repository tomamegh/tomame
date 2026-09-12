import { NextRequest } from "next/server";
import { getAuthenticatedUser } from "@/features/auth/services/auth.service";
import { requireAuth } from "@/lib/auth/guards";
import { APIError, successResponse, errorResponse } from "@/lib/auth/api-helpers";
import { checkRateLimit } from "@/lib/rate-limit";
import { RATE_LIMIT } from "@/config/security";
import { createWatchSchema } from "@/features/watches/schema";
import { createWatch, listWatches } from "@/features/watches/services/watches.service";

/**
 * GET  /api/watches — the caller's active watches with derived stats.
 * POST /api/watches — start watching a product link.
 *
 * HTTP only: auth, rate limit, parse, status code. The body carries a URL and
 * nothing else — the price, the name and the totals are resolved server-side
 * (see `watches.service.ts`), so there is no client number to distrust.
 *
 * Rate limits are keyed by USER, not IP: a POST costs a scraper call now and
 * one every night afterwards, and several customers behind one Ghanaian mobile
 * NAT must not share a budget.
 */

export async function GET() {
  try {
    const user = await getAuthenticatedUser();
    const auth = requireAuth(user);

    if (!checkRateLimit(`watches-list:${auth.id}`, RATE_LIMIT.general).allowed) {
      throw new APIError(429, "Too many requests");
    }

    return successResponse(await listWatches(auth.id));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser();
    const auth = requireAuth(user);

    if (!checkRateLimit(`watches-create:${auth.id}`, RATE_LIMIT.watches).allowed) {
      throw new APIError(429, "You've added a lot of watches today. Try again later.");
    }

    const body: unknown = await request.json().catch(() => {
      throw new APIError(400, "Invalid JSON");
    });
    const parsed = createWatchSchema.safeParse(body);
    if (!parsed.success) {
      throw new APIError(400, parsed.error.issues[0]?.message ?? "Invalid input");
    }

    const result = await createWatch(auth.id, parsed.data.url);
    // 200 when the link was already on the list — the call is idempotent, and
    // a 201 would claim a row was created when none was.
    return successResponse(result, result.created ? 201 : 200);
  } catch (error) {
    return errorResponse(error);
  }
}
