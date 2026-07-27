import { NextRequest } from "next/server";
import { hubtelCallbackSchema } from "@/features/payments/schema";
import { handleHubtelCallback } from "@/features/payments/services/payments.service";
import { isValidCallbackSecret } from "@/lib/hubtel/client";
import { APIError, successResponse, errorResponse } from "@/lib/auth/api-helpers";
import { checkRateLimit } from "@/lib/rate-limit";
import { RATE_LIMIT } from "@/config/security";
import { logger } from "@/lib/logger";

/**
 * @swagger
 * /api/payments/webhook/hubtel/{secret}:
 *   post:
 *     tags: [Webhooks]
 *     summary: Hubtel payment callback handler
 *     description: >
 *       Receives Hubtel Receive-Money-Prompt callbacks. Hubtel does not sign its
 *       callbacks, so authenticity rests on the unguessable secret in the URL
 *       path, and the payload is never trusted for the payment status — the
 *       handler re-verifies against Hubtel's Transaction Status Check API.
 *       Idempotent.
 *     responses:
 *       200:
 *         description: Callback received and processed
 *       400:
 *         description: Invalid payload
 *       404:
 *         description: Invalid callback secret
 *       429:
 *         description: Rate limit exceeded
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ secret: string }> },
) {
  try {
    const ip = request.headers.get("x-forwarded-for") ?? "unknown";
    if (!checkRateLimit(`webhook-hubtel:${ip}`, RATE_LIMIT.webhooks).allowed) {
      throw new APIError(429, "Too many requests");
    }

    const { secret } = await params;
    if (!isValidCallbackSecret(secret)) {
      logger.warn("Hubtel callback with an invalid secret", { ip });
      // 404 rather than 403 — do not confirm the route exists to a prober.
      throw new APIError(404, "Not found");
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new APIError(400, "Invalid JSON");
    }

    const parsed = hubtelCallbackSchema.safeParse(body);
    if (!parsed.success) {
      logger.warn("Invalid Hubtel callback payload", {
        error: parsed.error.issues[0]?.message,
      });
      throw new APIError(400, "Invalid payload");
    }

    const result = await handleHubtelCallback(parsed.data);
    return successResponse(result);
  } catch (error) {
    return errorResponse(error);
  }
}
