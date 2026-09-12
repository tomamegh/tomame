import type { NextRequest } from "next/server";
import { markAllNotificationsRead } from "@/features/notifications/services/notifications.service";
import { getAuthenticatedUser } from "@/features/auth/services/auth.service";
import { requireAuth } from "@/lib/auth/guards";
import { APIError, successResponse, errorResponse } from "@/lib/auth/api-helpers";
import { checkRateLimit } from "@/lib/rate-limit";
import { RATE_LIMIT } from "@/config/security";

/**
 * POST /api/notifications/read-all — mark every unread notification read.
 *
 * Takes no body: the scope is always the caller's own rows, never a
 * client-supplied user_id. Idempotent — a repeat call reports `updated: 0`.
 */
export async function POST(request: NextRequest) {
  try {
    const ip = request.headers.get("x-forwarded-for") ?? "unknown";
    if (!checkRateLimit(`notifications-read-all:${ip}`, RATE_LIMIT.general).allowed) {
      throw new APIError(429, "Too many requests");
    }

    const user = await getAuthenticatedUser();
    const auth = requireAuth(user);

    const data = await markAllNotificationsRead(auth);
    return successResponse(data);
  } catch (error) {
    return errorResponse(error);
  }
}
