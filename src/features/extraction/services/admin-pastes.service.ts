import "server-only";

import {
  countAdminPastesByStatus,
  getAdminPasteById,
  listAdminPastes,
  listOpenAssistedRequestsForUrls,
  listRecentPasteOutcomes,
  type AdminPasteFilter,
  type AdminPasteStatusCounts,
} from "@/db/queries/admin-pastes";
import { requeueExtractionRequest, type ExtractionJobRow } from "@/db/queries/extraction-requests";
import { logAuditEvent } from "@/features/audit/services/audit.service";
import { AUDIT_ACTOR_ROLES, AUDIT_ENTITY_TYPES } from "@/config/constants";
import { APIError } from "@/lib/auth/api-helpers";
import { hostOf } from "@/features/bag/components/format";
import { findStore } from "@/features/extraction/stores";
import {
  summarisePasteCoverage,
  summarisePasteHosts,
  type AdminPasteView,
  type PasteCoverage,
  type StorePasteSummary,
} from "../components/admin-paste-format";
import { STALE_RUNNING_MS } from "./extraction-queue.service";

/**
 * What an administrator needs to know about the paste queue.
 *
 * WHY. Extraction coverage is the business's biggest operational problem —
 * several stores come back unreadable — and until now there was no screen that
 * said so. The queue had job state (049), a cron sweep and a customer-facing
 * "this one is being stubborn", and no way for anyone at Tomame to see which
 * links were failing, how often, or on which store.
 *
 * This service assembles that one view. It counts what the rows say and nothing
 * else: there is no vendor health here, no per-resolver success rate, no latency
 * — none of that is recorded anywhere, and inventing it would be worse than
 * leaving the question unanswered.
 */

/**
 * How far back the "which stores are failing" figures look.
 *
 * A month. Long enough that a store pasted a handful of times a week still has a
 * number worth reading, short enough that it describes what the extractor does
 * NOW — a resolver added last Tuesday should not be judged on February.
 */
export const PASTE_WINDOW_DAYS = 30;

export interface AdminPasteQueueView {
  filter: AdminPasteFilter;
  /** The rows being worked, newest first. */
  rows: AdminPasteView[];
  /** Every host pasted in the window, worst first. */
  hosts: StorePasteSummary[];
  coverage: PasteCoverage;
  counts: AdminPasteStatusCounts;
  windowDays: number;
  /** The instant this was assembled, so relative times agree between SSR and hydration. */
  renderedAt: string;
}

export async function getAdminPasteQueue(filter: AdminPasteFilter): Promise<AdminPasteQueueView> {
  const rows = await listAdminPastes(filter);

  // The assisted lookup needs the URLs, so it waits on the rows; the window
  // figures and the status counts do not, and run alongside it.
  const [assisted, outcomes, counts] = await Promise.all([
    listOpenAssistedRequestsForUrls(rows.map((row) => row.product_url)),
    listRecentPasteOutcomes(windowStart()),
    countAdminPastesByStatus(),
  ]);

  const now = Date.now();

  return {
    filter,
    rows: rows.map((row) => toView(row, now, assisted.get(row.product_url) ?? null)),
    hosts: summarisePasteHosts(outcomes),
    coverage: summarisePasteCoverage(outcomes),
    counts,
    windowDays: PASTE_WINDOW_DAYS,
    renderedAt: new Date(now).toISOString(),
  };
}

/**
 * Put one failed paste back on the queue by hand.
 *
 * It does NOT run the job: `runExtractionJob` claims `pending → running`, so a
 * row must be `pending` before anything can pick it up — including the caller,
 * which starts the work with `after()` once this has returned. That split is
 * also what makes an admin re-run safe to overlap with the cron sweep: whichever
 * of the two claims the row first wins, and the other is refused by the same
 * guarded update the queue has always used.
 *
 * Attempts reset to zero. A row that has already burned its three tries would
 * otherwise fail permanently on the first hiccup of the admin's run, and the
 * click would look like it had done nothing at all — an admin asking for a fresh
 * read is asking for a fresh start, not one last gasp.
 */
export async function rerunPaste(adminId: string, id: string): Promise<ExtractionJobRow> {
  const row = await getAdminPasteById(id);
  if (!row) throw new APIError(404, "We have no record of that paste");

  // In flight already. Resetting it to `pending` would let the sweeper start a
  // second worker on a row a live one still holds.
  if (row.status === "running") throw new APIError(409, "A worker is already reading that one.");
  if (row.status === "pending") throw new APIError(409, "That one is already queued for the next sweep.");

  await requeueExtractionRequest(id, 0);

  // Job state is one of the four things CLAUDE.md requires an audit row for, and
  // this is the only path where a person, rather than the queue, changes it.
  await logAuditEvent({
    actorId: adminId,
    actorRole: AUDIT_ACTOR_ROLES.ADMIN,
    action: "extraction_request_requeued",
    entityType: AUDIT_ENTITY_TYPES.JOB,
    entityId: id,
    metadata: {
      product_url: row.product_url,
      from_status: row.status,
      previous_attempts: row.attempts,
    },
  });

  return { ...row, status: "pending", attempts: 0, started_at: null, finished_at: null };
}

function windowStart(): string {
  return new Date(Date.now() - PASTE_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();
}

/** One row, with the two facts only the server can decide attached to it. */
function toView(
  row: ExtractionJobRow,
  now: number,
  assisted: AdminPasteView["assisted"],
): AdminPasteView {
  const store = findStore(row.product_url);
  const startedAt = row.started_at ? new Date(row.started_at).getTime() : null;

  return {
    id: row.id,
    product_url: row.product_url,
    host: hostOf(row.product_url),
    store_name: store?.name ?? null,
    store_status: store?.status ?? null,
    status: row.status,
    attempts: row.attempts,
    error: row.error,
    created_at: row.created_at,
    updated_at: row.updated_at,
    // Measured against the queue's own staleness constant rather than a number
    // invented here, so this screen and the sweeper agree on what "too long"
    // means. A `running` row with no `started_at` is impossible after a claim,
    // and is treated as stalled for the same reason the reclaim does: it is a
    // row nothing will ever finish.
    stalled: row.status === "running" && (startedAt === null || now - startedAt > STALE_RUNNING_MS),
    owner: row.user_id ? "customer" : "visitor",
    assisted,
  };
}
