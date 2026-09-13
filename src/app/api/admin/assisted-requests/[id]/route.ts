import { NextRequest } from "next/server";

import { transitionAssistedRequestSchema } from "@/features/assisted/schema";
import { moveAssistedRequest } from "@/features/assisted/services/assisted.service";
import { getUserSession } from "@/features/auth/services/auth.service";
import { canAccessAdmin } from "@/lib/auth/admin-access";
import { APIError, successResponse, errorResponse } from "@/lib/auth/api-helpers";
import { checkRateLimit } from "@/lib/rate-limit";
import { RATE_LIMIT } from "@/config/security";
import type { AssistedRequestStatus } from "@/db/queries/assisted-requests";

const FROM = ["open", "contacted", "resolved", "cancelled"] as const;

/**
 * PATCH /api/admin/assisted-requests/:id — claim or close one request.
 *
 * `from` is required and is the status the buyer saw when they opened the queue.
 * The transition is guarded on it, so two buyers acting at once cannot both take
 * the same customer: the second gets a 409 instead of silently overwriting.
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ip = request.headers.get("x-forwarded-for") ?? "unknown";
    if (!checkRateLimit(`admin-assisted-write:${ip}`, RATE_LIMIT.admin).allowed) {
      throw new APIError(429, "Too many requests");
    }

    // `user`, not `session`: getUserSession returns the JWT CLAIMS as `session`,
    // where the user id is `sub`. Reading `session.id` yields undefined, and
    // `handled_by` then stays null on every request a buyer picks up — so the
    // queue cannot say who took it.
    const { session, user } = await getUserSession();
    if (!canAccessAdmin(session)) throw new APIError(403, "Admin access required");

    const { id } = await params;
    const body: unknown = await request.json().catch(() => {
      throw new APIError(400, "Invalid JSON");
    });

    const parsed = transitionAssistedRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new APIError(400, parsed.error.issues[0]?.message ?? "Invalid input");
    }

    const rawFrom = (body as { from?: unknown }).from;
    const from = FROM.find((s) => s === rawFrom) as AssistedRequestStatus | undefined;
    if (!from) throw new APIError(400, "Say which status you are moving this from");

    return successResponse(await moveAssistedRequest(user.id, id, from, parsed.data));
  } catch (error) {
    return errorResponse(error);
  }
}
