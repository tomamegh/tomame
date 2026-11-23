import { NextRequest } from "next/server";
import { startMomoPaymentSchema } from "@/features/payments/schema";
import { startMomoPayment } from "@/features/payments/services/momo.service";
import { getAuthenticatedUser } from "@/features/auth/services/auth.service";
import { requireAuth } from "@/lib/auth/guards";
import { APIError, successResponse, errorResponse } from "@/lib/auth/api-helpers";
import { checkRateLimit } from "@/lib/rate-limit";
import { RATE_LIMIT } from "@/config/security";

/**
 * POST /api/payments/momo — send a Mobile Money prompt straight to the phone.
 * Shares the initialize route's rate-limit bucket: it is the same act of
 * starting a payment, only without the hosted checkout.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = requireAuth(await getAuthenticatedUser());
    if (!(await checkRateLimit(`payments-init:${auth.id}`, RATE_LIMIT.payments)).allowed) {
      throw new APIError(429, "Too many payment attempts. Please wait a few minutes and try again.");
    }

    const body: unknown = await request.json().catch(() => { throw new APIError(400, "Invalid JSON"); });
    const parsed = startMomoPaymentSchema.safeParse(body);
    if (!parsed.success) {
      throw new APIError(400, parsed.error.issues[0]?.message ?? "Invalid input");
    }

    return successResponse(await startMomoPayment(auth, parsed.data), 201);
  } catch (error) {
    return errorResponse(error);
  }
}
