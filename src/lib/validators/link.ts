import { z } from "zod";

/** `amazon.com/dp/B0X` → `https://amazon.com/dp/B0X`. A link that has a scheme is left alone. */
export function withHttpsScheme(raw: string): string {
  const value = raw.trim();
  return value === "" || /^https?:\/\//i.test(value) ? value : `https://${value}`;
}

/**
 * A web link as people type it: with or without `https://`.
 *
 * `z.url()` alone refused `amazon.com/dp/B0X`, which the paste box treats as a
 * link on purpose (`looksLikeUrl`), so the customer was told "Must be a valid
 * URL" about a link that opens fine in any browser. The scheme is added before
 * the check, and adding it is idempotent, so a page that validates with this
 * schema and sends the parsed value passes the route's copy too.
 */
export function webLinkSchema(message: string) {
  return z.string().trim().transform(withHttpsScheme).pipe(z.url(message));
}
