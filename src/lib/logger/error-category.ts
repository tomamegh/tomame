/**
 * What kind of failure an `error_events` row is (083).
 *
 * The alert job treats them differently: a new 5xx or a payment fault emails
 * someone the first time it happens; a customer's rejected form only does when
 * it looks like a contract bug (the browser and the route disagreeing), not
 * when a person mistyped a phone number.
 */
export const ERROR_CATEGORIES = [
  "server",
  "server_5xx",
  "client_4xx",
  "client_crash",
  "job",
  "payment",
  "notification",
] as const;

export type ErrorCategory = (typeof ERROR_CATEGORIES)[number];

export function isErrorCategory(value: unknown): value is ErrorCategory {
  return typeof value === "string" && (ERROR_CATEGORIES as readonly string[]).includes(value);
}

const PAYMENT = /paystack|payment|webhook|charge\.|refund/i;
const NOTIFICATION = /notification|resend|whatsapp|e-?mail|send failed/i;

/**
 * Best guess from the words, for the 108 existing `logger.error` call sites
 * that were written before categories existed. An explicit category always
 * wins; the guess only fills the gap.
 */
export function categorise(message: string, source: string | null, explicit?: unknown): ErrorCategory {
  if (isErrorCategory(explicit)) return explicit;
  const src = source ?? "";
  if (src.startsWith("cron:")) return "job";
  if (src.startsWith("client:4xx")) return "client_4xx";
  if (src.startsWith("client:")) return "client_crash";
  const haystack = `${src} ${message}`;
  if (PAYMENT.test(haystack)) return "payment";
  if (NOTIFICATION.test(haystack)) return "notification";
  if (src.startsWith("api:") || src.startsWith("render:")) return "server_5xx";
  return "server";
}

/** An API route's 5xx: a payment route's is a payment fault, the rest are server faults. */
export function apiCategory(route: string | null): ErrorCategory {
  if (route && /\/payments?\/|paystack|\/cars\/checkout/i.test(route)) return "payment";
  if (route && /whatsapp|notifications/i.test(route)) return "notification";
  return "server_5xx";
}
