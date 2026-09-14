import type { NextRequest } from "next/server";

import { listOrderFeedbackQueue } from "@/features/feedback/services/feedback.service";
import { getUserSession } from "@/features/auth/services/auth.service";
import { canAccessAdmin } from "@/lib/auth/admin-access";
import { APIError, errorResponse, successResponse } from "@/lib/auth/api-helpers";
import { checkRateLimit } from "@/lib/rate-limit";
import { RATE_LIMIT } from "@/config/security";
import type { OrderFeedbackStatus } from "@/db/queries/order-feedback";

const STATUSES = ["open", "in_review", "resolved", "dismissed"] as const;

/**
 * `GET /api/admin/order-feedback?status=open` — what customers are saying about
 * the parcels we are holding.
 *
 * Oldest first: every open row is somebody waiting on a box that is still at a
 * US hub and still cheap to put right, so the queue is worked front to back.
 *
 * An unrecognised `status` is treated as "no filter" rather than a 400 — the
 * same shape the assisted and contact queues use, so a stale bookmark shows the
 * whole queue instead of an error.
 */
export async function GET(request: NextRequest) {
  try {
    const ip = request.headers.get("x-forwarded-for") ?? "unknown";
    if (!checkRateLimit(`admin-order-feedback:${ip}`, RATE_LIMIT.admin).allowed) {
      throw new APIError(429, "Too many requests");
    }

    const { session } = await getUserSession();
    if (!canAccessAdmin(session)) throw new APIError(403, "Admin access required");

    const raw = request.nextUrl.searchParams.get("status");
    const status = STATUSES.find((s) => s === raw) as OrderFeedbackStatus | undefined;

    return successResponse(await listOrderFeedbackQueue(status));
  } catch (error) {
    return errorResponse(error);
  }
}
