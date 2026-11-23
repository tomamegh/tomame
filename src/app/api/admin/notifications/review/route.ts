import { NextRequest } from "next/server";
import { z } from "zod";

import { reviewNotifications } from "@/features/notifications/services/notification-settle.service";
import { getUserSession } from "@/features/auth/services/auth.service";
import { canAccessAdmin } from "@/lib/auth/admin-access";
import { APIError, successResponse, errorResponse } from "@/lib/auth/api-helpers";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { RATE_LIMIT } from "@/config/security";

const bodySchema = z.object({
  ids: z.array(z.uuid()).min(1).max(500).optional(),
  kind: z.enum(["orders", "quotes", "account"]).optional(),
});

/** POST /api/admin/notifications/review — mark failed/pending sends reviewed: the given ids, or all (of one kind) (Fix 8). */
export async function POST(request: NextRequest) {
  try {
    if (!(await checkRateLimit(`admin-notifications-review:${getClientIp(request)}`, RATE_LIMIT.admin)).allowed) {
      throw new APIError(429, "Too many requests");
    }
    const { session, user } = await getUserSession();
    if (!canAccessAdmin(session)) throw new APIError(403, "Admin access required");
    const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) throw new APIError(400, "Invalid request");
    return successResponse(await reviewNotifications(user.id, parsed.data));
  } catch (error) {
    return errorResponse(error);
  }
}
