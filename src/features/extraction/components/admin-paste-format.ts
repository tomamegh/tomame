import type { AdminTone } from "@/components/layout/admin/admin-page";
import { hostOf } from "@/features/bag/components/format";
import { findStore, type StoreStatus } from "@/features/extraction/stores";
import type { ExtractionRequestStatus } from "@/db/queries/extraction-requests";

/**
 * The paste queue, described for an administrator.
 *
 * WHY THIS EXISTS. `extraction_requests` has had job state since 049 and no
 * administration whatsoever: nobody could see what the extractor was failing on,
 * and — the number that actually decides where engineering time goes — nobody
 * could see WHICH STORES it was failing on. This module turns the rows into that
 * answer and nothing more. Every figure here is counted from rows the database
 * returned; there are no vendor health metrics, no synthetic "reliability
 * scores", no averages over things nothing measures.
 *
 * Pure and framework-free so it can be unit tested without a DOM and shared by
 * the server page and the client list without dragging `server-only` across the
 * boundary.
 */

/** An assisted request still in a buyer's hands, for the link on a row. */
export interface AdminAssistedPointer {
  id: string;
  status: "open" | "contacted";
  created_at: string;
}

/** One paste, as the admin screen renders it. */
export interface AdminPasteView {
  id: string;
  product_url: string;
  /** `amazon.com` — the grouping key, and what the row shows instead of the raw URL. */
  host: string;
  /** The registered store's display name, or null when the host is not one we know. */
  store_name: string | null;
  store_status: StoreStatus | null;
  status: ExtractionRequestStatus;
  attempts: number;
  /** Customer-readable, written by the queue service. Null when it never got that far. */
  error: string | null;
  created_at: string;
  updated_at: string;
  /**
   * `running` for longer than a worker could still be alive — the invocation
   * holding it died (a deploy, a crash, a function timeout) and the sweep has
   * not reclaimed it yet. Decided server-side against the queue's own constant,
   * never re-derived here.
   */
  stalled: boolean;
  /** Whether a signed-in customer or an anonymous quote session pasted it. */
  owner: "customer" | "visitor";
  /** Set when this link has already been handed to a buyer — a re-read is then pointless. */
  assisted: AdminAssistedPointer | null;
}

/** Host-level outcome, counted over the window. */
export interface StorePasteSummary {
  host: string;
  store_name: string | null;
  store_status: StoreStatus | null;
  read: number;
  failed: number;
  /** Still pending or running — counted, but never folded into the rate. */
  unfinished: number;
  total: number;
  /**
   * `failed / (failed + read)`. Null when nothing on this host has FINISHED, so
   * a host with one job still running does not report a 0% failure rate it has
   * not earned.
   */
  failure_rate: number | null;
}

/** The window's totals, same arithmetic as a single host. */
export interface PasteCoverage {
  read: number;
  failed: number;
  unfinished: number;
  finished: number;
  /** `read / (read + failed)`, or null when nothing has finished in the window. */
  read_rate: number | null;
}

interface PasteOutcomeInput {
  product_url: string;
  status: ExtractionRequestStatus;
}

/**
 * Group finished and unfinished pastes by host, worst first.
 *
 * The ordering is the whole point of the card: most failures first, then the
 * busiest host, then alphabetical so the list does not shuffle between renders
 * when two hosts tie. Sorting by RATE instead would put a store that was pasted
 * once and failed once above one that failed forty times out of sixty, which is
 * the opposite of where the work is.
 */
export function summarisePasteHosts(outcomes: readonly PasteOutcomeInput[]): StorePasteSummary[] {
  const byHost = new Map<string, StorePasteSummary>();

  for (const outcome of outcomes) {
    const host = hostOf(outcome.product_url);
    let summary = byHost.get(host);
    if (!summary) {
      // The registry is the authority on what a host IS. A host with no entry is
      // handled by the generic plan, which is worth seeing: an unregistered host
      // failing often is a candidate for a store of its own.
      const store = findStore(outcome.product_url);
      summary = {
        host,
        store_name: store?.name ?? null,
        store_status: store?.status ?? null,
        read: 0,
        failed: 0,
        unfinished: 0,
        total: 0,
        failure_rate: null,
      };
      byHost.set(host, summary);
    }

    summary.total += 1;
    if (outcome.status === "ready") summary.read += 1;
    else if (outcome.status === "failed") summary.failed += 1;
    else summary.unfinished += 1;
  }

  const summaries = [...byHost.values()];
  for (const summary of summaries) {
    const finished = summary.read + summary.failed;
    summary.failure_rate = finished > 0 ? summary.failed / finished : null;
  }

  return summaries.sort(
    (a, b) => b.failed - a.failed || b.total - a.total || a.host.localeCompare(b.host),
  );
}

/** The same counting over every host at once — the headline on the page. */
export function summarisePasteCoverage(outcomes: readonly PasteOutcomeInput[]): PasteCoverage {
  let read = 0;
  let failed = 0;
  let unfinished = 0;

  for (const outcome of outcomes) {
    if (outcome.status === "ready") read += 1;
    else if (outcome.status === "failed") failed += 1;
    else unfinished += 1;
  }

  const finished = read + failed;
  return { read, failed, unfinished, finished, read_rate: finished > 0 ? read / finished : null };
}

/**
 * `44%`, or an em dash when nothing has finished.
 *
 * Never "0%" for "we do not know": a store nothing has finished reading has not
 * earned a perfect record, and a tile that invents one is the exact class of lie
 * this admin is being rebuilt to remove.
 */
export function formatRate(rate: number | null): string {
  if (rate === null || !Number.isFinite(rate)) return "—";
  return `${Math.round(rate * 100)}%`;
}

/** `1 try` / `3 tries`. The plural matters: "1 tries" reads as a bug in the page. */
export function formatAttempts(attempts: number): string {
  const n = Math.max(0, Math.floor(attempts));
  return n === 1 ? "1 try" : `${n} tries`;
}

/** What a row's job state is called on screen. */
export function pasteStatusLabel(status: ExtractionRequestStatus, stalled = false): string {
  if (status === "running") return stalled ? "Stalled" : "Reading";
  if (status === "pending") return "Waiting";
  if (status === "failed") return "Failed";
  return "Read";
}

/**
 * Tone for a job state.
 *
 * Amber keeps its storefront meaning — a PERSON still owes somebody an action —
 * so it is spent on the two states where that is true: a job that gave up (the
 * customer is looking at a dead link) and one whose worker died. A job that is
 * merely queued or reading is the machine's business, and is muted.
 */
export function pasteStatusTone(status: ExtractionRequestStatus, stalled = false): AdminTone {
  if (status === "failed") return "amber";
  if (status === "running") return stalled ? "amber" : "muted";
  if (status === "pending") return "muted";
  return "green";
}

/**
 * Whether re-reading this link would help.
 *
 * Two cases where it would not, and both are honest reasons to grey the button
 * rather than let an admin spend a vendor call on nothing: a job already in
 * flight (the claim would be refused anyway), and a link the customer has
 * already escaped to a buyer — that conversation is now the answer, and a
 * machine read that succeeds behind it just confuses whoever is handling it.
 */
export function canRereadPaste(row: Pick<AdminPasteView, "status" | "assisted">): boolean {
  if (row.status === "running" || row.status === "pending") return false;
  return row.assisted === null;
}

/** Why the re-read button is unavailable, in a sentence a person can act on. */
export function rereadBlockedReason(row: Pick<AdminPasteView, "status" | "assisted">): string | null {
  if (row.status === "pending") return "Already queued — the next sweep will take it.";
  if (row.status === "running") return "A worker is on it now.";
  if (row.assisted) {
    return row.assisted.status === "open"
      ? "A buyer has this one by hand; reading it again would not help."
      : "A buyer is already talking to the customer about this one.";
  }
  return null;
}
