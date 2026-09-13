import type { NextRequest } from "next/server";

import { RATE_LIMIT } from "@/config/security";
import { getAuthenticatedUser } from "@/features/auth/services/auth.service";
import { checkTransactionWithPaystack } from "@/features/payments/services/admin-verification.service";
import { APIError, errorResponse, successResponse } from "@/lib/auth/api-helpers";
import { requireAdmin, requireAuth } from "@/lib/auth/guards";
import { checkRateLimit } from "@/lib/rate-limit";

/**
 * POST /api/admin/transactions/:id/check
 *
 * Re-verifies a transaction against Paystack and reports the answer WITHOUT
 * changing anything — see `admin-verification.service.ts` for why this is
 * separate from `/sync`, which repairs and therefore has side effects.
 *
 * POST rather than GET even though it mutates nothing locally: it spends a
 * call against Paystack's API, so it should not be something a prefetch or a
 * link preview can trigger.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ip = request.headers.get("x-forwarded-for") ?? "unknown";
    if (!checkRateLimit(`admin-txn-check:${ip}`, RATE_LIMIT.admin).allowed) {
      throw new APIError(429, "Too many requests");
    }

    const { id } = await params;
    if (!id) throw new APIError(400, "Transaction ID required");

    const user = await getAuthenticatedUser();
    const auth = requireAuth(user);
    requireAdmin(auth);

    const result = await checkTransactionWithPaystack(id);
    return successResponse(result);
  } catch (error) {
    return errorResponse(error);
  }
}
