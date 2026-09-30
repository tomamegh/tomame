import type { InsightRange } from "./types";

/**
 * `/admin/warehouse`'s URL, parsed (082). Pure, so every rule about what a
 * query string may say is tested without a request.
 *
 * Everything lives in the URL — a filtered timeline is a link an admin can send.
 * Anything that does not parse is DROPPED rather than rejected: a hand-edited
 * address shows the unfiltered page, never an error.
 */

type Params = Record<string, string | string[] | undefined>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

function first(value: string | string[] | undefined): string | undefined {
  const v = Array.isArray(value) ? value[0] : value;
  return typeof v === "string" ? v.trim() : undefined;
}

export const RANGES: readonly InsightRange[] = [7, 30, 90];

export function parseRange(value: string | string[] | undefined): InsightRange {
  const n = Number(first(value));
  return RANGES.find((r) => r === n) ?? 7;
}

// ── Kinds ───────────────────────────────────────────────────────────────────

export interface KindGroup {
  value: string;
  label: string;
  /** Audit actions. `null` means every warehouse action. */
  actions: readonly string[] | null;
  /** Activity kinds. `null` means every kind. */
  kinds: readonly string[] | null;
}

/**
 * The timeline's "what happened" filter. `work` is the default and leaves page
 * views out: on a working day they outnumber everything else ten to one, and a
 * timeline of "Yaw opened the dashboard" is not what an admin came to read.
 */
export const KIND_GROUPS: readonly KindGroup[] = [
  {
    value: "work",
    label: "All work",
    actions: null,
    kinds: ["scan", "lookup_failed", "label_view"],
  },
  {
    value: "received",
    label: "Logged in",
    actions: ["warehouse_item_received", "warehouse_item_reweighed"],
    kinds: [],
  },
  {
    value: "packing",
    label: "Packing",
    actions: [
      "warehouse_package_created",
      "warehouse_package_updated",
      "warehouse_package_items_added",
      "warehouse_package_item_removed",
      "warehouse_package_deleted",
      "warehouse_package_sealed",
      "warehouse_package_reopened",
    ],
    kinds: [],
  },
  {
    value: "shipped",
    label: "Shipped",
    actions: ["warehouse_package_shipped", "warehouse_package_ship_partial", "order_status_changed"],
    kinds: [],
  },
  { value: "labels", label: "Labels", actions: ["warehouse_label_printed"], kinds: ["label_view"] },
  { value: "scans", label: "Scans", actions: [], kinds: ["scan", "lookup_failed"] },
  { value: "failed", label: "Failed lookups", actions: [], kinds: ["lookup_failed"] },
  {
    value: "issues",
    label: "Holds & issues",
    actions: ["order_held", "order_hold_released", "order_feedback_updated"],
    kinds: [],
  },
  { value: "photos", label: "Photos", actions: ["order_photo_uploaded", "order_photo_deleted"], kinds: [] },
  { value: "signins", label: "Sign-ins", actions: ["user_logged_in"], kinds: [] },
  { value: "pages", label: "Page views", actions: [], kinds: ["page_view"] },
  { value: "all", label: "Everything", actions: null, kinds: null },
];

export function kindGroup(value: string | undefined): KindGroup {
  return KIND_GROUPS.find((g) => g.value === value) ?? KIND_GROUPS[0]!;
}

// ── References ──────────────────────────────────────────────────────────────

/**
 * "pkg 10001", "PKG10001", "tm-5", "TM-00005" → the printed reference. Only the
 * two shapes the warehouse prints; anything else is not a reference and the
 * search is dropped.
 */
export function normaliseReference(raw: string | undefined): string | null {
  if (!raw) return null;
  const value = raw.toUpperCase().replace(/\s+/g, "");
  const pkg = value.match(/^PKG-?(\d{3,})$/);
  if (pkg) return `PKG-${pkg[1]}`;
  const order = value.match(/^TM-?(\d{1,6})$/);
  if (order?.[1]) return `TM-${order[1].padStart(5, "0")}`;
  return null;
}

// ── Cursor ──────────────────────────────────────────────────────────────────

export interface Cursor {
  at: string;
  id: string;
}

export function encodeCursor(cursor: Cursor): string {
  return `${cursor.at}~${cursor.id}`;
}

export function decodeCursor(raw: string | undefined): Cursor | null {
  if (!raw) return null;
  const [at, id, extra] = raw.split("~");
  if (!at || !id || extra !== undefined || !UUID.test(id)) return null;
  // Kept verbatim, not round-tripped through `Date`: Postgres stamps carry
  // microseconds and a JS date keeps milliseconds, so re-serialising would move
  // the cursor and skip rows written in the same millisecond.
  if (!/^\d{4}-\d{2}-\d{2}[T ][\d:.]+(Z|[+-]\d{2}(:?\d{2})?)$/.test(at) || Number.isNaN(Date.parse(at))) {
    return null;
  }
  return { at, id: id.toLowerCase() };
}

// ── The whole filter ────────────────────────────────────────────────────────

export interface TimelineFilters {
  actor: string | null;
  kind: KindGroup;
  /** `YYYY-MM-DD`, inclusive, UTC. */
  from: string | null;
  to: string | null;
  q: string | null;
  /** The raw search text, echoed back into the box even when it did not parse. */
  qRaw: string;
  before: Cursor | null;
}

function validDay(value: string | undefined): string | null {
  if (!value || !DAY.test(value)) return null;
  const time = Date.parse(`${value}T00:00:00Z`);
  if (Number.isNaN(time)) return null;
  // `Date.parse` rolls 2026-02-31 over to March; a day that does not round-trip
  // is not a day.
  return new Date(time).toISOString().slice(0, 10) === value ? value : null;
}

export function parseTimelineFilters(params: Params): TimelineFilters {
  const actor = first(params.actor);
  let from = validDay(first(params.from));
  let to = validDay(first(params.to));
  // A backwards range is a slip of the date picker, not a request for nothing.
  if (from && to && from > to) [from, to] = [to, from];
  const qRaw = (first(params.q) ?? "").slice(0, 40);
  return {
    actor: actor && UUID.test(actor) ? actor.toLowerCase() : null,
    kind: kindGroup(first(params.kind)),
    from,
    to,
    q: normaliseReference(qRaw),
    qRaw,
    before: decodeCursor(first(params.before)),
  };
}

/** The `[since, until)` instants a day range covers. `to` is inclusive, so `until` is the next midnight. */
export function dayBounds(filters: Pick<TimelineFilters, "from" | "to">): {
  since: string | null;
  until: string | null;
} {
  const since = filters.from ? `${filters.from}T00:00:00.000Z` : null;
  let until: string | null = null;
  if (filters.to) {
    const next = new Date(`${filters.to}T00:00:00Z`);
    next.setUTCDate(next.getUTCDate() + 1);
    until = next.toISOString();
  }
  return { since, until };
}

/**
 * The page's own URL with some parameters changed. `null` removes one. The
 * cursor is dropped whenever anything else changes — page 3 of a different
 * filter is not a place.
 */
export function insightsHref(
  current: Params,
  changes: Record<string, string | null>,
): string {
  const next = new URLSearchParams();
  for (const [key, value] of Object.entries(current)) {
    const v = first(value);
    if (v) next.set(key, v);
  }
  if (!("before" in changes)) next.delete("before");
  for (const [key, value] of Object.entries(changes)) {
    if (value === null || value === "") next.delete(key);
    else next.set(key, value);
  }
  const qs = next.toString();
  return qs ? `/admin/warehouse?${qs}` : "/admin/warehouse";
}
