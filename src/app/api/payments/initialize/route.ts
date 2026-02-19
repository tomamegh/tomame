import { NextRequest } from "next/server";
import { initializePaymentSchema } from "@/features/payments/payments.validators";
import { initializePayment } from "@/features/payments/payments.service";
import { getAuthenticatedUser } from "@/lib/auth/session";
import { requireAuth } from "@/lib/auth/guards";
import { successResponse, errorResponse } from "@/lib/auth/api-helpers";
import { checkRateLimit } from "@/lib/rate-limit";
import { RATE_LIMIT } from "@/config/security";

/**
 * @swagger
 * /api/payments/initialize:
 *   post:
 *     tags: [Payments]
 *     summary: Initialize a payment for an order
 *     description: Creates a Paystack transaction and returns the authorization URL for the customer to complete payment.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [orderId]
 *             properties:
 *               orderId:
 *                 type: string
 *                 format: uuid
 *     responses:
 *       201:
 *         description: Payment initialized with authorization URL
 *       400:
 *         description: Validation error or order not eligible for payment
 *       401:
 *         description: Not authenticated
 *       404:
 *         description: Order not found
 *       429:
 *         description: Rate limit exceeded
 */
export async function POST(request: NextRequest) {
  // Rate limit by IP
  const ip = request.headers.get("x-forwarded-for") ?? "unknown";
  const rl = checkRateLimit(`payments-init:${ip}`, RATE_LIMIT.payments);
  if (!rl.allowed) {
    return errorResponse("Too many requests", 429);
  }

  // Validate input
  const body: unknown = await request.json().catch(() => null);
  const parsed = initializePaymentSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(
      parsed.error.issues[0]?.message ?? "Invalid input",
      400
    );
  }

  // Require authenticated user
  const user = await getAuthenticatedUser();
  const auth = requireAuth(user);
  if (!auth.ok) {
    return errorResponse(auth.error, auth.status);
  }

  // Call service
  const result = await initializePayment(auth.user, parsed.data.orderId);

  if (!result.success) {
    return errorResponse(result.error, result.status);
  }

  return successResponse(result.data, 201);
}
