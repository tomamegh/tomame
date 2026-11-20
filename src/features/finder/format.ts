import { whatsappHref } from "@/components/layout/marketing/links";
import { formatGhs, formatGhsCompact, formatUsd } from "@/features/marketing/format";

export { formatGhs, formatGhsCompact, formatUsd };

/** 42_000 → "0:42"; 75_000 → "1:15". The working clock. */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

/** 56_000 → "56 s"; 72_000 → "1 min 12 s". How long a finished run took. */
export function formatDuration(ms: number): string {
  const total = Math.max(1, Math.round(ms / 1000));
  if (total < 60) return `${total} s`;
  const s = total % 60;
  return `${Math.floor(total / 60)} min${s ? ` ${s} s` : ""}`;
}

/** 1500 → "Up to GH₵1,500". */
export function formatBudget(budgetGhs: number): string {
  return `Up to ${formatGhsCompact(budgetGhs)}`;
}

/**
 * The customer's typed budget as a whole number of cedis, or null for none.
 * "1,500", "GH₵ 1500" and "1500.00" all read as 1500; anything else is no budget.
 */
export function parseBudgetInput(raw: string): number | null {
  const cleaned = raw.replace(/gh₵|ghs|cedis?|[\s,]/gi, "");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const value = Math.round(Number(cleaned));
  return value > 0 ? value : null;
}

/** wa.me link to a Tomame buyer with the request already typed. */
export function buyerWhatsappHref(number: string, text: string): string | null {
  const base = whatsappHref(number);
  return base ? `${base}?text=${encodeURIComponent(text)}` : null;
}

/** "www.ebay.com/itm/335394957507" → "ebay.com" — what a customer recognises. */
export function storeHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
