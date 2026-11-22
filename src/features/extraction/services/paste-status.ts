import type { PriceContext } from "@/features/extraction/price-context";
import type { ExtractionJobRow, ExtractionRequestStatus } from "@/db/queries/extraction-requests";
import type { QuoteFacts } from "@/db/queries/extraction-cache";
import type { OpenAssistedRequestSummary } from "@/db/queries/assisted-requests";
import { quoteExpiresAt } from "./paste-quote-clock";

/**
 * What a screen is told about a pasted link.
 *
 * A deliberate subset of the row: the owner columns and the attempt count are
 * bookkeeping, and neither belongs in a response the browser can read. `error` is
 * customer-readable by construction — the job service writes sentences, never
 * vendor messages (see `runExtractionJob`).
 */
export interface PasteStatus {
  id: string;
  product_url: string;
  /** How the JOB went. Not the same question as whether there is a quote — see `outcome`. */
  status: ExtractionRequestStatus;
  /**
   * What the customer can actually do with this link, now.
   *
   * `status: "ready"` only ever meant "the job finished and wrote a cache row".
   * It said nothing about whether that row still resolves or whether it carries
   * a price, and the screen read it as both — so links that had never been
   * priced were labelled "Priced and ready", and following one landed on "This
   * quote is no longer available". These four values are the states that differ
   * in what the customer should be offered:
   *
   * - `reading`  — still queued or running; wait, or describe it.
   * - `priced`   — a live quote with a price; go and see it.
   * - `unpriced` — the page was read but no price came out; describe it.
   * - `expired`  — the 24-hour free quote ran out unpaid (cancelled under that rule); quote it afresh.
   * - `stale`    — still inside the 24 hours, but the stored read lapsed; re-check the price.
   * - `manual`   — no price could be read; a buyer is quoting it by hand (110). Never "lapsed".
   */
  outcome: PasteOutcomeView;
  /** 110: when a priced paste's free quote ends (24 h from when it was first priced). Null otherwise. */
  quote_expires_at: string | null;
  /** 110: set when the price is the catalogue's last check (the live read failed): when it was checked. */
  priced_from_cache_at: string | null;
  /** Store discount / our earlier read of a priced link, as facts (price-context.ts). */
  price_context?: PriceContext | null;
  /**
   * 106: a stale read is being read again. `outcome` describes the figures on
   * hand meanwhile (usually `priced`); the screen marks them "Re-checking price
   * and stock…" and keeps asking until this is false.
   */
  rechecking: boolean;
  /** When the customer last asked for this link to be read: the "Reading…" clock starts here. */
  queued_at: string;
  /** Safe to navigate to ONLY when `outcome` is `priced`. Null otherwise. */
  extraction_cache_id: string | null;
  /** The listing's title once the page has been read; null while reading or when it had none. */
  title: string | null;
  /** Set only when the job failed. A sentence, already fit to show. */
  error: string | null;
  /** When the paste was queued, ISO — the client strikes its own 5 s / 20 s marks from this. */
  created_at: string;
  updated_at: string;
  /**
   * Set when this viewer has already handed the link to a buyer and that request
   * is still open. The screen then shows the human channel and withdraws the
   * machine's options — a second "describe it" for the same link only puts the
   * same job in the buyer's queue twice.
   */
  assisted: PasteAssisted | null;
}

export type PasteOutcomeView = "reading" | "priced" | "unpriced" | "unavailable" | "expired" | "stale" | "manual";

export interface PasteAssisted {
  status: "open" | "contacted";
  /** ISO — when the customer asked. */
  requested_at: string;
}

/**
 * `facts` is the verdict of `getQuoteFacts`, which asks the extraction the same
 * question the review screen asks before rendering. A missing entry means the row
 * could not be read, and is treated as unusable — the safe direction, because the
 * cost of a false "expired" is one re-paste, while a false "priced" is a dead end.
 */
export function toPasteStatus(
  row: ExtractionJobRow,
  facts?: QuoteFacts,
  assisted?: OpenAssistedRequestSummary | null,
  now: number = Date.now(),
): PasteStatus {
  const expiresAt = quoteExpiresAt(row);
  const outcome = resolveOutcome(row, facts, expiresAt, now);

  return {
    id: row.id,
    product_url: row.product_url,
    status: row.status,
    outcome,
    rechecking: (row.status === "pending" || row.status === "running") && outcome !== "reading",
    queued_at: row.queued_at ?? row.created_at,
    quote_expires_at: outcome === "priced" || outcome === "stale" || outcome === "expired" ? expiresAt : null,
    priced_from_cache_at: outcome === "priced" ? (facts?.pricedFromAt ?? null) : null,
    extraction_cache_id: outcome === "priced" ? row.extraction_cache_id : null,
    price_context: outcome === "priced" ? (facts?.priceContext ?? null) : null,
    title: facts?.title ?? null,
    error: row.status === "failed" ? row.error : null,
    created_at: row.created_at,
    updated_at: row.updated_at,
    assisted: assisted ? { status: assisted.status, requested_at: assisted.created_at } : null,
  };
}

function resolveOutcome(row: ExtractionJobRow, facts: QuoteFacts | undefined, expiresAt: string | null, now: number): PasteOutcomeView {
  const lapsed = expiresAt != null && Date.parse(expiresAt) <= now;
  if (row.status === "pending" || row.status === "running") {
    // A re-check (106) keeps showing the read it is replacing while that still stands.
    if (row.extraction_cache_id && facts?.usable && !lapsed) return settled(row, facts);
    return "reading";
  }
  // A failed paste is handed to a buyer (110): it never starts the clock and is never "lapsed".
  if (row.outcome === "manual_quote") return "manual";
  if (row.outcome === "unrecoverable") return "unavailable";
  if (row.status === "failed") return "manual";
  // The 24-hour rule: an unpaid free quote is cancelled when its time is up.
  if (lapsed) return "expired";
  if (!row.extraction_cache_id || !facts?.usable) return expiresAt ? "stale" : "expired";
  return settled(row, facts);
}

function settled(row: ExtractionJobRow, facts: QuoteFacts): PasteOutcomeView {
  if (facts.priced) return "priced";
  if (facts.unavailable) return "unavailable";
  return row.outcome === "manual_quote" ? "manual" : "unpriced";
}
