import type { NextRequest } from "next/server";
import * as z from "zod";
import { markNotificationRead } from "@/features/notifications/services/notifications.service";
import { getAuthenticatedUser } from "@/features/auth/services/auth.service";
import { requireAuth } from "@/lib/auth/guards";
import { APIError, successResponse, errorResponse } from "@/lib/auth/api-helpers";
import { checkRateLimit } from "@/lib/rate-limit";
import { RATE_LIMIT } from "@/config/security";

const paramsSchema = z.object({
  id: z.uuid("Invalid notification id"),
});

/**
 * PATCH /api/notifications/:id/read — mark one notification read.
 *
 * HTTP orchestration only. Ownership lives in the service, which answers 404
 * (never 403) for a notification belonging to someone else so this endpoint
 * cannot be used to probe which ids exist.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ip = request.headers.get("x-forwarded-for") ?? "unknown";
    if (!checkRateLimit(`notifications-read:${ip}`, RATE_LIMIT.general).allowed) {
      throw new APIError(429, "Too many requests");
    }

    const parsed = paramsSchema.safeParse(await params);
    if (!parsed.success) {
      throw new APIError(400, parsed.error.issues[0]?.message ?? "Invalid input");
    }

    const user = await getAuthenticatedUser();
    const auth = requireAuth(user);

    const data = await markNotificationRead(auth, parsed.data.id);
    return successResponse(data);
  } catch (error) {
    return errorResponse(error);
  }
}
