import type { PayHold } from "../pay-gate";

/**
 * One pasted link in a batch preview (plan 2b): what the batch list and the
 * one-at-a-time cards show once a link is priced. Built server-side from the
 * bag's own pricing (`previewBatch`); the browser never sums anything.
 */
export interface PasteBatchLine {
  /** The paste (`extraction_requests.id`) this line belongs to. */
  request_id: string;
  extraction_cache_id: string;
  title: string | null;
  image: string | null;
  /** Store display name. */
  store: string | null;
  url: string;
  /** Landed total for one, GHS; null when the line cannot be priced. */
  total_ghs: number | null;
  total_usd: number | null;
  pricing_unavailable_reason: string | null;
  pay_hold: PayHold | null;
  /**
   * The full breakdown the quote page shows (site brief Fix 1.2): item, tax,
   * fee, store shipping when charged, freight incl. customs, rate. Rows are the
   * server's own figures as display strings; empty when the line is not priced.
   */
  receipt: PasteReceiptRow[];
}

export interface PasteReceiptRow {
  key: string;
  label: string;
  value: string;
}

export interface PasteBatchPreview {
  lines: PasteBatchLine[];
  /** The priced lines together, less the consolidation saving. No delivery fee. */
  total_ghs: number;
  total_usd: number;
  consolidation_saving_ghs: number;
  /** Lines that could be paid for today. */
  ready_count: number;
  rate_locked_until: string | null;
}

/** The most links one batch may hold (plan 2b). */
export const PASTE_BATCH_MAX = 10;
