import { NextRequest } from "next/server";

import { announcementInputSchema } from "@/features/announcements/schema";
import { listAdminAnnouncements, sendAnnouncement } from "@/features/announcements/services/announcements.service";
import { getUserSession } from "@/features/auth/services/auth.service";
import { canAccessAdmin } from "@/lib/auth/admin-access";
import { APIError, successResponse, errorResponse } from "@/lib/auth/api-helpers";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { RATE_LIMIT } from "@/config/security";

async function requireAdminSession(request: NextRequest, key: string) {
  if (!(await checkRateLimit(`${key}:${getClientIp(request)}`, RATE_LIMIT.admin)).allowed) throw new APIError(429, "Too many requests");
  const { session, user } = await getUserSession();
  if (!canAccessAdmin(session)) throw new APIError(403, "Admin access required");
  return user;
}

/** GET /api/admin/announcements — the communication center's sent messages, with reach and seen counts. */
export async function GET(request: NextRequest) {
  try {
    await requireAdminSession(request, "admin-announcements");
    return successResponse(await listAdminAnnouncements());
  } catch (error) {
    return errorResponse(error);
  }
}

/** POST /api/admin/announcements — send a message to customers (in-app pop-up and bell; never emailed). */
export async function POST(request: NextRequest) {
  try {
    const user = await requireAdminSession(request, "admin-announcements-send");
    const parsed = announcementInputSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw new APIError(400, parsed.error.issues[0]?.message ?? "Invalid message");
    return successResponse(await sendAnnouncement(user.id, parsed.data), 201);
  } catch (error) {
    return errorResponse(error);
  }
}
