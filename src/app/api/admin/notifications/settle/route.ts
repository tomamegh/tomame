import { NextRequest } from "next/server";
import { z } from "zod";

import { settleOldPendingNotifications } from "@/features/notifications/services/notification-settle.service";
import { getUserSession } from "@/features/auth/services/auth.service";
import { canAccessAdmin } from "@/lib/auth/admin-access";
import { APIError, successResponse, errorResponse } from "@/lib/auth/api-helpers";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { RATE_LIMIT } from "@/config/security";

const bodySchema = z.object({ disposition: z.enum(["shown_in_bell", "cancelled"]) });

/** POST /api/admin/notifications/settle — an admin's recorded decision on notifications pending over a day (Fix 13). */
export async function POST(request: NextRequest) {
  try {
    if (!(await checkRateLimit(`admin-notifications-settle:${getClientIp(request)}`, RATE_LIMIT.admin)).allowed) {
      throw new APIError(429, "Too many requests");
    }
    const { session, user } = await getUserSession();
    if (!canAccessAdmin(session)) throw new APIError(403, "Admin access required");
    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw new APIError(400, "Choose what to do with them");
    return successResponse(await settleOldPendingNotifications(user.id, parsed.data.disposition));
  } catch (error) {
    return errorResponse(error);
  }
}
