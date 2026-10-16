import type { NextRequest } from "next/server";
import { z } from "zod";

import { RATE_LIMIT } from "@/config/security";
import { getAuthenticatedUser } from "@/features/auth/services/auth.service";
import {
  lookupPaystackReference,
  settlePaystackReference,
} from "@/features/payments/services/admin-verification.service";
import { APIError, errorResponse, successResponse } from "@/lib/auth/api-helpers";
import { requireAdmin, requireAuth } from "@/lib/auth/guards";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

const bodySchema = z.object({
  reference: z.string().min(1).max(120),
  /** false (default) only asks Paystack; true settles if Paystack confirms. */
  settle: z.boolean().optional(),
});

/**
 * POST /api/admin/transactions/by-reference
 *
 * An admin pastes the Paystack reference a customer says they paid on.
 * `{ reference }` asks Paystack and reports what both sides hold, changing
 * nothing. `{ reference, settle: true }` asks again and, only if Paystack
 * confirms the full amount, settles through the normal payment callback.
 */
export async function POST(request: NextRequest) {
  try {
    const ip = getClientIp(request);
    if (!(await checkRateLimit(`admin-txn-ref:${ip}`, RATE_LIMIT.admin)).allowed) {
      throw new APIError(429, "Too many requests");
    }

    const user = await getAuthenticatedUser();
    const admin = requireAdmin(requireAuth(user));

    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw new APIError(400, "A Paystack reference is required");

    const result = parsed.data.settle
      ? await settlePaystackReference(admin, parsed.data.reference)
      : await lookupPaystackReference(parsed.data.reference);
    return successResponse(result);
  } catch (error) {
    return errorResponse(error);
  }
}
