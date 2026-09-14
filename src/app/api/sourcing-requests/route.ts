import { NextRequest } from "next/server";

import { RATE_LIMIT } from "@/config/security";
import { getAuthenticatedUser } from "@/features/auth/services/auth.service";
import { createSourcingRequestSchema } from "@/features/sourcing/schema";
import { requestSourcing } from "@/features/sourcing/services/sourcing.service";
import { APIError, successResponse, errorResponse } from "@/lib/auth/api-helpers";
import { requireAuth } from "@/lib/auth/guards";
import { resolveViewer } from "@/lib/quote-session";
import { checkRateLimit } from "@/lib/rate-limit";

/**
 * POST /api/sourcing-requests — "we cannot price this one; ask a buyer".
 *
 * SIGNED-IN ONLY, and this is the one place the public quote flow stops. A
 * sourcing request is a promise that a person will come back to you, so it needs
 * somebody to come back TO: `price_watches.user_id` is NOT NULL, and a bell
 * notification cannot be delivered to a cookie. A 401 here is what sends the
 * browser to `/auth/login?next=/app/orders/review/...`, the same wall checkout
 * uses — and the session cookie still travels, so the visitor's anonymous bag is
 * adopted on this very request and the line they were looking at is already
 * theirs when they land back.
 *
 * The `orders` bucket, not `general`: this ends in a job on a person's desk, so
 * the honest ceiling is a handful an hour rather than sixty.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = requireAuth(await getAuthenticatedUser());
    if (!checkRateLimit(`sourcing:${auth.id}`, RATE_LIMIT.orders).allowed) {
      throw new APIError(429, "You have sent a few of these. Give us a moment to get to them.");
    }

    const body: unknown = await request.json().catch(() => {
      throw new APIError(400, "Invalid JSON");
    });
    const parsed = createSourcingRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new APIError(400, parsed.error.issues[0]?.message ?? "Invalid input");
    }

    const { viewer, finalize } = resolveViewer(request, auth.id);
    return finalize(successResponse(await requestSourcing(auth, viewer, parsed.data), 201));
  } catch (error) {
    return errorResponse(error);
  }
}
