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

/** Who may send the assistant a message: one model call each, so it is counted apart from searches. */
export function finderChatRateLimit(subject: string, signedIn: boolean): { key: string; config: { windowMs: number; maxRequests: number } } {
  return { key: `finder-chat:${subject}`, config: signedIn ? RATE_LIMIT.finderChatUser : RATE_LIMIT.finderChatVisitor };
}

/** The chat's answer once a visitor's free taste is used: the next step, never a dead end. */
export const VISITOR_SIGN_IN_MESSAGE =
  "You've had today's free looks. Sign in to keep searching and pricing links: it's free, and this chat stays right here.";

/**
 * A visitor's free taste: searches and link reads share one daily bucket per
 * visitor (their cookie), and a looser one per IP so clearing cookies does not
 * reset it while a carrier IP shared by many customers does not wall them all.
 */
export function visitorTasteLimits(sessionId: string | null, ipSubject: string): Array<{ key: string; config: { windowMs: number; maxRequests: number } }> {
  const ip = { key: `taste:${ipSubject}`, config: RATE_LIMIT.visitorTasteIp };
  return sessionId ? [{ key: `taste:s:${sessionId}`, config: RATE_LIMIT.visitorTaste }, ip] : [{ key: `taste:${ipSubject}`, config: RATE_LIMIT.visitorTaste }];
}

/** The daily message cap, beside the hourly one: tighter for a visitor. */
export function finderChatDayLimit(subject: string, signedIn = false): { key: string; config: { windowMs: number; maxRequests: number } } {
  return { key: `finder-chat-day:${subject}`, config: signedIn ? RATE_LIMIT.finderChatUserDay : RATE_LIMIT.finderChatVisitorDay };
}

/** A signed-in customer's daily fresh link reads (a visitor's are their free taste). */
export function extractionDayLimit(subject: string): { key: string; config: { windowMs: number; maxRequests: number } } {
  return { key: `reads-day:${subject}`, config: RATE_LIMIT.extractionUserDay };
}
