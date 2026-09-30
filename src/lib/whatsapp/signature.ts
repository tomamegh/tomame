import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Meta signs every webhook delivery: `X-Hub-Signature-256: sha256=<hex>`, an
 * HMAC-SHA256 of the RAW body keyed with the app secret. Verified over the
 * exact bytes received — re-serialising parsed JSON changes them.
 * Constant-time compare; a length mismatch is a plain false.
 */
export function verifyWhatsAppSignature(
  rawBody: string,
  header: string | null,
  appSecret: string,
): boolean {
  if (!header || !header.startsWith("sha256=")) return false;
  const given = Buffer.from(header.slice("sha256=".length), "hex");
  const expected = createHmac("sha256", appSecret).update(rawBody, "utf8").digest();
  if (given.length !== expected.length) return false;
  return timingSafeEqual(given, expected);
}

export function signWhatsAppBody(rawBody: string, appSecret: string): string {
  return `sha256=${createHmac("sha256", appSecret).update(rawBody, "utf8").digest("hex")}`;
}

/** Constant-time string compare, for the webhook verify token. */
export function tokensMatch(given: string, expected: string): boolean {
  const a = Buffer.from(given, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
