import { NextRequest } from "next/server";

import { RATE_LIMIT } from "@/config/security";
import { getUserSession } from "@/features/auth/services/auth.service";
import { listSourcingQueue } from "@/features/sourcing/services/sourcing.service";
import { canAccessAdmin } from "@/lib/auth/admin-access";
import { APIError, successResponse, errorResponse } from "@/lib/auth/api-helpers";
import { checkRateLimit } from "@/lib/rate-limit";
import type { SourcingStatus } from "@/db/queries/price-watches";

const STATUSES = ["requested", "available", "unavailable"] as const;

/**
 * GET /api/admin/sourcing-requests?status=requested — the buyer's queue (065).
 *
 * Oldest first: every row is a customer holding an item in their bag that they
 * cannot pay for until somebody answers it.
 */
export async function GET(request: NextRequest) {
  try {
    const ip = request.headers.get("x-forwarded-for") ?? "unknown";
    if (!checkRateLimit(`admin-sourcing:${ip}`, RATE_LIMIT.admin).allowed) {
      throw new APIError(429, "Too many requests");
    }

    const { session } = await getUserSession();
    if (!canAccessAdmin(session)) throw new APIError(403, "Admin access required");

    const raw = request.nextUrl.searchParams.get("status");
    const status = (STATUSES.find((s) => s === raw) as SourcingStatus | undefined) ?? null;

    return successResponse(await listSourcingQueue(status));
  } catch (error) {
    return errorResponse(error);
  }
}
