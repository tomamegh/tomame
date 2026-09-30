import "server-only";

import {
  countOpenCustomerIssues,
  countPackagesByStatusNow,
  findSubjectIdByCode,
  listActivityFeed,
  listCustomerIssuesSince,
  listFirstHubArrivals,
  listHeldOrders,
  listOrderNumbers,
  listPackageReferences,
  listPackagesShippedSince,
  listWarehouseAuditSince,
  listWarehouseStaff,
  summarizeActivitySince,
} from "@/db/queries/warehouse-activity";
import { getProfileNames } from "@/db/queries/warehouse";
import type { PlatformUser } from "@/features/users/types";
import { requireAdmin } from "@/lib/auth/guards";

import { collapseRepeats, describeEntry, referencedIds } from "../describe";
import { dayBounds, encodeCursor, type TimelineFilters } from "../filters";
import {
  dailyThroughput,
  durationStats,
  hubToShipHours,
  operatorRows,
  sealToShipHours,
  staffMember,
  tally,
  totalActions,
} from "../metrics";
import type {
  InsightRange,
  StaffMember,
  TimelinePage,
  WarehouseInsights,
} from "../types";

/**
 * `/admin/warehouse` (082): how the hub is working, and who did what.
 *
 * ADMIN ONLY, checked here as well as by the proxy and the page. This is the one
 * surface that lists every operator's trail side by side, and a warehouse
 * operator passes every warehouse check in the codebase — so `requireAdmin`, not
 * `requireWarehouse`, and never a role read from the profile row.
 */

const DAY = 24 * 60 * 60 * 1000;
export const TIMELINE_PAGE_SIZE = 30;

export async function listStaff(user: PlatformUser): Promise<StaffMember[]> {
  requireAdmin(user);
  return (await listWarehouseStaff()).map(staffMember);
}

export async function getWarehouseInsights(
  user: PlatformUser,
  range: InsightRange,
  now = new Date(),
): Promise<WarehouseInsights> {
  requireAdmin(user);
  // From midnight `range - 1` days ago, so "7 days" is today and the six before.
  const sinceDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - (range - 1) * DAY);
  const since = sinceDate.toISOString();

  const [audit, shipped, byStatus, activity, staffRows, held, issues, openIssues] = await Promise.all([
    listWarehouseAuditSince(since),
    listPackagesShippedSince(since),
    countPackagesByStatusNow(),
    summarizeActivitySince(since),
    listWarehouseStaff(),
    listHeldOrders(),
    listCustomerIssuesSince(since),
    countOpenCustomerIssues(),
  ]);
  const arrivals = await listFirstHubArrivals([...new Set(shipped.flatMap((p) => p.order_ids))]);
  const staff = await staffDirectory(staffRows, [
    ...audit.rows.map((r) => r.actor_id),
    ...activity.map((r) => r.actor_id),
  ]);

  const holds = audit.rows.filter((r) => r.action === "order_held");
  return {
    range,
    since,
    totals: totalActions(audit.rows),
    throughput: dailyThroughput(audit.rows, sinceDate, now),
    hub_to_ship: durationStats(hubToShipHours(shipped, arrivals)),
    seal_to_ship: durationStats(sealToShipHours(shipped)),
    packages_by_status: byStatus,
    operators: operatorRows(audit.rows, activity, staff),
    issues: {
      held_now: held.length,
      held: held.slice(0, 5).map((h) => ({
        order_id: h.id,
        order_no: h.order_no,
        held_at: h.held_at,
        reason: h.hold_reason,
      })),
      holds_in_range: holds.length,
      hold_reasons: tally(
        holds.map((h) => (typeof h.metadata?.reason === "string" ? h.metadata.reason : null)),
      )
        .slice(0, 5)
        .map(({ key, count }) => ({ reason: key, count })),
      customer_issues_in_range: issues.length,
      customer_issues_open: openIssues,
      by_verdict: tally(issues.map((i) => i.verdict)).map(({ key, count }) => ({ verdict: key, count })),
      failed_lookups: activity
        .filter((a) => a.kind === "lookup_failed")
        .reduce((sum, a) => sum + a.events, 0),
    },
    truncated: audit.truncated,
  };
}

export async function listWarehouseTimeline(
  user: PlatformUser,
  filters: TimelineFilters,
): Promise<TimelinePage> {
  requireAdmin(user);
  const { since, until } = dayBounds(filters);
  // A search for a reference that does not exist still searches — by the code
  // itself, which is how a deleted package's rows are found.
  const subjectId = filters.q ? await findSubjectIdByCode(filters.q) : null;

  const rows = await listActivityFeed({
    limit: TIMELINE_PAGE_SIZE + 1,
    before: filters.before,
    since,
    until,
    actorId: filters.actor,
    actions: filters.kind.actions,
    kinds: filters.kind.kinds,
    subjectId,
    code: filters.q,
  });
  const page = rows.slice(0, TIMELINE_PAGE_SIZE);
  const last = page[page.length - 1];

  const orderIds = new Set<string>();
  const packageIds = new Set<string>();
  for (const row of page) {
    const ids = referencedIds(row);
    ids.orders.forEach((id) => orderIds.add(id));
    ids.packages.forEach((id) => packageIds.add(id));
  }
  const [orderNos, packageRefs, staffRows] = await Promise.all([
    listOrderNumbers([...orderIds]),
    listPackageReferences([...packageIds]),
    listWarehouseStaff(),
  ]);
  const staff = await staffDirectory(staffRows, page.map((r) => r.actor_id));
  const ctx = { orderNos: lower(orderNos), packageRefs: lower(packageRefs) };

  return {
    entries: collapseRepeats(page.map((row) => {
      const described = describeEntry(row, ctx);
      return {
        id: `${row.source}:${row.id}`,
        source: row.source,
        action: row.action,
        actor: row.actor_id ? (staff.get(row.actor_id) ?? null) : null,
        actor_role: row.actor_role,
        segments: described.segments,
        note: described.note,
        icon: described.icon,
        tone: described.tone,
        created_at: row.created_at,
        repeat: 1,
        earliest_at: row.created_at,
      };
    })),
    next:
      rows.length > TIMELINE_PAGE_SIZE && last ? encodeCursor({ at: last.created_at, id: last.id }) : null,
  };
}

// ── Internals ───────────────────────────────────────────────────────────────

/**
 * Current staff by id, plus anyone in `actorIds` who no longer holds a staff
 * role — a demoted operator's history still has their name on it.
 */
async function staffDirectory(
  rows: Awaited<ReturnType<typeof listWarehouseStaff>>,
  actorIds: Array<string | null>,
): Promise<Map<string, StaffMember>> {
  const staff = new Map(rows.map((r) => [r.id, staffMember(r)]));
  const missing = [...new Set(actorIds.filter((id): id is string => !!id && !staff.has(id)))];
  if (missing.length > 0) {
    const names = await getProfileNames(missing);
    for (const id of missing) {
      const name = names.get(id);
      const [first = null, ...rest] = name?.split(" ") ?? [];
      staff.set(
        id,
        staffMember({ id, role: "warehouse", first_name: first, last_name: rest.join(" ") || null, email: "Former staff" }),
      );
    }
  }
  return staff;
}

function lower(map: Map<string, string>): Map<string, string> {
  return new Map([...map.entries()].map(([k, v]) => [k.toLowerCase(), v]));
}
