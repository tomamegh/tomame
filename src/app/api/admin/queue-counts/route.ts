import { NextRequest } from "next/server";

import { getAdminQueueCounts } from "@/db/queries/admin-queues";
import { getUserSession } from "@/features/auth/services/auth.service";
import { canAccessAdmin } from "@/lib/auth/admin-access";
import { APIError, successResponse, errorResponse } from "@/lib/auth/api-helpers";
import { checkRateLimit } from "@/lib/rate-limit";
import { RATE_LIMIT } from "@/config/security";

/**
 * GET /api/admin/queue-counts — what is waiting for a person, as four numbers.
 *
 * Drives the sidebar badges, which is the only thing on the admin that answers
 * "is there anything to do?" without opening four screens.
 *
 * Guarded here as well as by the proxy's `/api/admin` prefix. Both, deliberately
 * — `/api/admin/dashboard` shipped with neither and was readable by anyone
 * (see that route's note).
 */
export async function GET(request: NextRequest) {
  try {
    const ip = request.headers.get("x-forwarded-for") ?? "unknown";
    if (!checkRateLimit(`admin-queues:${ip}`, RATE_LIMIT.admin).allowed) {
      throw new APIError(429, "Too many requests");
    }

    const { session } = await getUserSession();
    if (!canAccessAdmin(session)) throw new APIError(403, "Admin access required");

    return successResponse(await getAdminQueueCounts());
  } catch (error) {
    return errorResponse(error);
  }
}
