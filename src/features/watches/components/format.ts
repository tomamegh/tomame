/**
 * Pure display helpers for the price-watch surfaces.
 *
 * Framework-free (no React, no `server-only`, no Supabase) so the Home card,
 * the watches page and the client islands can all import them, and so every
 * rule below is unit-testable.
 *
 * NOTHING HERE DERIVES A TREND. Every delta, direction and sparkline arrives
 * already computed by `services/watch-stats.ts`, which builds them from
 * `price_usd` alone. Re-deriving anything from `total_ghs` in a component would
 * reintroduce the exact bug that module exists to prevent: the cedi
 * strengthening overnight is not a price cut. These functions only choose
 * colours and words for figures they are handed.
 */

import { formatRelativeTime } from "@/features/app-home/components/format";
import type { PriceWatch, WatchDirection } from "../types";

// ── Direction colours ───────────────────────────────────────────────────────

/**
 * The mock's sparkline draws its five leading bars in this one paper tone.
 * There is no design token for `#EFE4DC` — it appears only inside the
 * placeholder hatch and here — so it stays a literal rather than inventing a
 * token that nothing else shares.
 */
export const SPARKLINE_IDLE_BAR_CLASS = "bg-[#EFE4DC]";

/**
 * Text colour for a delta label. Green reads as good news, so it is reserved
 * for an actual price drop; a rise takes coral; "flat" and "unknown" stay
 * neutral, because a watch with nothing to report must not look like it has
 * something to report.
 */
export function directionTextClass(direction: WatchDirection): string {
  switch (direction) {
    case "drop":
      return "text-tm-green";
    case "rise":
      return "text-tm-coral";
    default:
      return "text-tm-text-3";
  }
}

/**
 * Fill for the sparkline's final bar. Flat and unknown fall back to the idle
 * tone: the mock colours the last bar to call out a move, and there is no move
 * to call out.
 */
export function directionBarClass(direction: WatchDirection): string {
  switch (direction) {
    case "drop":
      return "bg-tm-green";
    case "rise":
      return "bg-tm-coral";
    default:
      return SPARKLINE_IDLE_BAR_CLASS;
  }
}

// ── Sparkline geometry ──────────────────────────────────────────────────────

/**
 * Bar heights arrive as percentages from the server and are clamped again here
 * because they cross the wire: a malformed value would otherwise render as a
 * bar taller than its own track, overlapping the line above it. A non-finite
 * value draws nothing rather than guessing a height.
 */
export function clampBarHeight(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

// ── Copy ────────────────────────────────────────────────────────────────────

/**
 * "checked 6 hrs ago" · "not checked yet".
 *
 * The job runs once a day, so this is the line that stops a customer reading
 * the figures as live. `null` is the honest answer for a watch created since
 * the last run — never "checked just now" on a row that has never been checked.
 *
 * Wraps `formatRelativeTime` rather than re-implementing it so a watch row and
 * a Home receipt row cannot disagree about what "yesterday" means.
 */
export function formatLastChecked(
  lastCheckedAt: string | null,
  now: Date,
): string {
  if (!lastCheckedAt) return "not checked yet";
  const relative = formatRelativeTime(lastCheckedAt, now);
  return relative ? `checked ${relative}` : "last check time unknown";
}

/**
 * The store's hostname — "amazon.com", not "www.amazon.com".
 *
 * Used as a provenance line under the product name, and as the fallback name
 * for a watch whose extraction could not read a title. Returns `null` for an
 * unparseable URL so the caller drops the line instead of printing a fragment.
 */
export function watchStoreLabel(productUrl: string): string | null {
  let host: string;
  try {
    host = new URL(productUrl).hostname;
  } catch {
    return null;
  }
  const stripped = host.replace(/^www\./i, "");
  return stripped.length > 0 ? stripped : null;
}

/**
 * What the row calls the product.
 *
 * `product_name` is a snapshot taken when the link was last read, and the
 * extractor is allowed to come back without a title. The store name is a better
 * fallback than a truncated URL, and the generic last resort still beats
 * rendering an empty row.
 */
export function watchDisplayName(watch: PriceWatch): string {
  const name = watch.product_name?.trim();
  if (name) return name;
  const store = watchStoreLabel(watch.product_url);
  return store ? `Item from ${store}` : "Watched product";
}

/**
 * "3 watching" — the caller's real count of active watches, never the mock's
 * hardcoded 3 (which the mock itself prints above two rows).
 */
export function formatWatchingCount(count: number): string | null {
  if (!Number.isFinite(count) || count <= 0) return null;
  const whole = Math.trunc(count);
  return `${whole} watching`;
}
