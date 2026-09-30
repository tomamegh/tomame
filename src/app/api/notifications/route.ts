import type { NextRequest } from "next/server";
import { listUserNotifications } from "@/features/notifications/services/notifications.service";
import { getAuthenticatedUser } from "@/features/auth/services/auth.service";
import { requireAuth } from "@/lib/auth/guards";
import { APIError, successResponse, errorResponse } from "@/lib/auth/api-helpers";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { RATE_LIMIT } from "@/config/security";

export async function GET(request: NextRequest) {
  try {
    const ip = getClientIp(request);
    if (!(await checkRateLimit(`notifications:${ip}`, RATE_LIMIT.general)).allowed) {
      throw new APIError(429, "Too many requests");
    }

    const user = await getAuthenticatedUser();
    const auth = requireAuth(user);

    // Returns { notifications, count, unread_count }. `count` still means the
    // total; `unread_count` rides along so the app shell can render the list
    // and the nav bell's dot from this one request.
    const data = await listUserNotifications(auth);
    return successResponse(data);
  } catch (error) {
    return errorResponse(error);
  }
}
