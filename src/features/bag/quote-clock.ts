import { QUOTE_VALID_HOURS } from "@/config/constants";

/**
 * A bag line's quote clock (115, site brief Fix 14). The stored breakdown on a
 * line is good for QUOTE_VALID_HOURS from `quoted_at`; after that it has
 * expired and is re-quoted at today's rate (by an admin from Admin Bags, or
 * automatically when the customer opens their bag). Pure.
 */
export function quoteExpired(quotedAt: string | null | undefined, now: Date = new Date()): boolean {
  if (!quotedAt) return true;
  const at = Date.parse(quotedAt);
  return !Number.isFinite(at) || now.getTime() - at >= QUOTE_VALID_HOURS * 3_600_000;
}

/** Whole days since the line was quoted, for "quoted 3 days ago". */
export function quoteAgeDays(quotedAt: string | null | undefined, now: Date = new Date()): number | null {
  if (!quotedAt) return null;
  const at = Date.parse(quotedAt);
  return Number.isFinite(at) ? Math.max(0, Math.floor((now.getTime() - at) / 86_400_000)) : null;
}
