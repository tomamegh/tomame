/**
 * Pure display helpers for the landed-price screen.
 *
 * Framework-free (no React, no `server-only`, no Supabase) so every one of them
 * is unit-testable and so the client island can import them without dragging a
 * server module into the browser bundle — the same contract as
 * `src/features/app-home/components/format.ts`, whose money and receipt helpers
 * this screen reuses rather than duplicating.
 *
 * Nothing here calculates money or invents a fact. A field the extraction did
 * not read produces no chip, and a date the server did not send produces no
 * range; the alternative — a plausible-looking guess — is the one thing this
 * screen cannot afford.
 */

import type { ScrapedProduct } from "@/features/extraction/types";

// ── Counts ───────────────────────────────────────────────────────────────────

const groupedInteger = new Intl.NumberFormat("en-GB", {
  maximumFractionDigits: 0,
});

/**
 * 964 → "964" · 1,240 → "1.2k" · 28,773 → "29k" · 1,240,000 → "1.2m".
 *
 * The mock prints a review count as "38k", so precision is dropped once the
 * number is large enough that the extra digits carry no meaning. Below 10k one
 * decimal survives, because "1.2k" and "1.9k" are genuinely different claims
 * while "28.8k" and "29k" are not.
 */
export function formatCompactCount(count: number): string {
  if (!Number.isFinite(count) || count < 0) return "";
  if (count < 1_000) return groupedInteger.format(Math.round(count));
  if (count < 10_000) return `${trimZero(count / 1_000)}k`;
  if (count < 1_000_000) return `${Math.round(count / 1_000)}k`;
  return `${trimZero(count / 1_000_000)}m`;
}

function trimZero(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

/**
 * "4.6 · 38k" — the mock's rating chip. The count is dropped rather than
 * guessed when the store did not publish one, so the chip reads "4.6".
 * Returns null when there is no rating at all and the chip should not render.
 */
export function formatRatingChip(
  rating: number | null,
  reviewCount: number | null,
): string | null {
  if (rating == null || !Number.isFinite(rating)) return null;
  const stars = trimZero(rating);
  if (reviewCount == null || !Number.isFinite(reviewCount) || reviewCount <= 0) {
    return stars;
  }
  return `${stars} · ${formatCompactCount(reviewCount)}`;
}

// ── Dates ────────────────────────────────────────────────────────────────────

const dayOnly = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  timeZone: "UTC",
});

const dayMonth = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});

const clockTime = new Intl.DateTimeFormat("en-US", {
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
  timeZone: "UTC",
});

function parseCalendarDate(isoDate: string): Date | null {
  const parsed = new Date(`${isoDate.trim()}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function utcDayNumber(date: Date): number {
  return Math.floor(date.getTime() / 86_400_000);
}

/**
 * "22 – 29 Sep" — the delivery window the way the mock prints it, with the
 * month written once when both ends share it ("29 Sep – 3 Oct" when they do
 * not, "22 Sep" when the window is a single day).
 *
 * `delivery_eta_from` / `delivery_eta_to` are bare `YYYY-MM-DD` calendar days
 * computed server-side, so they are formatted in UTC: parsing them in the
 * renderer's local zone would shift the window a day for anyone west of
 * Greenwich, and Ghana is UTC all year.
 *
 * Returns null for anything unparseable or reversed so the caller falls back to
 * the seeded card title instead of printing a nonsense range.
 */
export function formatEtaRange(
  isoFrom: string,
  isoTo: string,
): string | null {
  const from = parseCalendarDate(isoFrom);
  const to = parseCalendarDate(isoTo);
  if (!from || !to) return null;
  if (utcDayNumber(to) < utcDayNumber(from)) return null;

  if (utcDayNumber(to) === utcDayNumber(from)) return dayMonth.format(from);
  if (from.getUTCMonth() === to.getUTCMonth() && from.getUTCFullYear() === to.getUTCFullYear()) {
    return `${dayOnly.format(from)} – ${dayMonth.format(to)}`;
  }
  return `${dayMonth.format(from)} – ${dayMonth.format(to)}`;
}

/**
 * "tomorrow 4:12 PM" · "today 4:12 PM" · "16 Sep 4:12 PM".
 *
 * The instant is `rate_locked_until` from the server — the whole point of the
 * line is that the deadline belongs to a `quote_locks` row and not to the
 * browser, so `now` is passed in rather than read from the clock here, and a
 * lock that has already lapsed returns null so the line disappears instead of
 * advertising an expired price.
 */
export function formatRateLockDeadline(
  isoTimestamp: string,
  now: Date,
): string | null {
  const until = new Date(isoTimestamp);
  if (Number.isNaN(until.getTime()) || Number.isNaN(now.getTime())) return null;
  if (until.getTime() <= now.getTime()) return null;

  const days = utcDayNumber(until) - utcDayNumber(now);
  const time = clockTime.format(until);
  if (days === 0) return `today ${time}`;
  if (days === 1) return `tomorrow ${time}`;
  return `${dayMonth.format(until)} ${time}`;
}

// ── Product facts ────────────────────────────────────────────────────────────

export type SpecChipIcon = "seller" | "brand" | "condition" | "weight" | "rating";

export interface SpecChip {
  key: SpecChipIcon;
  icon: SpecChipIcon;
  /** "Seller", "Brand", … — the light half of the chip. */
  label: string;
  /** The read value — the bold half. Never a placeholder. */
  value: string;
}

/**
 * The mock's five spec chips, built only from facts the extraction actually
 * read. A null field produces no chip: the chips are the customer's evidence
 * that we looked at the real listing, so an invented "Condition: New" would be
 * worse than a shorter row.
 */
export function buildSpecChips(product: ScrapedProduct): SpecChip[] {
  const chips: SpecChip[] = [];

  const push = (key: SpecChipIcon, label: string, value: string | null) => {
    const trimmed = value?.trim();
    if (trimmed) chips.push({ key, icon: key, label, value: trimmed });
  };

  push("seller", "Seller", product.seller);
  push("brand", "Brand", product.brand);
  push("condition", "Condition", product.condition);
  push("weight", "Weight", product.weight);
  push("rating", "Rating", formatRatingChip(product.rating, product.review_count));

  return chips;
}

export interface ProductColour {
  /** The colour the listing has selected, when it states one. */
  selected: string | null;
  /** Every colour the listing offers, as text. */
  options: string[];
}

/** `specifications` keys that different stores use for the chosen colour. */
const COLOUR_KEYS = ["color", "colour", "color name", "colour name"];

/**
 * Colour as TEXT, never as a swatch.
 *
 * The mock draws four colour circles, which would require mapping a store's
 * colour *name* ("Midnight", "Starlight") to a hex value — a value no resolver
 * reads and nothing in the database holds. Painting an approximate circle
 * beside a real product is a lie the customer would reasonably act on, so the
 * names are printed instead and the card is omitted when there are none.
 */
export function pickProductColour(product: ScrapedProduct): ProductColour | null {
  const selected = findColourSpec(product.specifications);

  const raw = product.variants.color ?? product.variants.colour ?? [];
  const options: string[] = [];
  const seen = new Set<string>();
  for (const option of raw) {
    const value = option.trim();
    if (!value) continue;
    const dedupe = value.toLowerCase();
    if (seen.has(dedupe)) continue;
    seen.add(dedupe);
    options.push(value);
  }

  if (!selected && options.length === 0) return null;
  return { selected, options };
}

function findColourSpec(specifications: Record<string, string>): string | null {
  for (const [key, value] of Object.entries(specifications)) {
    if (!COLOUR_KEYS.includes(key.trim().toLowerCase())) continue;
    const trimmed = value?.trim();
    if (trimmed) return trimmed;
  }
  return null;
}

// ── Gallery ──────────────────────────────────────────────────────────────────

export interface GalleryRail {
  /** The thumbnails actually drawn, at most `visible`. */
  thumbs: string[];
  /** How many gallery images the rail could not show; 0 hides the "+N" tile. */
  overflow: number;
}

/**
 * The mock's rail: four 72px thumbs and a "+2" tile for the rest.
 *
 * `images` is already ordered and de-duplicated by `withProductDefaults`, with
 * `images[0] === image`, so the rail needs no sorting — only a cut. The scalar
 * `image` is the fallback for a cache row that predates the gallery field.
 */
export function buildGalleryRail(
  images: readonly string[],
  fallback: string | null,
  visible = 4,
): GalleryRail {
  const source = images.length > 0 ? images : fallback ? [fallback] : [];
  if (source.length <= visible) return { thumbs: [...source], overflow: 0 };
  return { thumbs: source.slice(0, visible), overflow: source.length - visible };
}

// ── Delivery ─────────────────────────────────────────────────────────────────

/**
 * The receipt's delivery line: "Door delivery · Greater Accra".
 *
 * `delivery_zones.name` is the admin's own label and several seeded rows
 * already spell out the mode ("Greater Accra · door delivery"), so the prefix
 * is added only when the name does not already carry it. Blindly prefixing
 * every row produces "Door delivery · Greater Accra · door delivery"; blindly
 * trusting the name loses the mode on a row called just "Kumasi".
 */
export function formatDoorDeliveryLabel(zoneName: string): string {
  const name = zoneName.trim();
  if (!name) return "Door delivery";
  return /deliver/i.test(name) ? name : `Door delivery · ${name}`;
}

// ── Links ────────────────────────────────────────────────────────────────────

/**
 * "amazon.com/Sony-WH-1000XM5…" — the breadcrumb's link pill. The scheme and a
 * leading "www." carry no information in a 520px-wide pill that ellipsises, so
 * they are dropped; everything after the host is kept verbatim because the path
 * is what tells two listings on one store apart.
 *
 * Returns the input unchanged when it is not a parseable URL, which is the
 * honest rendering of whatever is stored.
 */
export function formatProductUrlLabel(productUrl: string): string {
  let parsed: URL;
  try {
    parsed = new URL(productUrl);
  } catch {
    return productUrl;
  }
  const host = parsed.hostname.replace(/^www\./, "");
  const tail = `${parsed.pathname}${parsed.search}`.replace(/\/$/, "");
  return `${host}${tail}`;
}
