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

export type BatchRowKind = "reading" | "pricing" | "ready" | "held" | "unavailable" | "failed" | "assisted" | "manual" | "stale" | "expired";

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
  /** The row offers a fresh read: "Re-check price" (stale) or "Get a fresh quote" (expired). */
  refreshable: boolean;
}

/**
 * One status per row, in the words the plan names: Reading · Ready ·
 * Confirming price · Needs a stock check · Couldn't read. `line` is the
 * server's priced preview for the row, once it has one.
 */
export function batchRowStatus(paste: PasteStatus, line: PasteBatchLine | null): BatchRowStatus {
  const base = { pulse: false, addable: false, askable: false, refreshable: false };
  if (paste.outcome === "reading") return { ...base, kind: "reading", label: "Reading", tone: "progress", pulse: true };
  // A stale read being read again (106): the old figures are not offered until it lands.
  if (paste.rechecking) return { ...base, kind: "reading", label: "Re-checking", tone: "progress", pulse: true };
  // A failed paste is a buyer's job now (110), never a lapsed quote.
  if (paste.outcome === "manual") return { ...base, kind: "manual", label: "A buyer is pricing it", tone: "progress" };
  if (paste.assisted) return { ...base, kind: "assisted", label: "With a buyer", tone: "success" };
  if (paste.outcome === "expired") return { ...base, kind: "expired", label: "Quote expired", tone: "neutral", refreshable: true };
  if (paste.outcome === "stale") return { ...base, kind: "stale", label: "Price needs a re-check", tone: "warning", refreshable: true };
  if (paste.outcome === "unavailable") return { ...base, kind: "unavailable", label: "Out of stock", tone: "warning", askable: true };
  if (paste.outcome !== "priced") return { ...base, kind: "failed", label: "Couldn't read", tone: "warning", askable: true };
  if (!line) return { ...base, kind: "pricing", label: "Pricing", tone: "progress", pulse: true };
  // No total yet: the price is still settling (freight being checked, a
  // category landing) and the preview asks again. Never "Couldn't price" for a
  // price that is about to appear.
  if (line.total_ghs == null && (!line.pricing_unavailable_reason || line.pay_hold?.kind === "freight_check")) {
    return { ...base, kind: "pricing", label: line.pay_hold?.kind === "freight_check" ? "Checking freight" : "Pricing", tone: "progress", pulse: true };
  }
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

/**
 * The free-quote line (site brief Fix 1.6): the exact moment the quote ends and
 * how long is left, in Accra time (GMT, no daylight saving).
 */
export function quoteExpiry(expiresAt: string | null, now: number): { at: string; left: string; lapsed: boolean } | null {
  if (!expiresAt) return null;
  const end = Date.parse(expiresAt);
  if (!Number.isFinite(end)) return null;
  const at = new Date(end).toLocaleString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Africa/Accra",
  });
  const ms = end - now;
  if (ms <= 0) return { at, left: "expired", lapsed: true };
  const minutes = Math.ceil(ms / 60_000);
  const left = minutes >= 60 ? `${Math.floor(minutes / 60)} h ${minutes % 60} min left` : `${minutes} min left`;
  return { at, left, lapsed: false };
}

/** "Checked 11 Nov": when a catalogue price was last read (the live read failed). */
export function checkedOn(iso: string | null): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  return new Date(t).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Africa/Accra" });
}

/** The reading clock: "0:42", and from a minute on, a line saying what happens next. */
export function readingClock(queuedAt: string, now: number): { elapsed: string; note: string | null } {
  const start = Date.parse(queuedAt);
  const seconds = Number.isFinite(start) ? Math.max(0, Math.floor((now - start) / 1000)) : 0;
  const elapsed = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
  const note =
    seconds >= 60
      ? "Some stores take up to two minutes. If we can't read a price, a buyer quotes it for you by hand."
      : null;
  return { elapsed, note };
}
