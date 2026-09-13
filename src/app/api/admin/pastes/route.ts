import { NextRequest } from "next/server";

import type { AdminPasteFilter } from "@/db/queries/admin-pastes";
import { getAdminPasteQueue } from "@/features/extraction/services/admin-pastes.service";
import { getUserSession } from "@/features/auth/services/auth.service";
import { canAccessAdmin } from "@/lib/auth/admin-access";
import { APIError, successResponse, errorResponse } from "@/lib/auth/api-helpers";
import { checkRateLimit } from "@/lib/rate-limit";
import { RATE_LIMIT } from "@/config/security";

const FILTERS = ["failed", "unfinished", "all"] as const;

/**
 * GET /api/admin/pastes?filter=failed — the paste queue as an admin sees it.
 *
 * Newest first, unlike the assisted and contact queues: these are jobs, not
 * people. A failure the customer is looking at right now is the one worth acting
 * on, whereas a job that failed three weeks ago has long since been re-pasted or
 * abandoned.
 */
export async function GET(request: NextRequest) {
  try {
    const ip = request.headers.get("x-forwarded-for") ?? "unknown";
    if (!checkRateLimit(`admin-pastes:${ip}`, RATE_LIMIT.admin).allowed) {
      throw new APIError(429, "Too many requests");
    }

    const { session } = await getUserSession();
    if (!canAccessAdmin(session)) throw new APIError(403, "Admin access required");

    const raw = request.nextUrl.searchParams.get("filter");
    const filter = (FILTERS.find((f) => f === raw) ?? "failed") as AdminPasteFilter;

    return successResponse(await getAdminPasteQueue(filter));
  } catch (error) {
    return errorResponse(error);
  }
}
