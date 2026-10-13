import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { RATE_LIMIT } from "@/config/security";
import { ebayVerifyToken, isEbayConfigured } from "@/lib/ebay/config";
import { fetchEbayNotificationPublicKey } from "@/lib/ebay/client";
import {
  ebayChallengeResponse,
  isValidEbayVerifyToken,
  parseEbayAccountDeletion,
  parseEbaySignatureHeader,
  verifyEbayNotificationSignature,
} from "@/lib/ebay/account-deletion";

/**
 * eBay Marketplace Account Deletion endpoint — required for a production
 * keyset to be marked compliant.
 *
 * GET  — eBay's handshake: `?challenge_code=…` is answered with the SHA-256 of
 *        challenge code + verification token + this endpoint's URL, as JSON.
 * POST — a signed notification that an eBay user deleted their account. We
 *        hold no eBay user data (we read public listings only), so there is
 *        nothing to erase; the notification is verified and acknowledged.
 *
 * The URL eBay hashes is the exact string registered in the developer portal:
 * `${NEXT_PUBLIC_APP_URL}/api/ebay/account-deletion`.
 */
export const dynamic = "force-dynamic";

function endpointUrl(): string {
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/+$/, "");
  return `${base}/api/ebay/account-deletion`;
}

async function rateLimited(request: NextRequest): Promise<boolean> {
  const ip = getClientIp(request);
  return !(await checkRateLimit(`webhook-ebay:${ip}`, RATE_LIMIT.webhooks)).allowed;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  if (await rateLimited(request)) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  const token = ebayVerifyToken();
  if (!isValidEbayVerifyToken(token)) {
    logger.error("ebay account deletion: EBAY_VERIFY_TOKEN missing or malformed (32-80 chars of A-Z a-z 0-9 _ -)");
    return NextResponse.json({ error: "Endpoint not configured" }, { status: 503 });
  }
  const code = request.nextUrl.searchParams.get("challenge_code");
  if (!code) return NextResponse.json({ error: "Missing challenge_code" }, { status: 400 });

  const challengeResponse = ebayChallengeResponse(code, token, endpointUrl());
  logger.info("ebay account deletion: challenge answered", { endpoint: endpointUrl() });
  return NextResponse.json({ challengeResponse }, { status: 200 });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (await rateLimited(request)) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  const rawBody = await request.text();
  const header = parseEbaySignatureHeader(request.headers.get("x-ebay-signature"));
  if (!header) {
    logger.warn("ebay account deletion: missing or malformed signature header", { ip: getClientIp(request) });
    return NextResponse.json({ error: "Missing signature" }, { status: 412 });
  }

  // The signing key comes from eBay's Notification API, which needs an app
  // token. Without a keyset we cannot verify: refuse, so an unverifiable
  // notification is never acknowledged as handled.
  if (!isEbayConfigured()) {
    logger.error("ebay account deletion: notification received but EBAY_CLIENT_ID / EBAY_CLIENT_SECRET are not set");
    return NextResponse.json({ error: "Endpoint not configured" }, { status: 503 });
  }
  const publicKey = await fetchEbayNotificationPublicKey(header.kid);
  if (!publicKey) {
    logger.error("ebay account deletion: could not fetch the signing key", { kid: header.kid });
    return NextResponse.json({ error: "Signing key unavailable" }, { status: 503 });
  }
  if (!verifyEbayNotificationSignature(rawBody, header, publicKey)) {
    logger.warn("ebay account deletion: signature did not verify", { kid: header.kid, ip: getClientIp(request) });
    return NextResponse.json({ error: "Invalid signature" }, { status: 412 });
  }

  let body: unknown = null;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const deletion = parseEbayAccountDeletion(body);
  // Nothing to erase: Tomame stores no eBay account data. Logged so the
  // acknowledgement is auditable from the function log.
  logger.info("ebay account deletion: notification acknowledged", {
    notificationId: deletion?.notificationId ?? null,
    topic: deletion?.topic ?? null,
    eventDate: deletion?.eventDate ?? null,
    userId: deletion?.userId ?? null,
  });
  return new NextResponse(null, { status: 204 });
}
