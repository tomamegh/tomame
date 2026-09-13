import type { ExtractionJobRow, ExtractionRequestStatus } from "@/db/queries/extraction-requests";
import type { QuoteFacts } from "@/db/queries/extraction-cache";
import type { OpenAssistedRequestSummary } from "@/db/queries/assisted-requests";

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
   * - `expired`  — the quote has lapsed or the job failed; paste it again.
   */
  outcome: "reading" | "priced" | "unpriced" | "expired";
  /** Safe to navigate to ONLY when `outcome` is `priced`. Null otherwise. */
  extraction_cache_id: string | null;
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
): PasteStatus {
  const outcome = resolveOutcome(row, facts);

  return {
    id: row.id,
    product_url: row.product_url,
    status: row.status,
    outcome,
    extraction_cache_id: outcome === "priced" ? row.extraction_cache_id : null,
    error: row.status === "failed" ? row.error : null,
    created_at: row.created_at,
    updated_at: row.updated_at,
    assisted: assisted ? { status: assisted.status, requested_at: assisted.created_at } : null,
  };
}

function resolveOutcome(row: ExtractionJobRow, facts?: QuoteFacts): PasteStatus["outcome"] {
  if (row.status === "pending" || row.status === "running") return "reading";
  if (row.status === "failed" || !row.extraction_cache_id) return "expired";
  if (!facts?.usable) return "expired";
  return facts.priced ? "priced" : "unpriced";
}
