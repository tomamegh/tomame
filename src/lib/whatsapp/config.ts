import { env } from "@/lib/env";

/**
 * WhatsApp (Meta Cloud API) configuration, or null when the channel is off.
 *
 * The channel is ON only when both the access token and the phone number id
 * are set. Every caller asks this first and does nothing when it answers null:
 * no notification rows, no errors, no failed-row spam in the admin log. That is
 * the whole "off until configured" contract.
 *
 * Read at call time (the env getters are lazy), so setting the vars on Vercel
 * and redeploying is all it takes to turn the channel on.
 */
export interface WhatsAppConfig {
  accessToken: string;
  phoneNumberId: string;
  apiVersion: string;
  apiBaseUrl: string;
}

/** A current Graph API version. Override with WHATSAPP_API_VERSION when Meta retires it. */
export const DEFAULT_WHATSAPP_API_VERSION = "v24.0";
const DEFAULT_API_BASE_URL = "https://graph.facebook.com";

/**
 * Partial on purpose: a caller whose env is stubbed without a `whatsapp`
 * section (most unit tests of the services that queue WhatsApp) reads as
 * "not configured", never a TypeError inside a payment or delivery path.
 */
function section(): Partial<typeof env.whatsapp> {
  return (env as Partial<typeof env>).whatsapp ?? {};
}

export function whatsappConfig(): WhatsAppConfig | null {
  const w = section();
  const accessToken = w.accessToken;
  const phoneNumberId = w.phoneNumberId;
  if (!accessToken || !phoneNumberId) return null;
  return {
    accessToken,
    phoneNumberId,
    apiVersion: w.apiVersion ?? DEFAULT_WHATSAPP_API_VERSION,
    apiBaseUrl: (w.apiBaseUrl ?? DEFAULT_API_BASE_URL).replace(/\/+$/, ""),
  };
}

export function isWhatsAppConfigured(): boolean {
  return whatsappConfig() !== null;
}

/** The webhook half. Separate: sending works without it, status callbacks do not. */
export function whatsappWebhookSecrets(): { appSecret: string | null; verifyToken: string | null } {
  const w = section();
  return { appSecret: w.appSecret ?? null, verifyToken: w.verifyToken ?? null };
}
