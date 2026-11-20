import { RATE_LIMIT } from "@/config/security";

/**
 * Who may start a fresh run. Pure: the route counts, this names the bucket.
 *
 * A signed-in customer is keyed by their id; a visitor by IP, never by the
 * quote-session cookie (a client can drop it and get a fresh bucket). The
 * same request inside 24 h is answered from the earlier run before this is
 * ever asked, so a repeat costs nothing.
 */
export function finderRateLimit(subject: string, signedIn: boolean): { key: string; config: { windowMs: number; maxRequests: number } } {
  return { key: `finder:${subject}`, config: signedIn ? RATE_LIMIT.finderUser : RATE_LIMIT.finderVisitor };
}

/** The 429's words: what happened and the next step, never a dead end. */
export function finderLimitMessage(signedIn: boolean): string {
  return signedIn
    ? "You have used today's searches. Paste a product link instead, or ask a buyer to find it."
    : "You have used today's searches on this connection. Sign in for more, paste a product link, or ask a buyer.";
}
