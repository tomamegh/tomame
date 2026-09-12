import type {
  PriceObservation,
  WatchDeltaBasis,
  WatchDirection,
  WatchSparkline,
  WatchStats,
} from "../types";

/**
 * Everything the price-watch card renders, derived from the observation series
 * and nothing else. Pure and framework-free on purpose: no Supabase, no React,
 * no `Date.now()` unless the caller declines to supply one. That is what makes
 * the delta rules testable, and the delta rules are the part that is easy to
 * get quietly wrong.
 *
 * THE CURRENCY RULE. `total_ghs` is a function of the store price AND the
 * exchange rate that day. If the cedi strengthens overnight, every watched item
 * gets cheaper in GH₵ without a single store changing a price tag — reporting
 * that as "↓ GH₵400 this week" would be a lie the customer acts on. So:
 *
 *   • direction, delta_usd, delta_pct, low_30d, is_lowest_in_30d and the
 *     sparkline are ALL computed from `price_usd`.
 *   • `delta_ghs` is reported separately and labelled as the cedi cost change,
 *     never as a price cut, and `exchange_rate_changed` says whether FX moved
 *     inside the same window.
 *   • the headline figure the card shows (current_total_ghs) is still GH₵,
 *     because that is what the customer pays.
 *
 * THE HONESTY RULE. A watch with 0 or 1 observations has no trend. It gets
 * `has_trend: false`, a null `delta_label`, a null sparkline and the copy "no
 * change yet" — never a fabricated flat line or a zero delta dressed up as
 * "no change".
 */

/** Bars the mock's sparkline draws. Shorter series render fewer, never padded. */
export const SPARKLINE_BARS = 6;

/** Shortest bar, as a percentage of the track, so a low point is still visible. */
const SPARKLINE_MIN_HEIGHT = 20;
const SPARKLINE_MAX_HEIGHT = 100;
/** Height used when every sampled price is identical — a flat line, honestly flat. */
const SPARKLINE_FLAT_HEIGHT = 60;

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;
const MONTH_MS = 30 * DAY_MS;

/** Half a cent: below this, two USD prices are the same price. */
const PRICE_EPSILON = 0.005;
/** Rates are stored at 4–6 dp; anything above this is a real FX move. */
const RATE_EPSILON = 1e-9;

export interface DeriveWatchStatsOptions {
  /** Injected so tests are deterministic. Defaults to now. */
  now?: Date;
}

interface DatedObservation extends PriceObservation {
  at: number;
}

/** The stats for a watch that has never produced a usable reading. */
export function emptyWatchStats(): WatchStats {
  return {
    observation_count: 0,
    current_price_usd: null,
    current_total_ghs: null,
    current_exchange_rate: null,
    has_trend: false,
    direction: "unknown",
    basis: "none",
    delta_usd: null,
    delta_pct: null,
    delta_ghs: null,
    exchange_rate_changed: false,
    low_30d_usd: null,
    is_lowest_in_30d: false,
    delta_label: null,
    status_label: "not checked yet",
    sparkline: null,
  };
}

/**
 * Derive the card's stats from a series of observations.
 *
 * The caller chooses the window by choosing what it passes in: the Home list
 * passes the trailing 30 days, the history endpoint passes `?days=`. Order does
 * not matter — the series is sorted here. Readings with an unparseable date or
 * a non-finite price are discarded rather than trusted.
 */
export function deriveWatchStats(
  observations: readonly PriceObservation[],
  options: DeriveWatchStatsOptions = {},
): WatchStats {
  const series = normaliseSeries(observations);
  if (series.length === 0) return emptyWatchStats();

  const now = (options.now ?? new Date()).getTime();
  const latest = series[series.length - 1];
  if (!latest) return emptyWatchStats();

  const window30 = series.filter((o) => now - o.at <= MONTH_MS);
  // A series whose every reading is older than 30 days still has a "low": its
  // own latest price. Better that than a null the card has to special-case.
  const monthSeries = window30.length > 0 ? window30 : [latest];
  const monthPrices = monthSeries.map((o) => o.price_usd);
  const low30 = Math.min(...monthPrices);
  const high30 = Math.max(...monthPrices);
  const isLowestIn30d =
    monthSeries.length >= 2 &&
    latest.price_usd <= low30 + PRICE_EPSILON &&
    high30 > low30 + PRICE_EPSILON;

  const base: WatchStats = {
    ...emptyWatchStats(),
    observation_count: series.length,
    current_price_usd: latest.price_usd,
    current_total_ghs: latest.total_ghs,
    current_exchange_rate: latest.exchange_rate,
    low_30d_usd: low30,
    is_lowest_in_30d: isLowestIn30d,
  };

  // One reading is a starting point, not a trend.
  if (series.length < 2) {
    return { ...base, status_label: "no change yet" };
  }

  const picked = pickReference(series, now);
  if (!picked) return { ...base, status_label: "no change yet" };

  const { reference, basis } = picked;
  const deltaUsd = round2(latest.price_usd - reference.price_usd);
  const deltaPct =
    reference.price_usd > 0 ? (latest.price_usd - reference.price_usd) / reference.price_usd : null;
  const direction = directionOf(deltaUsd);

  const sparkline = buildSparkline(
    series.map((o) => o.price_usd),
    direction,
  );

  const label = deltaLabel({ direction, basis, deltaUsd, deltaPct, isLowestIn30d });

  return {
    ...base,
    has_trend: true,
    direction,
    basis,
    delta_usd: deltaUsd,
    delta_pct: deltaPct,
    delta_ghs: round2(latest.total_ghs - reference.total_ghs),
    exchange_rate_changed: Math.abs(latest.exchange_rate - reference.exchange_rate) > RATE_EPSILON,
    delta_label: label,
    status_label: label,
    sparkline,
  };
}

// ── Internals ───────────────────────────────────────────────────────────────

function normaliseSeries(observations: readonly PriceObservation[]): DatedObservation[] {
  return observations
    .map((o) => ({ ...o, at: Date.parse(o.observed_at) }))
    .filter(
      (o) =>
        Number.isFinite(o.at) &&
        Number.isFinite(o.price_usd) &&
        Number.isFinite(o.total_ghs) &&
        Number.isFinite(o.exchange_rate),
    )
    .sort((a, b) => a.at - b.at);
}

/**
 * The reading the headline delta is measured against: the most recent one that
 * is at least a week old, so "this week" means this week. When the watch is
 * younger than that, the oldest reading stands in and the label says so rather
 * than claiming a weekly figure.
 *
 * The latest reading is excluded from the candidates — otherwise a series whose
 * every reading predates the cutoff would compare the latest against itself and
 * report a flat "no change" that means "we stopped checking".
 */
function pickReference(
  series: DatedObservation[],
  now: number,
): { reference: DatedObservation; basis: WatchDeltaBasis } | null {
  const candidates = series.slice(0, -1);
  const oldest = candidates[0];
  if (!oldest) return null;

  const cutoff = now - WEEK_MS;
  for (let i = candidates.length - 1; i >= 0; i--) {
    const candidate = candidates[i];
    if (candidate && candidate.at <= cutoff) return { reference: candidate, basis: "7d" };
  }
  return { reference: oldest, basis: "since_start" };
}

function directionOf(deltaUsd: number): WatchDirection {
  if (deltaUsd < -PRICE_EPSILON) return "drop";
  if (deltaUsd > PRICE_EPSILON) return "rise";
  return "flat";
}

/**
 * Normalise prices into bar heights. The lowest sampled price sits at
 * SPARKLINE_MIN_HEIGHT rather than 0 so a bar is always drawn, and a genuinely
 * flat series gets one constant height instead of a fake dip.
 *
 * More than SPARKLINE_BARS readings are downsampled at evenly spaced indices
 * that always include the oldest and the newest, so the last bar is always the
 * current price — no averaging that could hide today's drop.
 */
export function buildSparkline(prices: readonly number[], direction: WatchDirection): WatchSparkline | null {
  if (prices.length < 2) return null;

  const sampled = downsample(prices, SPARKLINE_BARS);
  const min = Math.min(...sampled);
  const max = Math.max(...sampled);
  const span = max - min;

  const bars =
    span <= PRICE_EPSILON
      ? sampled.map(() => SPARKLINE_FLAT_HEIGHT)
      : sampled.map((p) =>
          Math.round(
            SPARKLINE_MIN_HEIGHT + ((p - min) / span) * (SPARKLINE_MAX_HEIGHT - SPARKLINE_MIN_HEIGHT),
          ),
        );

  return { bars, direction };
}

function downsample(values: readonly number[], size: number): number[] {
  if (values.length <= size) return [...values];
  const last = values.length - 1;
  const sampled: number[] = [];
  for (let i = 0; i < size; i++) {
    const value = values[Math.round((i * last) / (size - 1))];
    if (value !== undefined) sampled.push(value);
  }
  return sampled;
}

function deltaLabel(input: {
  direction: WatchDirection;
  basis: WatchDeltaBasis;
  deltaUsd: number;
  deltaPct: number | null;
  isLowestIn30d: boolean;
}): string {
  const { direction, basis, deltaUsd, deltaPct, isLowestIn30d } = input;
  if (direction === "flat" || direction === "unknown") return "no change";

  const arrow = direction === "drop" ? "↓" : "↑";

  // A drop that is also the 30-day low is the headline the mock leads with —
  // percentage form, because "22%" reads louder than "$150" on a cheap item.
  if (direction === "drop" && isLowestIn30d && deltaPct != null) {
    return `${arrow} ${formatPct(deltaPct)} · lowest in 30 days`;
  }

  const amount = formatUsd(Math.abs(deltaUsd));
  return basis === "7d"
    ? `${arrow} ${amount} this week`
    : `${arrow} ${amount} since you started watching`;
}

/** "$150", "$1,299", "$0.80" — whole dollars unless the move is sub-dollar. */
export function formatUsd(amount: number): string {
  if (amount >= 1) return `$${Math.round(amount).toLocaleString("en-US")}`;
  return `$${amount.toFixed(2)}`;
}

function formatPct(fraction: number): string {
  return `${Math.round(Math.abs(fraction) * 100)}%`;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
