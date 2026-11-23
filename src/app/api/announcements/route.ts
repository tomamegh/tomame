import type { NextRequest } from "next/server";

import { announcementsFor } from "@/features/announcements/services/announcements.service";
import { getAuthenticatedUser } from "@/features/auth/services/auth.service";
import { requireAuth } from "@/lib/auth/guards";
import { APIError, successResponse, errorResponse } from "@/lib/auth/api-helpers";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { RATE_LIMIT } from "@/config/security";

/** GET /api/announcements — the caller's messages from Tomame they have not dismissed (119). Own rows only. */
export async function GET(request: NextRequest) {
  try {
    if (!(await checkRateLimit(`announcements:${getClientIp(request)}`, RATE_LIMIT.general)).allowed) throw new APIError(429, "Too many requests");
    const auth = requireAuth(await getAuthenticatedUser());
    return successResponse(await announcementsFor(auth.id));
  } catch (error) {
    return errorResponse(error);
  }
}
