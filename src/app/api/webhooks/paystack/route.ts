import { NextRequest } from "next/server";
import { paystackWebhookSchema } from "@/features/payments/payments.validators";
import { handleWebhookEvent } from "@/features/payments/payments.service";
import { verifyWebhookSignature } from "@/lib/paystack/client";
import { successResponse, errorResponse } from "@/lib/auth/api-helpers";
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
  // Rate limit by IP
  const ip = request.headers.get("x-forwarded-for") ?? "unknown";
  const rl = checkRateLimit(`webhook-paystack:${ip}`, RATE_LIMIT.webhooks);
  if (!rl.allowed) {
    return errorResponse("Too many requests", 429);
  }

  // Read raw body for signature verification
  const rawBody = await request.text();

  // Verify HMAC-SHA512 signature
  const signature = request.headers.get("x-paystack-signature");
  if (!signature || !verifyWebhookSignature(rawBody, signature)) {
    logger.warn("Invalid Paystack webhook signature", { ip });
    return errorResponse("Invalid signature", 400);
  }

  // Parse and validate event body
  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return errorResponse("Invalid JSON", 400);
  }

  const parsed = paystackWebhookSchema.safeParse(body);
  if (!parsed.success) {
    logger.warn("Invalid Paystack webhook payload", {
      error: parsed.error.issues[0]?.message,
    });
    return errorResponse("Invalid payload", 400);
  }

  // Process the event
  const result = await handleWebhookEvent(parsed.data);

  if (!result.success) {
    logger.error("Webhook processing failed", {
      event: parsed.data.event,
      error: result.error,
    });
    // Still return 200 to prevent Paystack from retrying
    return successResponse({ message: "Processing error" });
  }

  return successResponse(result.data);
}
