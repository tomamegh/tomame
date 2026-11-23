import { NextRequest } from "next/server";
import { z } from "zod";

import { withdrawAnnouncement } from "@/features/announcements/services/announcements.service";
import { getUserSession } from "@/features/auth/services/auth.service";
import { canAccessAdmin } from "@/lib/auth/admin-access";
import { APIError, successResponse, errorResponse } from "@/lib/auth/api-helpers";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { RATE_LIMIT } from "@/config/security";

type Ctx = { params: Promise<{ id: string }> };

/** POST /api/admin/announcements/:id/withdraw — stop showing a message to anyone who has not dismissed it. */
export async function POST(request: NextRequest, { params }: Ctx) {
  try {
    if (!(await checkRateLimit(`admin-announcements-withdraw:${getClientIp(request)}`, RATE_LIMIT.admin)).allowed) throw new APIError(429, "Too many requests");
    const { session, user } = await getUserSession();
    if (!canAccessAdmin(session)) throw new APIError(403, "Admin access required");
    const { id } = await params;
    if (!z.uuid().safeParse(id).success) throw new APIError(400, "Unknown message");
    await withdrawAnnouncement(user.id, id);
    return successResponse({ withdrawn: true });
  } catch (error) {
    return errorResponse(error);
  }
}
