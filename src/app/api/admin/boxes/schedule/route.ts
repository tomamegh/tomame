import { NextRequest } from "next/server";

import { runBoxScheduleNow } from "@/features/bag/services/box-admin.service";
import { getUserSession } from "@/features/auth/services/auth.service";
import { canAccessAdmin } from "@/lib/auth/admin-access";
import { APIError, successResponse, errorResponse } from "@/lib/auth/api-helpers";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { RATE_LIMIT } from "@/config/security";

/** POST /api/admin/boxes/schedule — run the box schedule job now (111). */
export async function POST(request: NextRequest) {
  try {
    if (!(await checkRateLimit(`admin-boxes-write:${getClientIp(request)}`, RATE_LIMIT.admin)).allowed) {
      throw new APIError(429, "Too many requests");
    }
    const { session, user } = await getUserSession();
    if (!canAccessAdmin(session)) throw new APIError(403, "Admin access required");
    return successResponse(await runBoxScheduleNow(user.id));
  } catch (error) {
    return errorResponse(error);
  }
}
