import { NextRequest, NextResponse } from "next/server";
import { paymentCallbackSchema } from "@/features/payments/payments.validators";
import { handlePaymentCallback } from "@/features/payments/services/payments.service";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";

/**
 * @swagger
 * /api/payments/callback:
 *   get:
 *     tags: [Payments]
 *     summary: Paystack payment callback
 *     description: Paystack redirects the customer here after payment. Verifies the transaction and redirects the user to the appropriate page.
 *     parameters:
 *       - in: query
 *         name: reference
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       302:
 *         description: Redirect to orders page with payment status
 *       400:
 *         description: Invalid reference
 */
export async function GET(request: NextRequest) {
  const reference = request.nextUrl.searchParams.get("reference");

  // Validate
  const parsed = paymentCallbackSchema.safeParse({ reference });
  if (!parsed.success) {
    logger.warn("Invalid payment callback reference", { reference });
    return NextResponse.redirect(
      `${env.app.url}/orders?payment=error`
    );
  }

  // Process the callback
  const result = await handlePaymentCallback(parsed.data.reference);

  if (!result.success) {
    logger.error("Payment callback processing failed", {
      reference: parsed.data.reference,
      error: result.error,
    });
    return NextResponse.redirect(
      `${env.app.url}/orders?payment=error`
    );
  }

  return NextResponse.redirect(result.data.redirectUrl);
}
