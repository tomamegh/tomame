import type { NextRequest } from "next/server";

import { getAuthenticatedUser } from "@/features/auth/services/auth.service";
import { listAppReminders } from "@/features/mobile/services/app-alerts.service";
import { requireAuth } from "@/lib/auth/guards";
import { APIError, errorResponse, successResponse } from "@/lib/auth/api-helpers";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { readQuoteSessionFromCookies } from "@/lib/quote-session";
import { RATE_LIMIT } from "@/config/security";

/** GET /api/app/reminders — what the iPhone app should schedule on the phone right now. */
export async function GET(request: NextRequest) {
  try {
    if (!(await checkRateLimit(`app-reminders:${getClientIp(request)}`, RATE_LIMIT.general)).allowed) {
      throw new APIError(429, "Too many requests");
    }
    const user = requireAuth(await getAuthenticatedUser());
    return successResponse({ reminders: await listAppReminders(user, readQuoteSessionFromCookies(request.cookies)) });
  } catch (error) {
    return errorResponse(error);
  }
}
