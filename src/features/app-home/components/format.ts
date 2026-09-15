/**
 * Pure display helpers for the Home screen.
 *
 * Framework-free (no React, no `server-only`, no Supabase) so every one of them
 * is unit-testable and so the client island can import them without dragging a
 * server module into the browser bundle.
 *
 * Nothing here calculates money. The figures arrive already priced by
 * `src/lib/pricing/calculator.ts`; these functions only choose how to print
 * them, following the house rules: GH₵ leads, `$` is the echo, percentages come
 * from the breakdown and are never written as a literal.
 */

import { taxRowLabel } from "@/lib/pricing/tax-label";
import type { PricingBreakdown } from "@/lib/pricing";
import { formatRatePill } from "@/components/layout/app/links";
import {
  formatGhs,
  formatPercent,
  formatUsd,
} from "@/features/marketing/format";
import type { TimeOfDay } from "../types";

// ── Greeting ─────────────────────────────────────────────────────────────────

/**
 * "Afternoon, Kwame" — or plain "Afternoon" when the customer has no name on
 * file, rather than greeting someone as "there".
 *
 * `formatGreeting` in `@/components/layout/app/links` is the hour-based twin,
 * used where only a clock is available. Home does not have one: the view model
 * already carries `timeOfDay`, resolved server-side by `timeOfDayFor`. Deriving
 * the word a second time from an hour would let the chip disagree with the rest
 * of the view model, so this joins the name onto the value we were given
 * instead. The name-joining rule is identical to `formatGreeting`'s.
 */
export function formatGreetingFor(
  timeOfDay: TimeOfDay,
  firstName: string | null,
): string {
  const name = firstName?.trim();
  return name ? `${timeOfDay}, ${name}` : timeOfDay;
}

// ── Time ─────────────────────────────────────────────────────────────────────

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

const dayMonth = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});

/**
 * "just now" · "2 min ago" · "3 hrs ago" · "yesterday" · "12 Sep".
 *
 * `now` is always passed in, never read from the clock here, so the value is
 * testable and so a server render and a client hydration cannot disagree about
 * what time it is.
 *
 * Returns `null` for an unparseable timestamp so the caller drops the clause
 * rather than printing "Invalid Date ago". A timestamp in the future (clock
 * skew between the database and the renderer) reads as "just now" — claiming a
 * paste happened "in 3 minutes" would be worse than rounding it to the present.
 */
export function formatRelativeTime(
  isoTimestamp: string,
  now: Date,
): string | null {
  const then = new Date(isoTimestamp);
  if (Number.isNaN(then.getTime()) || Number.isNaN(now.getTime())) return null;

  const elapsed = now.getTime() - then.getTime();
  if (elapsed < MINUTE_MS) return "just now";

  if (elapsed < HOUR_MS) {
    const minutes = Math.floor(elapsed / MINUTE_MS);
    return `${minutes} min ago`;
  }

  if (elapsed < DAY_MS) {
    const hours = Math.floor(elapsed / HOUR_MS);
    return `${hours} ${hours === 1 ? "hr" : "hrs"} ago`;
  }

  const days = Math.floor(elapsed / DAY_MS);
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;

  return dayMonth.format(then);
}

/**
 * `orders.estimated_delivery_date` is a bare `YYYY-MM-DD`, so it is formatted
 * as a UTC date — parsing it in the renderer's local zone would shift it a day
 * for anyone west of Greenwich. Returns `null` on junk so the caller falls back
 * to the stage hint instead of inventing a date.
 *
 * `landed` flips the tense. The same column is the expected date while a parcel
 * is in the air and the arrival date once it is delivered; "Lands 6 Sept" on a
 * delivered order reads as a date that has not happened yet.
 */
export function formatEtaDate(
  isoDate: string,
  options: { landed?: boolean } = {},
): string | null {
  const parsed = new Date(`${isoDate.trim()}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  return `${options.landed ? "Landed" : "Lands"} ${dayMonth.format(parsed)}`;
}

// ── Money ────────────────────────────────────────────────────────────────────

export interface SplitAmount {
  /** "GH₵5,041" — symbol and whole cedis. */
  whole: string;
  /** ".16" — the pesewas, which the design demotes to a smaller, lighter run. */
  fraction: string;
}

/**
 * Splits a formatted GH₵ total so the design can print the pesewas smaller.
 *
 * The split is on the last "." of the already-formatted string rather than on
 * the number, so it inherits `formatGhs`'s grouping and rounding exactly and
 * cannot drift from the figure shown everywhere else. If the formatter ever
 * stops emitting decimals, `fraction` is empty and the caller simply renders
 * nothing extra.
 */
export function splitGhsTotal(amount: number): SplitAmount {
  const formatted = formatGhs(amount);
  const dot = formatted.lastIndexOf(".");
  if (dot === -1) return { whole: formatted, fraction: "" };
  return { whole: formatted.slice(0, dot), fraction: formatted.slice(dot) };
}

// ── Images ───────────────────────────────────────────────────────────────────

/**
 * `next/image` throws for a host it was not configured with, and an extraction
 * snapshot carries whatever URL the store published. `next.config.ts` allows
 * every https host plus two SHEIN CDNs over http, so anything else is rejected
 * here and the caller draws the design's placeholder instead of crashing the
 * card.
 */
const HTTP_IMAGE_HOSTS = new Set(["img.ltwebstatic.com", "img.shein.com"]);

export function safeImageSrc(url: string | null): string | null {
  if (!url) return null;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol === "https:") return url;
  if (parsed.protocol === "http:" && HTTP_IMAGE_HOSTS.has(parsed.hostname)) {
    return url;
  }
  return null;
}

// ── Receipt ──────────────────────────────────────────────────────────────────

export type ReceiptRowIcon = "item" | "tax" | "fee" | "freight" | "rate";

export interface ReceiptRow {
  key: ReceiptRowIcon;
  icon: ReceiptRowIcon;
  label: string;
  value: string;
}

/**
 * The mock's five per-row entrance delays. Not a uniform stagger, so they are
 * literal — same convention as the marketing proof section.
 */
export const RECEIPT_ROW_DELAYS = [
  "0.25s",
  "0.4s",
  "0.55s",
  "0.7s",
  "0.85s",
] as const;

/**
 * The receipt lines, built from the server-priced breakdown.
 *
 * Every percentage comes off the breakdown: the engine charges 4–8% by
 * category and a hardcoded "5%" — the number the mock happens to show — would
 * be false for most orders. The freight line is already in GH₵ because that is
 * what the customer is charged in; the rate line is the last row because it is
 * the thing that turns the dollars above it into the cedis below.
 *
 * A row is omitted rather than guessed when its figure is not a finite number,
 * so a partial breakdown renders a shorter honest receipt instead of "$NaN".
 */
/**
 * "10% value fee", or just "Value fee" when the rate is missing.
 *
 * The amount and the percentage are two different fields, so a row can carry a
 * real figure with no usable rate beside it. Dropping the prefix is honest;
 * `formatPercent(NaN)` would print "NaN% value fee" next to a correct amount.
 *
 * NOT USED FOR TAX. The tax row goes through `taxRowLabel`, because the tax
 * charge is `max(rate, floor)` and this helper would print the rate beside a
 * figure the floor decided.
 */
function labelWithPercent(fraction: number, noun: string): string {
  if (!Number.isFinite(fraction)) {
    return noun.charAt(0).toUpperCase() + noun.slice(1);
  }
  return `${formatPercent(fraction)} ${noun}`;
}

export function buildReceiptRows(pricing: PricingBreakdown): ReceiptRow[] {
  const rows: ReceiptRow[] = [];

  if (Number.isFinite(pricing.item_price_usd)) {
    rows.push({
      key: "item",
      icon: "item",
      label: "Item",
      value: formatUsd(pricing.item_price_usd),
    });
  }

  if (Number.isFinite(pricing.tax_usd)) {
    rows.push({
      key: "tax",
      icon: "tax",
      label: taxRowLabel(pricing, "sales tax"),
      value: formatUsd(pricing.tax_usd),
    });
  }

  if (Number.isFinite(pricing.value_fee_usd)) {
    rows.push({
      key: "fee",
      icon: "fee",
      label: labelWithPercent(pricing.value_fee_percentage, "Tomame fee"),
      value: formatUsd(pricing.value_fee_usd),
    });
  }

  if (Number.isFinite(pricing.flat_rate_ghs)) {
    rows.push({
      key: "freight",
      icon: "freight",
      label: "Freight",
      value: formatGhs(pricing.flat_rate_ghs),
    });
  }

  // Always USD: `exchange_rate` is the buffered USD→GHS rate the total is
  // struck at, whatever currency the store listed the item in.
  const rate = formatRatePill("USD", pricing.exchange_rate);
  if (rate) {
    rows.push({ key: "rate", icon: "rate", label: "Rate", value: rate });
  }

  return rows;
}

// ── Surfaces ─────────────────────────────────────────────────────────────────

/**
 * The design's product-thumbnail placeholder: a 135° hatch in two paper tones,
 * used wherever a product has no usable image. Kept as a literal string so
 * Tailwind's scanner sees the class, and shared so the receipt strip and the
 * journey rows cannot drift apart.
 */
export const PLACEHOLDER_THUMB_CLASS =
  "bg-[repeating-linear-gradient(135deg,#F6EDE7_0_6px,#EFE4DC_6px_12px)]";
