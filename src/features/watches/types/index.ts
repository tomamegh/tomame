/**
 * Price-watch domain types.
 *
 * CURRENCY DISCIPLINE (this is the one thing to get right in here):
 * `total_ghs` is only interpretable against the `exchange_rate` that produced
 * it. A GH₵ figure falling because the cedi strengthened is NOT a price cut, so
 * every TREND field below is derived from `price_usd` and says so in its name or
 * its comment. GH₵ appears only as the headline figure the customer pays and as
 * an explicitly-labelled secondary delta.
 */

/** One immutable price reading, as the API returns it. */
export interface PriceObservation {
  /** Store price in USD — the only FX-free signal, and the basis of every trend. */
  price_usd: number;
  /** Landed price in GH₵ at the rate below. Mixes item price and FX. */
  total_ghs: number;
  /** The applied rate that produced `total_ghs`. */
  exchange_rate: number;
  observed_at: string;
}

/** Which way the USD price has moved over the headline window. */
export type WatchDirection = "drop" | "rise" | "flat" | "unknown";

/** Where the headline delta's reference point came from. */
export type WatchDeltaBasis = "7d" | "since_start" | "none";

export interface WatchSparkline {
  /**
   * Bar heights as percentages (0–100), oldest → newest, at most
   * `SPARKLINE_BARS`. Normalised from `price_usd`, never from GH₵. Fewer than
   * `SPARKLINE_BARS` entries means the series is genuinely that short — the
   * card renders what exists rather than padding with invented points.
   */
  bars: number[];
  /** Colour cue for the final bar: green on a drop, neutral on flat. */
  direction: WatchDirection;
}

export interface WatchStats {
  observation_count: number;
  /** Newest reading. null when the watch has never been checked. */
  current_price_usd: number | null;
  current_total_ghs: number | null;
  current_exchange_rate: number | null;
  /** False with 0 or 1 observations: there is nothing to compare against yet. */
  has_trend: boolean;
  /** Derived from price_usd only. */
  direction: WatchDirection;
  basis: WatchDeltaBasis;
  /** USD change vs the reference reading. Negative is a drop. */
  delta_usd: number | null;
  /** Same change as a fraction of the reference price (-0.22 = down 22%). */
  delta_pct: number | null;
  /**
   * GH₵ change over the same window. Carries BOTH the price move and any FX
   * move, so it must never be used to claim a price cut — it is here so a card
   * can show what the customer's cedi cost actually did.
   */
  delta_ghs: number | null;
  /** True when the rate differs between the reference and latest reading. */
  exchange_rate_changed: boolean;
  /** Lowest USD price seen in the trailing 30 days. */
  low_30d_usd: number | null;
  /** Newest USD price is the 30-day low AND the window contains a higher one. */
  is_lowest_in_30d: boolean;
  /** Card copy, e.g. "↓ $150 this week". null while there is no trend. */
  delta_label: string | null;
  /** Always present: the honest fallback when `delta_label` is null. */
  status_label: string;
  sparkline: WatchSparkline | null;
}

/** A watch as the API returns it — DB columns minus internals. */
export interface PriceWatch {
  id: string;
  product_url: string;
  product_name: string | null;
  product_image_url: string | null;
  baseline_price_usd: number | null;
  baseline_total_ghs: number | null;
  last_price_usd: number | null;
  last_total_ghs: number | null;
  last_checked_at: string | null;
  notify_on_drop: boolean;
  is_active: boolean;
  created_at: string;
}

export interface WatchListItem {
  watch: PriceWatch;
  stats: WatchStats;
}

/** A watch the nightly job gave up on after repeated failures. */
export interface RetiredWatch {
  watch: PriceWatch;
  /** Why the last check failed — shown so the customer can judge whether to retry. */
  last_error: string | null;
}

export interface WatchListResponse {
  watches: WatchListItem[];
  /** Powers "3 watching". Count of the caller's ACTIVE watches. */
  watching_count: number;
  /**
   * Watches deactivated by the job, never by the customer. Reported separately
   * rather than dropped: `is_active` means both "paused" and "gave up", and a
   * watch that silently vanishes leaves its owner believing it still runs.
   */
  retired: RetiredWatch[];
}

export interface CreateWatchResult extends WatchListItem {
  /** false when the same link was already being watched (the call is idempotent). */
  created: boolean;
}

export interface WatchHistoryResponse {
  watch_id: string;
  /** The clamped window actually used. */
  days: number;
  observations: PriceObservation[];
  stats: WatchStats;
}

export interface DeleteWatchResult {
  id: string;
  deleted: true;
}

/** What one batch of the re-check job reports back. */
export interface PriceWatchJobSummary {
  checked: number;
  updated: number;
  failed: number;
  deactivated: number;
  /** Price-drop alerts decided this batch (052). Almost always 0. */
  notified: number;
  /**
   * True when the batch claimed a full `PRICE_WATCH_JOB.batchSize` — there is
   * very likely more due work waiting for the next run ten minutes later. Makes
   * "we are behind" visible instead of guessable from the counts.
   */
  more_due: boolean;
}

// ── Price-drop alerts (migration 052) ───────────────────────────────────────

/** Why a reading did or did not produce an alert. */
export type PriceDropReason =
  /** The customer turned `notify_on_drop` off. */
  | "muted"
  /** No usable threshold in `pricing_constants` — alerts are off platform-wide. */
  | "no_threshold"
  /** The reading itself is unusable (non-finite or non-positive). */
  | "no_reading"
  /** Nothing to compare against yet: no baseline and no alert ever sent. */
  | "no_reference"
  /** The price rose or held. */
  | "no_drop"
  /** It fell, but not far enough below the last price we quoted. */
  | "below_threshold"
  /** A real drop. */
  | "drop"
  /** The recipient has no address (deleted between claim and send). */
  | "no_recipient"
  /** The notification write or send blew up; the price check still stands. */
  | "error";

/** The verdict on one reading. Pure output of `decidePriceDrop`. */
export interface PriceDropDecision {
  notify: boolean;
  reason: PriceDropReason;
  /**
   * What the drop was measured against: `notified_price_usd` if an alert has
   * ever been sent, otherwise the baseline. null when there was nothing to
   * compare against.
   */
  reference_price_usd: number | null;
  /** Fall as a fraction of the reference. Negative means the price rose. */
  drop_pct: number | null;
}

/** The freshly-observed figures an alert would quote. All server-computed. */
export interface PriceDropReading {
  priceUsd: number;
  totalGhs: number;
  exchangeRate: number;
}

export interface PriceDropOutcome {
  /** True when an alert was decided and recorded — not a promise it arrived. */
  notified: boolean;
  reason: PriceDropReason;
  /** Whether the transport accepted it. Only present when `notified`. */
  delivered?: boolean;
  drop_pct?: number;
  reference_price_usd?: number;
}
