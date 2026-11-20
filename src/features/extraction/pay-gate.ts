import { freightCheckPending } from "@/features/pricing/freight-inspection";
import { FREIGHT_CHECKING_MESSAGE } from "./resolvers/messages";
import { PRICE_CONFIRMING_MESSAGE, type PriceConfidence } from "./price-confidence";
import { detectStockSignals, STOCK_CHECK_MESSAGE, STOCK_UNAVAILABLE_MESSAGE } from "./stock-signals";
import type { ExtractionResult } from "./types";

/**
 * THE payable rule (plan A0 + A7 + the freight inspector): one function every
 * pay path asks — the quote screen, the bag, checkout and order intake — so
 * there is one answer to "can this line be paid for now?", not three.
 *
 * A line can sit in the bag while held; it cannot be paid for. Precedence:
 * freight check running → item unavailable → price not confirmed → stock and
 * condition not confirmed. Pure; the caller loads the checks.
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
    if (level === "unconfirmed") return { kind: "price_check", message: PRICE_CONFIRMING_MESSAGE, needs_staff: true };
    // single_source: held while the background re-read runs, and when it disagreed.
    const state = rereadState(checks, now);
    if (state !== "clear") return { kind: "price_check", message: PRICE_CONFIRMING_MESSAGE, needs_staff: state === "staff" };
  }

  if (detectStockSignals(extraction.product).length > 0) {
    const confirmed = stock.some((c) => c.status === "confirmed" && stillValid(c, now));
    if (!confirmed) return { kind: "stock_check", message: STOCK_CHECK_MESSAGE, needs_staff: true };
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

/**
 * Where a single-source price's background re-read stands (its confirmed
 * outcome is counted by `priceConfirmedByStaff`, which checks the price):
 *   running → "auto"; disagreed, waiting on staff → "staff";
 *   could not finish recently → "clear" (payable, as the freight check does);
 *   none yet, or only stale ones → "needed".
 */
function rereadState(checks: readonly QuoteCheckState[], now: number): "auto" | "staff" | "clear" | "needed" {
  const latest = checks.find((c) => c.kind === "price" && c.origin === "system");
  if (!latest) return "needed";
  const age = now - t(latest.created_at);
  if (latest.status === "checking" && age < PRICE_RECHECK_MAX_PENDING_MS) return "auto";
  if (latest.status === "pending") return "staff";
  // A re-read that could not finish (lapsed, or lost while checking) does not hold the price hostage.
  if ((latest.status === "lapsed" || latest.status === "checking") && age < PRICE_RECHECK_LAPSE_HOURS * 3600_000) return "clear";
  return "needed";
}

/** What a line needs created so its hold can clear: the rows `ensureQuoteChecks` inserts. */
export interface ChecksNeeded {
  price: "pending" | "checking" | null;
  stock: boolean;
}

/**
 * Which system checks must exist for this extraction to become payable.
 * `price: "checking"` starts an automatic re-read; `"pending"` asks staff.
 * Nothing is asked for while a matching open check exists or a decision holds.
 */
export function checksNeeded(input: PayGateInput): ChecksNeeded {
  const now = input.now ?? Date.now();
  const { extraction } = input;
  const checks = [...input.checks].sort(newestFirst);
  const open = (kind: QuoteCheckKind) =>
    checks.some((c) => c.kind === kind && c.origin === "system" && (c.status === "pending" || (c.status === "checking" && now - t(c.created_at) < PRICE_RECHECK_MAX_PENDING_MS)));

  let price: ChecksNeeded["price"] = null;
  const level = extraction.price_confidence?.level ?? null;
  const productPrice = extraction.product.price;
  if (productPrice != null && level && level !== "confirmed" && !priceConfirmedByStaff(checks, productPrice, now) && !open("price")) {
    if (level === "unconfirmed") price = "pending";
    else if (rereadState(checks, now) === "needed") price = "checking";
  }

  const stockSystem = checks.filter((c) => c.kind === "stock" && c.origin === "system");
  const decided = stockSystem.some((c) => (c.status === "confirmed" || c.status === "unavailable") && stillValid(c, now));
  const stock = detectStockSignals(extraction.product).length > 0 && !decided && !open("stock");
  return { price, stock };
}
