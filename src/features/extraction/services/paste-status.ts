import type { ExtractionJobRow, ExtractionRequestStatus } from "@/db/queries/extraction-requests";

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
  status: ExtractionRequestStatus;
  /** Usable only when `status` is `ready`; that is what the screen navigates to. */
  extraction_cache_id: string | null;
  /** Set only when `status` is `failed`. A sentence, already fit to show. */
  error: string | null;
  /** When the paste was queued, ISO — the client strikes its own 5 s / 20 s marks from this. */
  created_at: string;
  updated_at: string;
}

export function toPasteStatus(row: ExtractionJobRow): PasteStatus {
  return {
    id: row.id,
    product_url: row.product_url,
    status: row.status,
    extraction_cache_id: row.status === "ready" ? row.extraction_cache_id : null,
    error: row.status === "failed" ? row.error : null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}
