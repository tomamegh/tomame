import { createHash, createVerify, timingSafeEqual } from "node:crypto";
import type { EbayNotificationPublicKey } from "./client";

/**
 * eBay Marketplace Account Deletion notifications — the compliance requirement
 * every production keyset carries. Two exchanges:
 *
 *   GET  ?challenge_code=…  → {"challengeResponse": sha256(code + token + endpointUrl)}
 *   POST <signed JSON>      → 200 once the X-EBAY-SIGNATURE checks out
 *
 * The endpoint URL in the hash is the exact string registered with eBay.
 * Pure functions here; the route owns HTTP and the key lookup.
 */

/** eBay's own rules for the verification token: 32–80 characters of [A-Za-z0-9_-]. */
export function isValidEbayVerifyToken(token: string | null | undefined): token is string {
  return typeof token === "string" && /^[A-Za-z0-9_-]{32,80}$/.test(token);
}

export function ebayChallengeResponse(challengeCode: string, verifyToken: string, endpointUrl: string): string {
  return createHash("sha256").update(challengeCode).update(verifyToken).update(endpointUrl).digest("hex");
}

export interface EbaySignatureHeader {
  alg: string;
  kid: string;
  digest: string;
  signature: string;
}

/** `X-EBAY-SIGNATURE` is base64 of a JSON object naming the key and carrying the signature. */
export function parseEbaySignatureHeader(header: string | null | undefined): EbaySignatureHeader | null {
  if (!header) return null;
  try {
    const parsed = JSON.parse(Buffer.from(header, "base64").toString("utf8")) as Partial<EbaySignatureHeader>;
    if (typeof parsed.kid !== "string" || typeof parsed.signature !== "string") return null;
    return { alg: parsed.alg ?? "ecdsa", kid: parsed.kid, digest: parsed.digest ?? "SHA1", signature: parsed.signature };
  } catch {
    return null;
  }
}

/** eBay serves the key without line breaks; Node wants PEM, 64 characters a line. */
export function toPem(key: string): string {
  if (key.includes("\n")) return key;
  const body = key.replace(/-----BEGIN PUBLIC KEY-----/, "").replace(/-----END PUBLIC KEY-----/, "").replace(/\s+/g, "");
  const lines = body.match(/.{1,64}/g) ?? [];
  return `-----BEGIN PUBLIC KEY-----\n${lines.join("\n")}\n-----END PUBLIC KEY-----\n`;
}

/**
 * ECDSA over the raw request body (eBay's SDK re-serialises the parsed JSON,
 * so that form is accepted too when the raw bytes do not verify).
 */
export function verifyEbayNotificationSignature(rawBody: string, header: EbaySignatureHeader, publicKey: EbayNotificationPublicKey): boolean {
  const digest = (header.digest || publicKey.digest || "SHA1").toUpperCase();
  const pem = toPem(publicKey.key);
  const candidates = [rawBody];
  try {
    candidates.push(JSON.stringify(JSON.parse(rawBody)));
  } catch {
    // not JSON: only the raw bytes can match
  }
  for (const payload of candidates) {
    try {
      if (createVerify(digest).update(payload).verify(pem, header.signature, "base64")) return true;
    } catch {
      return false;
    }
  }
  return false;
}

export interface EbayAccountDeletion {
  notificationId: string | null;
  topic: string | null;
  eventDate: string | null;
  username: string | null;
  userId: string | null;
  eiasToken: string | null;
}

export function parseEbayAccountDeletion(body: unknown): EbayAccountDeletion | null {
  if (!body || typeof body !== "object") return null;
  const b = body as { metadata?: { topic?: unknown }; notification?: { notificationId?: unknown; eventDate?: unknown; data?: { username?: unknown; userId?: unknown; eiasToken?: unknown } } };
  const str = (v: unknown) => (typeof v === "string" ? v : null);
  if (!b.notification || typeof b.notification !== "object") return null;
  return {
    notificationId: str(b.notification.notificationId),
    topic: str(b.metadata?.topic),
    eventDate: str(b.notification.eventDate),
    username: str(b.notification.data?.username),
    userId: str(b.notification.data?.userId),
    eiasToken: str(b.notification.data?.eiasToken),
  };
}

export function tokensEqual(a: string, b: string): boolean {
  const x = Buffer.from(a, "utf8");
  const y = Buffer.from(b, "utf8");
  return x.length === y.length && timingSafeEqual(x, y);
}
