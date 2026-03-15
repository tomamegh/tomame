import { NextRequest } from "next/server";
import { paystackWebhookSchema } from "@/features/payments/payments.validators";
import { handleWebhookEvent } from "@/features/payments/services/payments.service";
import { verifyWebhookSignature } from "@/lib/paystack/client";
import { APIError, successResponse, errorResponse } from "@/lib/auth/api-helpers";
import { checkRateLimit } from "@/lib/rate-limit";
import { RATE_LIMIT } from "@/config/security";
import { logger } from "@/lib/logger";

/**
 * @swagger
 * /api/webhooks/paystack:
 *   post:
 *     tags: [Webhooks]
 *     summary: Paystack webhook handler
 *     description: Receives Paystack webhook events. Validates HMAC-SHA512 signature before processing. Idempotent.
 *     responses:
 *       200:
 *         description: Webhook received and processed
 *       400:
 *         description: Invalid signature or payload
 *       429:
 *         description: Rate limit exceeded
 */
export async function POST(request: NextRequest) {
  try {
    // Rate limit by IP
    const ip = request.headers.get("x-forwarded-for") ?? "unknown";
    if (!checkRateLimit(`webhook-paystack:${ip}`, RATE_LIMIT.webhooks).allowed) {
      throw new APIError(429, "Too many requests");
    }

    // Read raw body for signature verification
    const rawBody = await request.text();

    // Verify HMAC-SHA512 signature
    const signature = request.headers.get("x-paystack-signature");
    if (!signature || !verifyWebhookSignature(rawBody, signature)) {
      logger.warn("Invalid Paystack webhook signature", { ip });
      throw new APIError(400, "Invalid signature");
    }

    // Parse and validate event body
    let body: unknown;
    try {
      body = JSON.parse(rawBody);
    } catch {
      throw new APIError(400, "Invalid JSON");
    }

    const parsed = paystackWebhookSchema.safeParse(body);
    if (!parsed.success) {
      logger.warn("Invalid Paystack webhook payload", {
        error: parsed.error.issues[0]?.message,
      });
      throw new APIError(400, "Invalid payload");
    }

    // Process the event
    const result = await handleWebhookEvent(parsed.data);

    // if (!result.success) {
    //   logger.error("Webhook processing failed", {
    //     event: parsed.data.event,
    //     error: result.error,
    //   });
    //   // Still return 200 to prevent Paystack from retrying
    //   return successResponse({ message: "Processing error" });
    // }

    return successResponse(result);
  } catch (error) {
    return errorResponse(error);
  }
}
