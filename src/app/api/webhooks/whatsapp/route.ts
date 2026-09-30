import { NextRequest, NextResponse } from "next/server";
import { applyWhatsAppStatuses } from "@/features/notifications/services/whatsapp.service";
import { APIError, errorResponse, successResponse } from "@/lib/auth/api-helpers";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { RATE_LIMIT } from "@/config/security";
import { logger } from "@/lib/logger";
import { whatsappWebhookSecrets } from "@/lib/whatsapp/config";
import { tokensMatch, verifyWhatsAppSignature } from "@/lib/whatsapp/signature";
import { parseWhatsAppWebhook } from "@/lib/whatsapp/webhook";

/**
 * Meta WhatsApp Cloud API webhook.
 *
 * GET  — the subscription handshake: Meta sends `hub.mode=subscribe`,
 *        `hub.verify_token` and `hub.challenge`; we echo the challenge when the
 *        token matches WHATSAPP_VERIFY_TOKEN.
 * POST — delivery receipts (sent / delivered / read / failed) for messages we
 *        sent, verified with X-Hub-Signature-256 (HMAC-SHA256 of the raw body,
 *        keyed with WHATSAPP_APP_SECRET). Inbound customer messages are only
 *        counted for now.
 *
 * Unconfigured secrets answer 503 and process nothing — never an open door.
 */

async function rateLimited(request: NextRequest): Promise<boolean> {
  const ip = getClientIp(request);
  return !(await checkRateLimit(`webhook-whatsapp:${ip}`, RATE_LIMIT.webhooks)).allowed;
}

export async function GET(request: NextRequest) {
  if (await rateLimited(request)) return new NextResponse("Too many requests", { status: 429 });

  const { verifyToken } = whatsappWebhookSecrets();
  if (!verifyToken) return new NextResponse("WhatsApp webhook not configured", { status: 503 });

  const params = request.nextUrl.searchParams;
  const mode = params.get("hub.mode");
  const token = params.get("hub.verify_token") ?? "";
  const challenge = params.get("hub.challenge") ?? "";
  if (mode === "subscribe" && tokensMatch(token, verifyToken)) {
    return new NextResponse(challenge, { status: 200, headers: { "Content-Type": "text/plain" } });
  }
  logger.warn("WhatsApp webhook verification refused", { mode });
  return new NextResponse("Forbidden", { status: 403 });
}

export async function POST(request: NextRequest) {
  try {
    if (await rateLimited(request)) throw new APIError(429, "Too many requests");

    const { appSecret } = whatsappWebhookSecrets();
    if (!appSecret) throw new APIError(503, "WhatsApp webhook not configured");

    const rawBody = await request.text();
    if (!verifyWhatsAppSignature(rawBody, request.headers.get("x-hub-signature-256"), appSecret)) {
      logger.warn("Invalid WhatsApp webhook signature", { ip: getClientIp(request) });
      throw new APIError(401, "Invalid signature");
    }

    let body: unknown;
    try {
      body = JSON.parse(rawBody);
    } catch {
      throw new APIError(400, "Invalid JSON");
    }

    const parsed = parseWhatsAppWebhook(body);
    const result = await applyWhatsAppStatuses(parsed.statuses);
    if (parsed.inboundCount > 0) {
      logger.info("WhatsApp inbound messages received (not handled yet)", { count: parsed.inboundCount });
    }
    return successResponse({ ...result, inbound: parsed.inboundCount });
  } catch (error) {
    return errorResponse(error);
  }
}
