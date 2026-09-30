import {
  detectCourierProvider,
  formatGhanaPhone,
  normaliseGhanaPhone,
  parseTrackingUrl,
  PROVIDER_LABELS,
  type CourierProvider,
} from "../schema";
import type { OrderCourier } from "../types";

/**
 * Words shared by the admin panel and the customer's card. Pure, so both the
 * client island and the server component use the same sentences, and so the
 * admin's preview is what the customer will actually read.
 */

export function providerName(provider: CourierProvider | null | undefined): string | null {
  return provider && provider !== "other" ? PROVIDER_LABELS[provider] : null;
}

export interface CourierPreviewInput {
  name: string;
  phone: string;
  trackingUrl: string;
}

export interface CourierPreview {
  /** The sentence the customer's bell and email lead with. */
  line: string;
  /** Normalised number, when the typed one is a valid Ghana number. */
  phoneE164: string | null;
  provider: CourierProvider | null;
  /** Why the current fields cannot be sent, or null when they can. */
  problem: string | null;
}

/** What the customer will receive, from what the admin has typed so far. */
export function describeCourierPreview(input: CourierPreviewInput): CourierPreview {
  const name = input.name.trim();
  const phoneRaw = input.phone.trim();
  const urlRaw = input.trackingUrl.trim();

  const phoneE164 = phoneRaw ? normaliseGhanaPhone(phoneRaw) : null;
  const parsedUrl = urlRaw ? parseTrackingUrl(urlRaw) : null;
  const provider = parsedUrl?.ok ? detectCourierProvider(parsedUrl.url) : null;

  let problem: string | null = null;
  if (phoneRaw && !phoneE164) problem = "Use a Ghana number: 024 412 3456 or +233 24 412 3456";
  else if (parsedUrl && !parsedUrl.ok) problem = parsedUrl.message;
  else if (!phoneE164 && !parsedUrl?.ok) problem = "Add the rider's phone number or a tracking link";

  const who = name || "A rider";
  const via = providerName(provider);
  const parts = [`${who} has your package${via ? ` on ${via}` : ""} and is heading to you.`];
  if (phoneE164) parts.push(`Call ${formatGhanaPhone(phoneE164)}.`);
  if (parsedUrl?.ok) parts.push(via ? `Track your rider on ${via}.` : "Track your rider.");

  return { line: parts.join(" "), phoneE164, provider, problem };
}

/**
 * The one-line hint for a list row: "Rider on the way · Track". Null when the
 * row has nothing to say.
 */
export function courierHint(
  courier: OrderCourier | null | undefined,
  orderStatus: string,
): { text: string; trackingUrl: string | null } | null {
  if (!courier || orderStatus !== "in_transit") return null;
  return { text: "Rider on the way", trackingUrl: courier.trackingUrl };
}
