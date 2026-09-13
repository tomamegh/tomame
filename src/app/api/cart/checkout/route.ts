import { NextRequest } from "next/server";
import { APIError, successResponse, errorResponse } from "@/lib/auth/api-helpers";
import { getAuthenticatedUser } from "@/features/auth/services/auth.service";
import { requireAuth } from "@/lib/auth/guards";
import { resolveViewer } from "@/lib/quote-session";
import { checkRateLimit } from "@/lib/rate-limit";
import { RATE_LIMIT } from "@/config/security";
import { checkoutSchema } from "@/features/bag/schema";
import { checkoutBag } from "@/features/bag/services/checkout.service";

/**
 * POST /api/cart/checkout — the bag becomes an order group to pay for.
 *
 * Signed-in only: a 401 here is what sends the browser to
 * `/auth/login?next=/app/bag`. The session cookie still travels so the
 * viewer's anonymous bag is adopted on this very request. The body may restate
 * the delivery choice; it says nothing about money.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = requireAuth(await getAuthenticatedUser());
    if (!checkRateLimit(`checkout:${auth.id}`, RATE_LIMIT.orders).allowed) {
      throw new APIError(429, "Too many requests");
    }
    const { viewer, finalize } = resolveViewer(request, auth.id);

    const body: unknown = await request.json().catch(() => ({}));
    const parsed = checkoutSchema.safeParse(body ?? {});
    if (!parsed.success) throw new APIError(400, parsed.error.issues[0]?.message ?? "Invalid input");

    const result = await checkoutBag(auth, viewer, parsed.data);
    return finalize(successResponse(result, 201));
  } catch (error) {
    return errorResponse(error);
  }
}
