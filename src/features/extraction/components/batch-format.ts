import type { StatusTone } from "@/components/ui/inline-status";
import { HOLD_PILL } from "@/features/quote-checks/hold-copy";
import type { PasteBatchLine } from "../services/paste-batch";
import type { PasteStatus } from "../services/paste-status";
import { looksLikeUrl } from "./buy-for-me-mode";

/**
 * Pure helpers for the many-links box on Buy for me (plan 2b): splitting a
 * paste into links, and the one status each row shows.
 */

/** Every link in a block of pasted text, in order, without repeats. */
export function splitLinks(text: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const token of text.split(/[\s,;]+/)) {
    // Trailing punctuation from a sentence ("…/dp/B0C1.") is not part of the link.
    const candidate = token.trim().replace(/^[<("']+|[>)"'.]+$/g, "");
    if (!candidate || !looksLikeUrl(candidate)) continue;
    const key = candidate.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(candidate);
  }
  return out;
}

/**
 * The links inside whatever was typed or pasted. One token is a link when it
 * looks like one. In a sentence (an app's "Check out this item on Amazon
 * https://a.co/d/…" share text, or several links pasted together) only
 * explicit links count, a scheme or a host with a path, so "Samsung S24 at
 * walmart.com" stays a description for the price finder.
 */
export function linksInText(text: string): string[] {
  const t = text.trim();
  if (!t) return [];
  if (!/\s/.test(t)) return looksLikeUrl(t) ? splitLinks(t) : [];
  return splitLinks(t).filter((l) => /^https?:\/\//i.test(l) || /^[^/\s]+\.[a-z]{2,}\/\S+/i.test(l));
}

export type BatchRowKind = "reading" | "pricing" | "ready" | "held" | "unavailable" | "failed" | "assisted";

export interface BatchRowStatus {
  kind: BatchRowKind;
  label: string;
  tone: StatusTone;
  /** The dot pulses while the row is still moving. */
  pulse: boolean;
  /** The row can go in the bag (priced; a held line may sit in the bag, an unavailable one may not). */
  addable: boolean;
  /** The row offers "Ask a buyer". */
  askable: boolean;
}

/**
 * One status per row, in the words the plan names: Reading · Ready ·
 * Confirming price · Needs a stock check · Couldn't read. `line` is the
 * server's priced preview for the row, once it has one.
 */
export function batchRowStatus(paste: PasteStatus, line: PasteBatchLine | null): BatchRowStatus {
  const base = { pulse: false, addable: false, askable: false };
  if (paste.assisted) return { ...base, kind: "assisted", label: "With a buyer", tone: "success" };
  if (paste.outcome === "reading") return { ...base, kind: "reading", label: "Reading", tone: "progress", pulse: true };
  // A stale read being read again (106): the old figures are not offered until it lands.
  if (paste.rechecking) return { ...base, kind: "reading", label: "Re-checking", tone: "progress", pulse: true };
  if (paste.outcome === "unavailable") return { ...base, kind: "unavailable", label: "Out of stock", tone: "warning", askable: true };
  if (paste.outcome !== "priced") return { ...base, kind: "failed", label: "Couldn't read", tone: "warning", askable: true };
  if (!line) return { ...base, kind: "pricing", label: "Pricing", tone: "progress", pulse: true };
  // No total and no reason yet: the price is still settling, and the preview asks again.
  if (line.total_ghs == null && !line.pricing_unavailable_reason) return { ...base, kind: "pricing", label: "Pricing", tone: "progress", pulse: true };
  if (line.total_ghs == null) return { ...base, kind: "failed", label: "Couldn't price", tone: "warning", askable: true };

  const hold = line.pay_hold;
  if (!hold) return { ...base, kind: "ready", label: "Ready", tone: "success", addable: true };
  if (hold.kind === "unavailable") return { ...base, kind: "unavailable", label: HOLD_PILL.unavailable, tone: "warning" };
  return {
    ...base,
    kind: "held",
    label: HOLD_PILL[hold.kind],
    tone: hold.kind === "stock_check" ? "neutral" : "progress",
    pulse: hold.kind !== "stock_check",
    addable: true,
  };
}
