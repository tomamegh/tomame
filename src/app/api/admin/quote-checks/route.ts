import { NextRequest } from "next/server";

import { getUserSession } from "@/features/auth/services/auth.service";
import { listQuoteChecks } from "@/features/quote-checks/services/quote-checks.service";
import type { QuoteCheckStatus } from "@/features/extraction/pay-gate";
import { canAccessAdmin } from "@/lib/auth/admin-access";
import { APIError, successResponse, errorResponse } from "@/lib/auth/api-helpers";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { RATE_LIMIT } from "@/config/security";

const STATUSES = ["pending", "confirmed", "corrected", "unavailable", "dismissed", "lapsed"] as const;

/**
 * GET /api/admin/quote-checks?kind=stock|price&status=pending — the "Stock
 * checks" and "Price checks" queues (103). Open checks oldest first; every
 * other status newest first. No status = everything but running re-reads.
 */
export async function GET(request: NextRequest) {
  try {
    const ip = getClientIp(request);
    if (!(await checkRateLimit(`admin-quote-checks:${ip}`, RATE_LIMIT.admin)).allowed) {
      throw new APIError(429, "Too many requests");
    }
    const { session } = await getUserSession();
    if (!canAccessAdmin(session)) throw new APIError(403, "Admin access required");

    const kind = request.nextUrl.searchParams.get("kind");
    if (kind !== "stock" && kind !== "price") throw new APIError(400, "Say which queue: kind=stock or kind=price");
    const raw = request.nextUrl.searchParams.get("status");
    const status = STATUSES.find((s) => s === raw) as QuoteCheckStatus | undefined;

    return successResponse(await listQuoteChecks(kind, status));
  } catch (error) {
    return errorResponse(error);
  }
}
