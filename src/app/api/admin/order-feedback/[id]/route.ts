import type { NextRequest } from "next/server";

import { transitionOrderFeedbackSchema } from "@/features/feedback/schema";
import { moveOrderFeedback } from "@/features/feedback/services/feedback.service";
import { getUserSession } from "@/features/auth/services/auth.service";
import { canAccessAdmin } from "@/lib/auth/admin-access";
import { APIError, errorResponse, successResponse } from "@/lib/auth/api-helpers";
import { checkRateLimit } from "@/lib/rate-limit";
import { RATE_LIMIT } from "@/config/security";

/**
 * `PATCH /api/admin/order-feedback/:id` — claim, resolve or dismiss one
 * objection.
 *
 * `from` is required and is the status the admin saw when they opened the
 * queue. The transition is guarded on it in SQL, so two admins acting at once
 * cannot both claim the same customer: the second gets a 409 instead of
 * silently overwriting the first's resolution.
 *
 * This does NOT stop the parcel. Holding is a separate, separately audited
 * action at `POST /api/admin/orders/:id/hold` — deciding an objection is real
 * and deciding to stop a box are two different decisions.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ip = request.headers.get("x-forwarded-for") ?? "unknown";
    if (!checkRateLimit(`admin-order-feedback-write:${ip}`, RATE_LIMIT.admin).allowed) {
      throw new APIError(429, "Too many requests");
    }

    // `user`, not `session`: getUserSession returns the JWT CLAIMS as `session`,
    // where the user id is `sub`. Reading `session.id` yields undefined, and
    // `handled_by` would then stay null on every row an admin picks up.
    const { session, user } = await getUserSession();
    if (!canAccessAdmin(session)) throw new APIError(403, "Admin access required");

    const { id } = await params;
    const body: unknown = await request.json().catch(() => {
      throw new APIError(400, "Invalid JSON");
    });

    const parsed = transitionOrderFeedbackSchema.safeParse(body);
    if (!parsed.success) {
      throw new APIError(400, parsed.error.issues[0]?.message ?? "Invalid input");
    }

    return successResponse(await moveOrderFeedback(user.id, id, parsed.data));
  } catch (error) {
    return errorResponse(error);
  }
}
