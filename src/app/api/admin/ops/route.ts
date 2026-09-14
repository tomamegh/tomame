import type { NextRequest } from "next/server";

import { RATE_LIMIT } from "@/config/security";
import { getAuthenticatedUser } from "@/features/auth/services/auth.service";
import { getOpsOverview } from "@/features/ops/ops.service";
import { APIError, errorResponse, successResponse } from "@/lib/auth/api-helpers";
import { requireAdmin, requireAuth } from "@/lib/auth/guards";
import { checkRateLimit } from "@/lib/rate-limit";

/**
 * GET /api/admin/ops — the operations health overview as JSON, for a scripted
 * check or an external monitor. `/admin/ops` renders the same object server-side.
 * The proxy fails the /api/admin prefix closed; the check stays here too.
 */
export async function GET(request: NextRequest) {
  try {
    const ip = request.headers.get("x-forwarded-for") ?? "unknown";
    if (!checkRateLimit(`admin-ops:${ip}`, RATE_LIMIT.admin).allowed) {
      throw new APIError(429, "Too many requests");
    }
    const user = await getAuthenticatedUser();
    requireAdmin(requireAuth(user));
    return successResponse(await getOpsOverview());
  } catch (error) {
    return errorResponse(error);
  }
}
