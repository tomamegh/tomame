import type { Segment, TimelineIcon, TimelineTone } from "./types";

/**
 * One timeline row, as a sentence (082): "Yaw logged in TM-00005 at 0.8 lb",
 * "Yaw shipped PKG-10001 via UPS".
 *
 * Pure. The service resolves every id to a printed reference first and passes
 * the maps in, so this never reads a database and every wording is tested.
 * `audit_logs.metadata` was written by several services over several months, so
 * every field is read defensively — a row missing its reference still reads as
 * a sentence, just a vaguer one.
 */

export interface DescribeInput {
  source: "audit" | "activity";
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  path: string | null;
  metadata: Record<string, unknown> | null;
}

export interface DescribeContext {
  orderNos: ReadonlyMap<string, string>;
  packageRefs: ReadonlyMap<string, string>;
}

export interface Description {
  segments: Segment[];
  note: string | null;
  icon: TimelineIcon;
  tone: TimelineTone;
}

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

export const packageHref = (id: string) => `/warehouse/packages/${id}`;
export const itemHref = (orderId: string) => `/warehouse/items/${orderId}`;

function str(meta: Record<string, unknown> | null, key: string): string | null {
  const v = meta?.[key];
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function num(meta: Record<string, unknown> | null, key: string): number | null {
  const v = meta?.[key];
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
}

function list(meta: Record<string, unknown> | null, key: string): unknown[] {
  const v = meta?.[key];
  return Array.isArray(v) ? v : [];
}

const t = (text: string): Segment => ({ text });

/** "0.8 lb", "12 lb", "1.25 lb" — no trailing zeros, because a scale does not print them. */
export function formatWeight(lbs: number): string {
  return `${Number(lbs.toFixed(2))} lb`;
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** "in_transit" → "in transit". */
function humanStatus(status: string): string {
  return status.replace(/_/g, " ");
}

const FIELD_NAMES: Record<string, string> = {
  weight_lbs: "weight",
  length_in: "dimensions",
  width_in: "dimensions",
  height_in: "dimensions",
  tracking_number: "tracking",
  this_way_up: "handling marks",
  keep_dry: "handling marks",
  fragile: "handling marks",
};

/** `["weight_lbs","length_in","width_in","carrier"]` → "weight, dimensions and carrier". */
export function humanFields(fields: unknown[]): string | null {
  const names: string[] = [];
  for (const f of fields) {
    if (typeof f !== "string") continue;
    const name = FIELD_NAMES[f] ?? f.replace(/_/g, " ");
    if (!names.includes(name)) names.push(name);
  }
  if (names.length === 0) return null;
  if (names.length === 1) return names[0]!;
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

const VERDICTS: Record<string, string> = {
  wrong_item: "wrong item",
  wrong_variant: "wrong variant",
  damaged: "damaged",
  other: "other",
  looks_right: "looks right",
};

export function verdictLabel(verdict: string): string {
  return VERDICTS[verdict] ?? verdict.replace(/_/g, " ");
}

/** The screen a warehouse path is, in words — for page views. */
export function pageName(
  path: string | null,
  ctx: DescribeContext,
): { label: string; href: string | null; isRef: boolean } {
  const p = (path ?? "").replace(/\/+$/, "") || "/warehouse";
  const fixed: Record<string, string> = {
    "/warehouse": "the dashboard",
    "/warehouse/scan": "the scan console",
    "/warehouse/receive": "receiving",
    "/warehouse/packages": "the packages list",
    "/warehouse/issues": "the issues board",
    "/warehouse/inbound": "the inbound parcels",
  };
  if (fixed[p]) return { label: fixed[p]!, href: p, isRef: false };
  const pkg = p.match(/^\/warehouse\/packages\/([^/]+)$/);
  if (pkg?.[1] && UUID.test(pkg[1])) {
    const ref = ctx.packageRefs.get(pkg[1].toLowerCase());
    return ref
      ? { label: ref, href: p, isRef: true }
      : { label: "a package that has since been deleted", href: null, isRef: false };
  }
  const item = p.match(/^\/warehouse\/items\/([^/]+)$/);
  if (item?.[1] && UUID.test(item[1])) {
    const no = ctx.orderNos.get(item[1].toLowerCase());
    return no ? { label: no, href: p, isRef: true } : { label: "an item", href: p, isRef: false };
  }
  return { label: p, href: p.startsWith("/warehouse") ? p : null, isRef: false };
}

/** Every id a row names, so the service can resolve them in one query each. */
export function referencedIds(row: DescribeInput): { orders: string[]; packages: string[] } {
  const orders: string[] = [];
  const packages: string[] = [];
  const add = (into: string[], v: unknown) => {
    if (typeof v === "string" && UUID.test(v)) into.push(v.toLowerCase());
  };
  const m = row.metadata;
  if (row.entity_type === "warehouse_package") add(packages, row.entity_id);
  if (row.entity_type === "order" || row.entity_type === "order_hold") add(orders, row.entity_id);
  add(orders, m?.order_id);
  add(orders, m?.orderId);
  for (const id of list(m, "order_ids")) add(orders, id);
  const pkgPath = row.path?.match(/^\/warehouse\/packages\/([^/]+)/);
  if (pkgPath) add(packages, pkgPath[1]);
  const itemPath = row.path?.match(/^\/warehouse\/items\/([^/]+)/);
  if (itemPath) add(orders, itemPath[1]);
  return { orders, packages };
}

export function describeEntry(row: DescribeInput, ctx: DescribeContext): Description {
  const m = row.metadata;
  const entityId = row.entity_id?.toLowerCase() ?? null;

  const packageSeg = (): Segment => {
    const ref = (entityId && ctx.packageRefs.get(entityId)) ?? str(m, "reference") ?? str(m, "code");
    const live = entityId ? ctx.packageRefs.has(entityId) : false;
    return { ref: ref ?? "a package", href: live && entityId ? packageHref(entityId) : null };
  };
  const orderSeg = (orderId: string | null, fallbackNo?: string | null): Segment => {
    const id = orderId?.toLowerCase() ?? null;
    const no = (id && ctx.orderNos.get(id)) ?? fallbackNo ?? null;
    if (!no) return { ref: "an order", href: id ? itemHref(id) : null };
    return { ref: no, href: id ? itemHref(id) : null };
  };
  const d = (
    segments: Segment[],
    icon: TimelineIcon,
    tone: TimelineTone = "neutral",
    note: string | null = null,
  ): Description => ({ segments, icon, tone, note });

  if (row.source === "activity") {
    switch (row.action) {
      case "page_view": {
        const page = pageName(row.path, ctx);
        return d(
          [t("opened"), page.isRef || page.href ? { ref: page.label, href: page.href } : t(page.label)],
          "page",
          "muted",
        );
      }
      case "scan": {
        const code = str(m, "code");
        const seg =
          row.entity_type === "warehouse_package"
            ? { ref: (entityId && ctx.packageRefs.get(entityId)) ?? code ?? "a package", href: entityId && ctx.packageRefs.has(entityId) ? packageHref(entityId) : null }
            : orderSeg(entityId, code);
        return d([t("scanned"), seg], "scan");
      }
      case "lookup_failed": {
        const code = str(m, "code") ?? str(m, "raw");
        return d(
          code ? [t("scanned"), t(`“${code}”`), t("but nothing matched")] : [t("scanned an empty code")],
          "failed",
          "amber",
          str(m, "raw") && str(m, "raw") !== code ? `Typed or read as “${str(m, "raw")}”` : null,
        );
      }
      case "label_view": {
        const size = str(m, "size");
        return d(
          [t("opened the label for"), packageSeg()],
          "label",
          "muted",
          size ? `${size === "manifest" ? "Manifest" : size === "roll80" ? "80 mm roll" : `${size} label`}` : null,
        );
      }
      default:
        return d([t(row.action.replace(/_/g, " "))], "other", "muted");
    }
  }

  switch (row.action) {
    case "warehouse_item_received":
    case "warehouse_item_reweighed": {
      const weight = num(m, "weight_lbs");
      const location = str(m, "location");
      const tail = weight !== null ? `at ${formatWeight(weight)}` : "without a weight";
      return d(
        [t(row.action === "warehouse_item_received" ? "logged in" : "re-weighed"), orderSeg(entityId, str(m, "order_no")), t(tail)],
        "received",
        "green",
        location && location !== "US hub" ? `At ${location}` : null,
      );
    }
    case "warehouse_package_created":
      return d([t("started packing"), packageSeg()], "package");
    case "warehouse_package_updated": {
      const fields = humanFields(list(m, "fields"));
      return d([t("updated"), packageSeg(), ...(fields ? [t(`(${fields})`)] : [])], "package", "muted");
    }
    case "warehouse_package_items_added": {
      const orders = list(m, "order_ids").filter((v): v is string => typeof v === "string");
      const custom = num(m, "custom_lines") ?? 0;
      if (orders.length === 1 && custom === 0) {
        return d([t("packed"), orderSeg(orders[0]!), t("into"), packageSeg()], "packed");
      }
      return d([t(`packed ${plural(orders.length + custom, "item")} into`), packageSeg()], "packed");
    }
    case "warehouse_package_item_removed": {
      const orderId = str(m, "order_id");
      const what = orderId ? orderSeg(orderId) : t(str(m, "description") ? `“${str(m, "description")}”` : "an item");
      return d([t("took"), what, t("out of"), packageSeg()], "packed", "muted");
    }
    case "warehouse_package_sealed": {
      const units = num(m, "unit_count");
      return d([t("sealed"), packageSeg(), ...(units !== null ? [t(`with ${plural(units, "unit")}`)] : [])], "sealed");
    }
    case "warehouse_package_reopened":
      return d([t("reopened"), packageSeg()], "reopened", "amber");
    case "warehouse_package_shipped": {
      const carrier = str(m, "carrier");
      const orders = num(m, "order_count");
      const tracking = str(m, "tracking_number");
      return d(
        [
          t("shipped"),
          packageSeg(),
          ...(carrier ? [t(`via ${carrier}`)] : []),
          ...(orders !== null ? [t(`· ${plural(orders, "order")}`)] : []),
        ],
        "shipped",
        "green",
        tracking ? `Tracking ${tracking}` : null,
      );
    }
    case "warehouse_package_ship_partial": {
      const failed = list(m, "failed");
      return d(
        [t("tried to ship"), packageSeg(), t(`but ${plural(failed.length, "order")} could not move`)],
        "failed",
        "amber",
        failed
          .map((f) => (f && typeof f === "object" ? (f as Record<string, unknown>) : null))
          .filter(Boolean)
          .map((f) => `${f!.order_no ?? "?"}: ${f!.reason ?? "unknown"}`)
          .join(" · ") || null,
      );
    }
    case "warehouse_package_deleted":
      return d([t("deleted"), { ref: str(m, "reference") ?? "a package", href: null }], "deleted", "coral");
    // 086: store parcels. The parcel itself has no page reference worth
    // printing beyond its tracking number, which rides in the metadata.
    case "warehouse_inbound_registered":
      return d(
        [t("added tracking"), t(str(m, "tracking_key") ?? "a parcel"), t("to"), orderSeg(str(m, "order_id"), str(m, "order_no"))],
        "package",
        "muted",
      );
    case "warehouse_inbound_linked":
      return d(
        [t("linked parcel"), t(str(m, "tracking_key") ?? ""), t("to"), orderSeg(str(m, "order_id"), str(m, "order_no"))],
        "package",
      );
    case "warehouse_inbound_unlinked":
      return d(
        [t("unlinked parcel"), t(str(m, "tracking_key") ?? ""), t("from"), orderSeg(str(m, "order_id"))],
        "package",
        "muted",
      );
    case "warehouse_inbound_arrived":
      return d([t("scanned in store parcel"), t(str(m, "tracking_key") ?? "")], "received", "green");
    case "warehouse_inbound_unmatched_logged":
      return d([t("logged an unmatched parcel"), t(str(m, "tracking_key") ?? "")], "failed", "amber", str(m, "note"));
    case "warehouse_label_printed": {
      const copy = num(m, "copy");
      return d(
        [t("printed the label for"), packageSeg(), ...(copy !== null && copy > 1 ? [t(`(copy ${copy})`)] : [])],
        "label",
      );
    }
    case "order_status_changed": {
      const from = str(m, "from");
      const to = str(m, "to");
      return d(
        [t("moved"), orderSeg(entityId), t(to ? `to ${humanStatus(to)}` : "on")],
        "status",
        to === "in_transit" ? "green" : "neutral",
        from ? `Was ${humanStatus(from)}` : null,
      );
    }
    case "order_held":
      return d([t("put a hold on"), orderSeg(entityId)], "hold", "amber", str(m, "reason"));
    case "order_hold_released":
      return d(
        [t("released the hold on"), orderSeg(entityId)],
        "release",
        "green",
        [str(m, "held_reason") ? `Held for: ${str(m, "held_reason")}` : null, str(m, "note")]
          .filter(Boolean)
          .join(" · ") || null,
      );
    case "order_feedback_updated": {
      const to = str(m, "to");
      return d(
        [t("marked a customer issue on"), orderSeg(str(m, "order_id")), t(to ? `as ${humanStatus(to)}` : "")].filter(
          (s) => !("text" in s) || s.text,
        ),
        "issue",
        to === "resolved" ? "green" : "amber",
      );
    }
    case "order_photo_uploaded":
      return d([t("photographed"), orderSeg(str(m, "orderId"), str(m, "orderNo"))], "photo");
    case "order_photo_deleted":
      return d([t("deleted a photo of"), orderSeg(str(m, "orderId"), str(m, "orderNo"))], "photo", "muted");
    case "user_logged_in":
      return d([t("signed in")], "signin", "muted");
    default:
      return d([t(row.action.replace(/^warehouse_/, "").replace(/_/g, " "))], "other", "muted");
  }
}

/** The sentence as plain text — for tests, `title` attributes and screen readers. */
export function sentenceText(actor: string, segments: readonly Segment[]): string {
  return [actor, ...segments.map((s) => ("text" in s ? s.text : s.ref))].filter(Boolean).join(" ");
}

/**
 * Fold runs of identical adjacent rows into one: "Yaw signed in ×4". Rows are
 * newest first, so the survivor keeps its own (newest) time and takes the run's
 * oldest as `earliest_at`. Only exact repeats fold — same actor, action and
 * sentence, same UTC day — so two different packages sealed back to back stay
 * two rows.
 */
export function collapseRepeats<
  T extends {
    action: string;
    actor: { id: string } | null;
    segments: readonly Segment[];
    note: string | null;
    created_at: string;
    repeat: number;
    earliest_at: string;
  },
>(rows: readonly T[]): T[] {
  const out: T[] = [];
  const key = (r: T) =>
    [r.actor?.id ?? "", r.action, sentenceText("", r.segments), r.note ?? "", r.created_at.slice(0, 10)].join("|");
  for (const row of rows) {
    const last = out[out.length - 1];
    if (last && key(last) === key(row)) {
      out[out.length - 1] = { ...last, repeat: last.repeat + row.repeat, earliest_at: row.earliest_at };
    } else {
      out.push(row);
    }
  }
  return out;
}
