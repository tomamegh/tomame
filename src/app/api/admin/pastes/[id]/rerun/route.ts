import { NextRequest, after } from "next/server";

import { rerunPaste } from "@/features/extraction/services/admin-pastes.service";
import { runExtractionJob } from "@/features/extraction/services/extraction-queue.service";
import { getUserSession } from "@/features/auth/services/auth.service";
import { canAccessAdmin } from "@/lib/auth/admin-access";
import { APIError, successResponse, errorResponse } from "@/lib/auth/api-helpers";
import { checkRateLimit } from "@/lib/rate-limit";
import { RATE_LIMIT } from "@/config/security";

// The extraction chain's own budget is 25 s (config/extraction.ts) and the work
// runs in `after()`, which is still this invocation. Same headroom the customer
// paste endpoint gives it.
export const maxDuration = 60;

/**
 * POST /api/admin/pastes/:id/rerun — read that link again, by hand.
 *
 * The response does NOT wait for the extraction. The service puts the row back
 * to `pending` and returns, the work starts in `after()`, and the screen polls
 * for the outcome — exactly the shape `POST /api/products/extract` uses, and for
 * the same reason: a vendor race can hold the request open for 25 s and an admin
 * should not be staring at a spinner they cannot leave.
 *
 * Overlapping with the cron sweep is safe and expected. `runExtractionJob`
 * claims `pending → running` with a guarded update, so whichever of the two
 * reaches the row first wins and the other is refused; nothing is reimplemented
 * here.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ip = request.headers.get("x-forwarded-for") ?? "unknown";
    if (!checkRateLimit(`admin-pastes-rerun:${ip}`, RATE_LIMIT.admin).allowed) {
      throw new APIError(429, "Too many requests");
    }

    const { session, user } = await getUserSession();
    if (!canAccessAdmin(session)) throw new APIError(403, "Admin access required");

    const { id } = await params;
    const row = await rerunPaste(user.id, id);

    after(async () => {
      await runExtractionJob(id);
    });

    return successResponse(row);
  } catch (error) {
    return errorResponse(error);
  }
}
