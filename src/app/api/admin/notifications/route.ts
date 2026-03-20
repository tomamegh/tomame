import type { NextRequest } from "next/server";
import { listAllNotifications } from "@/features/notifications/services/notifications.service";
import { getAuthenticatedUser } from "@/features/auth/services/auth.service";
import { requireAuth, requireAdmin } from "@/lib/auth/guards";
import { APIError, successResponse, errorResponse } from "@/lib/auth/api-helpers";
import { checkRateLimit } from "@/lib/rate-limit";
import { RATE_LIMIT } from "@/config/security";

export async function GET(request: NextRequest) {
  try {
    const ip = request.headers.get("x-forwarded-for") ?? "unknown";
    if (!checkRateLimit(`admin-notifications:${ip}`, RATE_LIMIT.admin).allowed) {
      throw new APIError(429, "Too many requests");
    }

    const { searchParams } = request.nextUrl;
    const filters = {
      status: searchParams.get("status") ?? undefined,
      userId: searchParams.get("userId") ?? undefined,
      channel: searchParams.get("channel") ?? undefined,
    };

    const user = await getAuthenticatedUser();
    const auth = requireAuth(user);
    const admin = requireAdmin(auth);

    const data = await listAllNotifications(admin, filters);
    return successResponse(data);
  } catch (error) {
    return errorResponse(error);
  }
}
