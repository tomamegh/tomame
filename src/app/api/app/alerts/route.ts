import type { NextRequest } from "next/server";
import { z } from "zod";

import { getAuthenticatedUser } from "@/features/auth/services/auth.service";
import { listAppAlertsSince } from "@/features/mobile/services/app-alerts.service";
import { requireAuth } from "@/lib/auth/guards";
import { APIError, errorResponse, successResponse } from "@/lib/auth/api-helpers";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { RATE_LIMIT } from "@/config/security";

const sinceSchema = z.iso.datetime({ offset: true });
/** The background check looks back at most a week, however long the phone was off. */
const MAX_LOOKBACK_MS = 7 * 24 * 3_600_000;

/**
 * GET /api/app/alerts?since=<ISO> — the customer's news since their last background check
 * (price drops, stage changes, a rider on the way), for the iPhone app to post. Answers `now`,
 * which the app sends back as the next `since`.
 */
export async function GET(request: NextRequest) {
  try {
    if (!(await checkRateLimit(`app-alerts:${getClientIp(request)}`, RATE_LIMIT.general)).allowed) {
      throw new APIError(429, "Too many requests");
    }
    const user = requireAuth(await getAuthenticatedUser());
    const raw = request.nextUrl.searchParams.get("since");
    const parsed = sinceSchema.safeParse(raw);
    if (!parsed.success) throw new APIError(400, "since must be an ISO date-time");
    const since = new Date(Math.max(new Date(parsed.data).getTime(), Date.now() - MAX_LOOKBACK_MS));
    return successResponse(await listAppAlertsSince(user, since));
  } catch (error) {
    return errorResponse(error);
  }
}
