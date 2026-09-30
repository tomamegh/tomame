import type {
  ActionTotals,
  DurationStats,
  OperatorRow,
  StaffMember,
  ThroughputDay,
} from "./types";

/**
 * The arithmetic behind `/admin/warehouse` (082). Pure: rows in, figures out,
 * so every total on the page is a tested function of what the database said.
 *
 * Days are UTC days. Ghana is GMT all year, and the admin dashboard buckets the
 * same way — two charts in one admin must not disagree about when Tuesday ends.
 */

export interface MetricAuditRow {
  action: string;
  actor_id: string | null;
  actor_role: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export interface MetricActivityRow {
  actor_id: string;
  kind: string;
  events: number;
  last_at: string;
}

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

function metaNumber(meta: Record<string, unknown> | null, key: string): number | null {
  const v = meta?.[key];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function metaList(meta: Record<string, unknown> | null, key: string): unknown[] {
  const v = meta?.[key];
  return Array.isArray(v) ? v : [];
}

/** Items a `warehouse_package_items_added` row put in: its orders plus its hand-described lines. */
export function itemsPacked(meta: Record<string, unknown> | null): number {
  return metaList(meta, "order_ids").length + Math.max(0, metaNumber(meta, "custom_lines") ?? 0);
}

/** Orders a `warehouse_package_shipped` row moved. An old row without the count is one package, not zero orders. */
export function ordersShipped(meta: Record<string, unknown> | null): number {
  return Math.max(0, metaNumber(meta, "order_count") ?? 0);
}

export function totalActions(rows: readonly MetricAuditRow[]): ActionTotals {
  const totals: ActionTotals = {
    received: 0,
    reweighed: 0,
    packed: 0,
    sealed: 0,
    shipped: 0,
    shipped_orders: 0,
    labels: 0,
    holds: 0,
  };
  for (const row of rows) {
    switch (row.action) {
      case "warehouse_item_received":
        totals.received += 1;
        break;
      case "warehouse_item_reweighed":
        totals.reweighed += 1;
        break;
      case "warehouse_package_items_added":
        totals.packed += itemsPacked(row.metadata);
        break;
      case "warehouse_package_sealed":
        totals.sealed += 1;
        break;
      case "warehouse_package_shipped":
        totals.shipped += 1;
        totals.shipped_orders += ordersShipped(row.metadata);
        break;
      case "warehouse_label_printed":
        totals.labels += 1;
        break;
      case "order_held":
        totals.holds += 1;
        break;
    }
  }
  return totals;
}

export function dayKey(iso: string | Date): string {
  return (typeof iso === "string" ? new Date(iso) : iso).toISOString().slice(0, 10);
}

/**
 * Items received vs orders shipped, per day, zero-filled from `since`'s day to
 * `now`'s. A quiet day is drawn as zero rather than skipped — a chart that joins
 * straight across a dead weekend draws it as steady work.
 */
export function dailyThroughput(
  rows: readonly MetricAuditRow[],
  since: Date,
  now: Date,
): ThroughputDay[] {
  const days = new Map<string, ThroughputDay>();
  const start = Date.UTC(since.getUTCFullYear(), since.getUTCMonth(), since.getUTCDate());
  for (let t = start; t <= now.getTime(); t += DAY) {
    const key = dayKey(new Date(t));
    days.set(key, { day: key, received: 0, shipped: 0 });
  }
  for (const row of rows) {
    const bucket = days.get(dayKey(row.created_at));
    if (!bucket) continue;
    if (row.action === "warehouse_item_received") bucket.received += 1;
    else if (row.action === "warehouse_package_shipped") bucket.shipped += ordersShipped(row.metadata);
  }
  return [...days.values()];
}

export function durationStats(hours: readonly number[]): DurationStats {
  const clean = hours.filter((h) => Number.isFinite(h) && h >= 0).sort((a, b) => a - b);
  if (clean.length === 0) return { count: 0, median_hours: null, mean_hours: null };
  const mid = Math.floor(clean.length / 2);
  const median = clean.length % 2 ? clean[mid]! : (clean[mid - 1]! + clean[mid]!) / 2;
  const mean = clean.reduce((sum, h) => sum + h, 0) / clean.length;
  return { count: clean.length, median_hours: median, mean_hours: mean };
}

export interface ShippedPackage {
  sealed_at: string | null;
  shipped_at: string;
  order_ids: readonly string[];
}

/**
 * Hours from each order's FIRST hub arrival to the moment its package shipped.
 * One sample per order, not per package: a package of six is six customers who
 * each waited. An order with no recorded arrival is left out rather than
 * counted as zero.
 */
export function hubToShipHours(
  packages: readonly ShippedPackage[],
  arrivals: ReadonlyMap<string, string>,
): number[] {
  const out: number[] = [];
  for (const pkg of packages) {
    const shipped = Date.parse(pkg.shipped_at);
    for (const id of pkg.order_ids) {
      const arrived = arrivals.get(id);
      if (!arrived) continue;
      const hours = (shipped - Date.parse(arrived)) / HOUR;
      if (Number.isFinite(hours) && hours >= 0) out.push(hours);
    }
  }
  return out;
}

/** Hours each package sat sealed on the shelf before it left. */
export function sealToShipHours(packages: readonly ShippedPackage[]): number[] {
  const out: number[] = [];
  for (const pkg of packages) {
    if (!pkg.sealed_at) continue;
    const hours = (Date.parse(pkg.shipped_at) - Date.parse(pkg.sealed_at)) / HOUR;
    if (Number.isFinite(hours) && hours >= 0) out.push(hours);
  }
  return out;
}

/** "45 min", "3.2 h", "2.4 days" — or an em dash when there is nothing to measure. */
export function formatDuration(hours: number | null): string {
  if (hours === null || !Number.isFinite(hours)) return "–";
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))} min`;
  if (hours < 48) return `${Number(hours.toFixed(1))} h`;
  return `${Number((hours / 24).toFixed(1))} days`;
}

/**
 * One row per person who did anything at the hub in the range, busiest last-
 * active first. Sign-ins do not count as actions — an operator who signed in
 * five times and logged nothing in has done nothing the table should credit.
 */
export function operatorRows(
  audit: readonly MetricAuditRow[],
  activity: readonly MetricActivityRow[],
  staff: ReadonlyMap<string, StaffMember>,
): OperatorRow[] {
  const rows = new Map<string, OperatorRow>();
  const row = (id: string, fallbackRole: string): OperatorRow => {
    let r = rows.get(id);
    if (!r) {
      const person = staff.get(id);
      r = {
        actor_id: id,
        name: person?.name ?? "Former staff",
        initials: person?.initials ?? "?",
        role: person?.role ?? (fallbackRole === "admin" ? "admin" : "warehouse"),
        actions: 0,
        received: 0,
        shipped: 0,
        labels: 0,
        scans: 0,
        failed_lookups: 0,
        page_views: 0,
        last_active: null,
      };
      rows.set(id, r);
    }
    return r;
  };
  const touch = (r: OperatorRow, at: string) => {
    if (!r.last_active || at > r.last_active) r.last_active = at;
  };

  for (const a of audit) {
    if (!a.actor_id) continue;
    const r = row(a.actor_id, a.actor_role);
    touch(r, a.created_at);
    if (a.action === "user_logged_in") continue;
    r.actions += 1;
    if (a.action === "warehouse_item_received") r.received += 1;
    if (a.action === "warehouse_package_shipped") r.shipped += 1;
    if (a.action === "warehouse_label_printed") r.labels += 1;
  }
  for (const s of activity) {
    const r = row(s.actor_id, "warehouse");
    touch(r, s.last_at);
    if (s.kind === "scan") r.scans += s.events;
    if (s.kind === "lookup_failed") {
      r.scans += s.events;
      r.failed_lookups += s.events;
    }
    if (s.kind === "page_view") r.page_views += s.events;
  }
  return [...rows.values()].sort((a, b) => (b.last_active ?? "").localeCompare(a.last_active ?? ""));
}

/** `[{ reason, count }]`, most common first, blank reasons grouped as "No reason given". */
export function tally(values: ReadonlyArray<string | null>): Array<{ key: string; count: number }> {
  const counts = new Map<string, number>();
  for (const v of values) {
    const key = v?.trim() || "No reason given";
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}

/** "Yaw Hub", "Yaw", "YH" from a profile — the address's local part when there is no name. */
export function staffMember(row: {
  id: string;
  role: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
}): StaffMember {
  const first = row.first_name?.trim() ?? "";
  const last = row.last_name?.trim() ?? "";
  const local = row.email?.split("@")[0]?.trim() || "Staff";
  const name = [first, last].filter(Boolean).join(" ") || local;
  const short = first || local;
  const initials =
    first || last
      ? `${first.charAt(0)}${last.charAt(0)}`.toUpperCase() || name.charAt(0).toUpperCase()
      : local
          .split(/[^A-Za-z0-9]+/)
          .filter(Boolean)
          .slice(0, 2)
          .map((p) => p.charAt(0).toUpperCase())
          .join("") || "?";
  return { id: row.id, name, short_name: short, initials, role: row.role === "admin" ? "admin" : "warehouse" };
}
