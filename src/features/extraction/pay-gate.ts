import { freightCheckPending } from "@/features/pricing/freight-inspection";
import { FREIGHT_CHECKING_MESSAGE } from "./resolvers/messages";
import { PRICE_CHECKING_MESSAGE, PRICE_CONFIRMING_MESSAGE, type PriceConfidence } from "./price-confidence";
import { STOCK_UNAVAILABLE_MESSAGE } from "./stock-signals";
import type { ExtractionResult } from "./types";

/**
 * THE payable rule (plan A0 + A7 + the freight inspector): one function every
 * pay path asks — the quote screen, the bag, checkout and order intake — so
 * there is one answer to "can this line be paid for now?", not three.
 *
 * A line can sit in the bag while held; it cannot be paid for. Precedence:
 * freight check running → item unavailable → price not confirmed. Stock and
 * condition never hold payment (Kelvin, 2026-11-22: "let user purchase
 * freely"). Pure; the caller loads the checks.
 */

export type PayHoldKind = "freight_check" | "unavailable" | "price_check" | "stock_check";

export interface PayHold {
  kind: PayHoldKind;
  /** Customer copy. */
  message: string;
  /** A staff decision is needed (vs. an automatic check that finishes on its own). */
  needs_staff: boolean;
  /** A replacement link staff offered, when the item is unavailable. */
  substitute_url?: string | null;
}

export type QuoteCheckKind = "price" | "stock";
export type QuoteCheckStatus = "checking" | "pending" | "confirmed" | "corrected" | "unavailable" | "dismissed" | "lapsed";
export type QuoteCheckOrigin = "system" | "customer";

/** The parts of a `quote_checks` row the rule reads. */
export interface QuoteCheckState {
  kind: QuoteCheckKind;
  origin: QuoteCheckOrigin;
  status: QuoteCheckStatus;
  created_at: string;
  /** Last change; when a re-read started on a row that was moved to `checking`. */
  updated_at?: string | null;
  /** When an automatic re-read last finished on this row (null: never re-read). */
  reread_at?: string | null;
  valid_until: string | null;
  confirmed_price: number | null;
  substitute_url: string | null;
}

/** How long an automatic price re-read may hold up payment before it is presumed lost. */
export const PRICE_RECHECK_MAX_PENDING_MS = 120_000;

const t = (iso: string | null) => (iso ? Date.parse(iso) : NaN);
const newestFirst = (a: QuoteCheckState, b: QuoteCheckState) => t(b.created_at) - t(a.created_at);

/** Whether a staff decision still holds at `now`. */
function stillValid(c: QuoteCheckState, now: number): boolean {
  return c.valid_until == null || t(c.valid_until) > now;
}

export function priceConfidenceLevelOf(extraction: Pick<ExtractionResult, "price_confidence">): PriceConfidence | null {
  return extraction.price_confidence?.level ?? null;
}

export interface PayGateInput {
  extraction: Pick<ExtractionResult, "freight_inspection" | "price_confidence" | "product">;
  /** Every `quote_checks` row for this extraction (any order). */
  checks: readonly QuoteCheckState[];
  now?: number;
}

/** A staff decision that confirms the price now being quoted. */
function priceConfirmedByStaff(checks: readonly QuoteCheckState[], price: number | null, now: number): boolean {
  if (price == null) return false;
  return checks.some(
    (c) => c.kind === "price" && (c.status === "confirmed" || c.status === "corrected") && stillValid(c, now) && c.confirmed_price != null && Math.abs(c.confirmed_price - price) < 0.005,
  );
}

/** Why this extraction cannot be paid for yet; null when it can. */
export function payHoldOf(input: PayGateInput): PayHold | null {
  const now = input.now ?? Date.now();
  const { extraction } = input;
  const checks = [...input.checks].sort(newestFirst);

  if (freightCheckPending(extraction.freight_inspection, now)) {
    return { kind: "freight_check", message: FREIGHT_CHECKING_MESSAGE, needs_staff: false };
  }

  const stock = checks.filter((c) => c.kind === "stock" && c.origin === "system");
  const latestStock = stock[0] ?? null;
  if (latestStock?.status === "unavailable" && stillValid(latestStock, now)) {
    return { kind: "unavailable", message: STOCK_UNAVAILABLE_MESSAGE, needs_staff: false, substitute_url: latestStock.substitute_url };
  }

  const price = extraction.product.price;
  const level = extraction.price_confidence?.level ?? null;
  if (price != null && level && level !== "confirmed" && !priceConfirmedByStaff(checks, price, now)) {
    // Held while the background re-read runs (or is about to), and on staff
    // when it disagreed — or, for an unconfirmed price, when it could not read.
    const state = rereadState(checks, now, level);
    if (state === "staff" || state === "lost") return { kind: "price_check", message: PRICE_CONFIRMING_MESSAGE, needs_staff: true };
    if (state !== "clear") return { kind: "price_check", message: PRICE_CHECKING_MESSAGE, needs_staff: false };
  }

  return null;
}

/** What checkout and order intake answer (409) when a held line is in the way. */
export function payHoldRefusal(hold: PayHold, title: string | null): string {
  const item = title ? `“${title.length > 60 ? `${title.slice(0, 57)}…` : title}”` : "one of your items";
  switch (hold.kind) {
    case "freight_check":
      return hold.message;
    case "price_check":
      return `We're confirming the price of ${item}. You can pay as soon as it is confirmed.`;
    case "stock_check":
      return `We confirm stock and condition for ${item} before you pay. We'll let you know as soon as it is confirmed.`;
    case "unavailable":
      return `${item.charAt(0).toUpperCase()}${item.slice(1)} is no longer available from the store. Remove it to continue.`;
  }
}

/** How long a re-read that could not finish leaves a single-source price payable before trying again. */
export const PRICE_RECHECK_LAPSE_HOURS = 24;

/** When a `checking` row started: a staff-pending row moved back to checking keeps its `created_at`. */
const checkingSince = (c: QuoteCheckState) => t(c.updated_at ?? c.created_at);

type RereadState = "auto" | "staff" | "clear" | "needed" | "reread" | "lost";

/**
 * Where a price's background re-read stands (its confirmed outcome is counted
 * by `priceConfirmedByStaff`, which checks the price):
 *   running → "auto"; waiting on staff after a re-read → "staff";
 *   a staff row that was never re-read (opened before every price got one) → "reread";
 *   none yet, or only stale ones → "needed".
 * A re-read that could not finish:
 *   single_source → "clear" for a day (payable, as the freight check does);
 *   unconfirmed   → never payable: a lost run is "lost" (goes to staff).
 */
function rereadState(checks: readonly QuoteCheckState[], now: number, level: PriceConfidence): RereadState {
  const latest = checks.find((c) => c.kind === "price" && c.origin === "system");
  if (!latest) return "needed";
  const lapseWindow = now - t(latest.created_at) < PRICE_RECHECK_LAPSE_HOURS * 3600_000;
  if (latest.status === "checking") {
    if (now - checkingSince(latest) < PRICE_RECHECK_MAX_PENDING_MS) return "auto";
    if (level === "unconfirmed") return "lost";
    return lapseWindow ? "clear" : "needed";
  }
  if (latest.status === "pending") return latest.reread_at ? "staff" : "reread";
  if (latest.status === "lapsed" && level === "single_source" && lapseWindow) return "clear";
  return "needed";
}

/**
 * What a line needs done so its hold can clear (`ensureQuoteChecks` does it):
 *   price "checking" — open an automatic re-read;
 *   price "reread"   — re-read the open staff check that never had one;
 *   price "settle"   — a re-read of an unconfirmed price was lost: hand it to staff.
 */
export interface ChecksNeeded {
  price: "checking" | "reread" | "settle" | null;
  stock: boolean;
}

/**
 * Which system checks must exist (or move) for this extraction to become
 * payable. Every non-confirmed price is re-read automatically first; staff
 * are asked only by the re-read's outcome. Nothing is asked for while a
 * matching open check exists or a decision holds.
 */
export function checksNeeded(input: PayGateInput): ChecksNeeded {
  const now = input.now ?? Date.now();
  const { extraction } = input;
  const checks = [...input.checks].sort(newestFirst);
  const open = (kind: QuoteCheckKind) =>
    checks.some((c) => c.kind === kind && c.origin === "system" && (c.status === "pending" || (c.status === "checking" && now - checkingSince(c) < PRICE_RECHECK_MAX_PENDING_MS)));

  let price: ChecksNeeded["price"] = null;
  const level = extraction.price_confidence?.level ?? null;
  const productPrice = extraction.product.price;
  if (productPrice != null && level && level !== "confirmed" && !priceConfirmedByStaff(checks, productPrice, now)) {
    const state = rereadState(checks, now, level);
    if (state === "reread") price = "reread";
    else if (state === "lost") price = "settle";
    else if (state === "needed" && !open("price")) price = "checking";
  }

  // Stock checks are no longer opened: they held payment and lost customers.
  return { price, stock: false };
}
