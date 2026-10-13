import { logger } from "@/lib/logger";
import { ebayConfig, type EbayConfig } from "./config";

/**
 * Application (client-credentials) token for eBay's public APIs — Browse, and
 * the Notification API's public keys. No user sign-in is involved. Cached
 * until a minute before expiry; eBay issues them for two hours.
 */
const APP_SCOPE = "https://api.ebay.com/oauth/api_scope";

let cached: { token: string; expiresAt: number; clientId: string; apiBase: string } | null = null;

export async function getEbayAppToken(config: EbayConfig | null = ebayConfig()): Promise<string | null> {
  if (!config) return null;
  const now = Date.now();
  if (cached && cached.clientId === config.clientId && cached.apiBase === config.apiBase && cached.expiresAt > now + 60_000) {
    return cached.token;
  }
  const basic = Buffer.from(`${config.clientId}:${config.clientSecret}`, "utf8").toString("base64");
  try {
    const res = await fetch(`${config.apiBase}/identity/v1/oauth2/token`, {
      method: "POST",
      headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "client_credentials", scope: APP_SCOPE }).toString(),
      signal: AbortSignal.timeout(10_000),
    });
    const data = (await res.json().catch(() => null)) as { access_token?: string; expires_in?: number; error?: string; error_description?: string } | null;
    if (!res.ok || !data?.access_token) {
      logger.warn("ebay: app token refused", { status: res.status, environment: config.environment, error: data?.error, detail: data?.error_description });
      return null;
    }
    cached = { token: data.access_token, expiresAt: now + (data.expires_in ?? 7200) * 1000, clientId: config.clientId, apiBase: config.apiBase };
    return cached.token;
  } catch (err) {
    logger.warn("ebay: app token request failed", { environment: config.environment, error: err instanceof Error ? err.message : String(err) });
    return null;
  }
}

/** Test seam. */
export function resetEbayTokenCache(): void {
  cached = null;
}

export interface EbayNotificationPublicKey {
  key: string;
  algorithm: string;
  digest: string;
}

const keyCache = new Map<string, EbayNotificationPublicKey>();

/**
 * The public key eBay signed a notification with, by the `kid` in its
 * signature header. Keys rotate rarely, so each is cached for the process.
 */
export async function fetchEbayNotificationPublicKey(kid: string, config: EbayConfig | null = ebayConfig()): Promise<EbayNotificationPublicKey | null> {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(kid)) return null;
  const hit = keyCache.get(kid);
  if (hit) return hit;
  if (!config) return null;
  const token = await getEbayAppToken(config);
  if (!token) return null;
  try {
    const res = await fetch(`${config.apiBase}/commerce/notification/v1/public_key/${encodeURIComponent(kid)}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(10_000),
    });
    const data = (await res.json().catch(() => null)) as EbayNotificationPublicKey | null;
    if (!res.ok || !data?.key) {
      logger.warn("ebay: public key lookup failed", { status: res.status, kid });
      return null;
    }
    keyCache.set(kid, data);
    return data;
  } catch (err) {
    logger.warn("ebay: public key request failed", { kid, error: err instanceof Error ? err.message : String(err) });
    return null;
  }
}
