/**
 * What `/admin/warehouse` renders (082). Admin-only DTOs: they carry operator
 * names and addresses, so nothing here may be imported by `features/warehouse`,
 * whose types are what an operator's browser receives.
 */

export type InsightRange = 7 | 30 | 90;

export interface StaffMember {
  id: string;
  /** "Yaw Hub" — the table's spelling. */
  name: string;
  /** "Yaw" — the timeline's, because a sentence reads better with a first name. */
  short_name: string;
  initials: string;
  role: "admin" | "warehouse";
}

export interface ThroughputDay {
  /** `YYYY-MM-DD`, UTC — Ghana's day, all year. */
  day: string;
  received: number;
  shipped: number;
}

export interface DurationStats {
  count: number;
  median_hours: number | null;
  mean_hours: number | null;
}

export interface ActionTotals {
  received: number;
  reweighed: number;
  /** Items put into packages — orders and hand-described lines. */
  packed: number;
  sealed: number;
  /** Packages that left the hub. */
  shipped: number;
  /** Orders inside those packages. */
  shipped_orders: number;
  labels: number;
  holds: number;
}

export interface OperatorRow {
  actor_id: string;
  name: string;
  initials: string;
  role: "admin" | "warehouse";
  /** Audited warehouse actions, sign-ins excluded. */
  actions: number;
  received: number;
  shipped: number;
  labels: number;
  scans: number;
  failed_lookups: number;
  page_views: number;
  last_active: string | null;
}

export interface IssueSummary {
  held_now: number;
  held: Array<{ order_id: string; order_no: string; held_at: string; reason: string | null }>;
  holds_in_range: number;
  hold_reasons: Array<{ reason: string; count: number }>;
  customer_issues_in_range: number;
  customer_issues_open: number;
  by_verdict: Array<{ verdict: string; count: number }>;
  failed_lookups: number;
}

export interface WarehouseInsights {
  range: InsightRange;
  since: string;
  totals: ActionTotals;
  throughput: ThroughputDay[];
  hub_to_ship: DurationStats;
  seal_to_ship: DurationStats;
  packages_by_status: { packing: number; sealed: number; shipped: number };
  operators: OperatorRow[];
  issues: IssueSummary;
  /** True when the audit read hit its row cap and the figures are a floor. */
  truncated: boolean;
}

// ── The timeline ────────────────────────────────────────────────────────────

export type TimelineIcon =
  | "received"
  | "package"
  | "packed"
  | "sealed"
  | "reopened"
  | "shipped"
  | "label"
  | "status"
  | "hold"
  | "release"
  | "issue"
  | "photo"
  | "signin"
  | "page"
  | "scan"
  | "failed"
  | "deleted"
  | "other";

export type TimelineTone = "neutral" | "green" | "amber" | "coral" | "muted";

/** One piece of a sentence: words, or a reference that links somewhere. */
export type Segment = { text: string } | { ref: string; href: string | null };

export interface TimelineEntry {
  id: string;
  source: "audit" | "activity";
  action: string;
  actor: StaffMember | null;
  /** The role the row was written with — what they were acting as then. */
  actor_role: string;
  segments: Segment[];
  /** A second, quieter line: a hold reason, a tracking number. */
  note: string | null;
  icon: TimelineIcon;
  tone: TimelineTone;
  created_at: string;
  /**
   * How many identical rows in a row this one stands for — the same person doing
   * the same thing to the same subject (a page refreshed, a sign-in retried).
   * `created_at` is the newest of them, `earliest_at` the oldest.
   */
  repeat: number;
  earliest_at: string;
}

export interface TimelinePage {
  entries: TimelineEntry[];
  /** Cursor for the next (older) page, or null at the end. */
  next: string | null;
}
