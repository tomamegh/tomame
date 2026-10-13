import { env } from "@/lib/env";

export type EbayEnvironment = "production" | "sandbox";

/**
 * eBay developer credentials (one keyset per environment). `EBAY_ENV` picks
 * the host; the keyset must be the matching one — a production App ID is
 * refused by the sandbox token endpoint and vice versa.
 */
export interface EbayConfig {
  clientId: string;
  clientSecret: string;
  environment: EbayEnvironment;
  /** `https://api.ebay.com` or `https://api.sandbox.ebay.com`. */
  apiBase: string;
}

export function ebayEnvironment(): EbayEnvironment {
  return env.ebay.environment === "sandbox" ? "sandbox" : "production";
}

export function ebayApiBase(environment: EbayEnvironment = ebayEnvironment()): string {
  return environment === "sandbox" ? "https://api.sandbox.ebay.com" : "https://api.ebay.com";
}

/** Null when the keyset is not configured; every eBay tier is skipped then. */
export function ebayConfig(): EbayConfig | null {
  const clientId = env.ebay.clientId;
  const clientSecret = env.ebay.clientSecret;
  if (!clientId || !clientSecret) return null;
  const environment = ebayEnvironment();
  return { clientId, clientSecret, environment, apiBase: ebayApiBase(environment) };
}

export function isEbayConfigured(): boolean {
  return ebayConfig() !== null;
}

/** The shared secret eBay's account-deletion challenge is hashed with. Null until provisioned. */
export function ebayVerifyToken(): string | null {
  return env.ebay.verifyToken;
}
