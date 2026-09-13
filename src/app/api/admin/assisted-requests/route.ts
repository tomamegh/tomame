import { NextRequest } from "next/server";

import { listAssistedQueue } from "@/features/assisted/services/assisted.service";
import { getUserSession } from "@/features/auth/services/auth.service";
import { canAccessAdmin } from "@/lib/auth/admin-access";
import { APIError, successResponse, errorResponse } from "@/lib/auth/api-helpers";
import { checkRateLimit } from "@/lib/rate-limit";
import { RATE_LIMIT } from "@/config/security";
import type { AssistedRequestStatus } from "@/db/queries/assisted-requests";

const STATUSES = ["open", "contacted", "resolved", "cancelled"] as const;

/**
 * GET /api/admin/assisted-requests?status=open — the buyer's queue.
 *
 * Oldest first: every row is a customer who has been told a person will get back
 * to them, so the queue is worked front to back, not newest first.
 */
export async function GET(request: NextRequest) {
  try {
    const ip = request.headers.get("x-forwarded-for") ?? "unknown";
    if (!checkRateLimit(`admin-assisted:${ip}`, RATE_LIMIT.admin).allowed) {
      throw new APIError(429, "Too many requests");
    }

    const { session } = await getUserSession();
    if (!canAccessAdmin(session)) throw new APIError(403, "Admin access required");

    const raw = request.nextUrl.searchParams.get("status");
    const status = STATUSES.find((s) => s === raw) as AssistedRequestStatus | undefined;

    return successResponse(await listAssistedQueue(status));
  } catch (error) {
    return errorResponse(error);
  }
}
