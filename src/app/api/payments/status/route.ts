import { NextRequest } from "next/server";
import { paymentStatusSchema } from "@/features/payments/schema";
import { getPaymentStatusForUser } from "@/features/payments/services/payments.service";
import { getAuthenticatedUser } from "@/features/auth/services/auth.service";
import { requireAuth } from "@/lib/auth/guards";
import { APIError, successResponse, errorResponse } from "@/lib/auth/api-helpers";
import { checkRateLimit } from "@/lib/rate-limit";
import { RATE_LIMIT } from "@/config/security";

/**
 * @swagger
 * /api/payments/status:
 *   get:
 *     tags: [Payments]
 *     summary: Current status of a payment
 *     description: >
 *       Polled by the checkout screen while the customer approves the Hubtel
 *       mobile money prompt. Re-verifies pending payments against Hubtel's
 *       Transaction Status Check API. Scoped to the calling user.
 *     responses:
 *       200:
 *         description: Current payment status
 *       404:
 *         description: Payment not found
 *       429:
 *         description: Rate limit exceeded
 */
export async function GET(request: NextRequest) {
  try {
    const reference = request.nextUrl.searchParams.get("reference");

    const parsed = paymentStatusSchema.safeParse({ reference });
    if (!parsed.success) {
      throw new APIError(400, parsed.error.issues[0]?.message ?? "Invalid input");
    }

    const user = await getAuthenticatedUser();
    const auth = requireAuth(user);

    // Each poll can hit Hubtel, so throttle per user rather than per IP.
    if (
      !checkRateLimit(`payment-status:${auth.id}`, RATE_LIMIT.paymentStatus)
        .allowed
    ) {
      throw new APIError(429, "Too many requests");
    }

    const data = await getPaymentStatusForUser(auth, parsed.data.reference);
    return successResponse(data);
  } catch (error) {
    return errorResponse(error);
  }
}
