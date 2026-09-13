import { formatGhs, formatUsd } from "@/features/marketing/format";
import type { BagBox, BagLine, BagView } from "../types";
import type { DeliveryZoneRow } from "@/db/queries/delivery-zones";

/** "Fri 12 Sep" — the box's departure day. Null when the region has no schedule. */
export function formatDepartureDay(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  // Built from parts: en-GB spells September "Sept", the mock (and Ghanaian usage) says "Sep".
  const parts = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).formatToParts(d);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("weekday")} ${get("day")} ${get("month").slice(0, 3)}`;
}

/** "Box 1 · flies from the US Fri 12 Sep" — falls back to the region name when no departure is scheduled. */
export function formatBoxTitle(box: BagBox): string {
  const day = formatDepartureDay(box.departs_at);
  const origin = regionShortName(box.region_code, box.region_name);
  return day ? `${box.label} · flies from ${origin} ${day}` : `${box.label} · from ${origin}`;
}

/** "the US", "the UK", "China" — how the mock names origins in running copy. */
export function regionShortName(code: string, name: string): string {
  switch (code) {
    case "USA": return "the US";
    case "UK": return "the UK";
    case "CHINA": return "China";
    default: return name;
  }
}

/** "5.4 lb" / "0.6 lb"; trims trailing zeros. */
export function formatLbs(lbs: number): string {
  const rounded = Math.round(lbs * 10) / 10;
  return `${Number.isInteger(rounded) ? rounded : rounded.toFixed(1)} lb`;
}

/** "5.4 / 9 lb" */
export function formatBoxFill(box: BagBox): string {
  return `${formatLbs(box.weight_lbs).replace(/ lb$/, "")} / ${formatLbs(box.capacity_lbs)}`;
}

/**
 * The box footer. "Room for ~3.6 lb more." while there is room; the honest
 * alternative when there is none or a line's weight is unknown.
 */
export function formatBoxHeadroom(box: BagBox): string {
  if (box.has_unweighed_lines) return "One item's weight is still to be confirmed, so this box may fill sooner.";
  if (box.headroom_lbs <= 0) return "This box is full. Anything else starts a new one.";
  return `Room for ~${formatLbs(box.headroom_lbs)} more. Anything else from your price watch?`;
}

/** "23h 12m" until the earliest lock expires; null once it has lapsed. */
export function formatLockCountdown(iso: string | null, now: Date): string | null {
  if (!iso) return null;
  const until = new Date(iso).getTime();
  if (Number.isNaN(until) || until <= now.getTime()) return null;
  const totalMinutes = Math.floor((until - now.getTime()) / 60_000);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return h > 0 ? `${h}h ${m.toString().padStart(2, "0")}m` : `${m}m`;
}

/** "Amazon · Black · 0.6 lb" — only the facts the line actually has. */
export function formatLineMeta(line: BagLine): string {
  const parts = [line.product.store, line.product.variant, line.product.weight_lbs != null ? formatLbs(line.product.weight_lbs) : null];
  return parts.filter((p): p is string => !!p).join(" · ");
}

/** "$586.47 incl. tax & fee" — the line's USD echo, from the server's total_usd. */
export function formatLineUsd(line: BagLine): string | null {
  const usd = line.pricing?.total_usd;
  return usd != null ? `${formatUsd(usd)} incl. tax & fee` : null;
}

export interface BagSummaryRow {
  key: string;
  label: string;
  value: string;
  tone?: "saving" | "free";
}

/** A percentage label only when every priced line shares the same rate. */
function sharedPercent(lines: BagLine[], pick: (p: NonNullable<BagLine["pricing"]>) => number): number | null {
  const pcts = new Set(lines.map((l) => l.pricing).filter((p): p is NonNullable<BagLine["pricing"]> => !!p).map(pick));
  return pcts.size === 1 ? [...pcts][0]! : null;
}

function pctLabel(base: string, pct: number | null): string {
  return pct == null ? base : `${base} ${Math.round(pct * 1000) / 10}%`;
}

/**
 * The right-rail rows, in the mock's order: items, tax, fee, freight (with the
 * box count and weight), the saving (only when non-zero), door delivery (from
 * the default door zone, Phase 3's wording). Every figure is the server's.
 */
export function buildBagSummaryRows(view: BagView, zone: DeliveryZoneRow | null): BagSummaryRow[] {
  const rows: BagSummaryRow[] = [];
  const n = view.item_count;
  rows.push({ key: "items", label: `${n} item${n === 1 ? "" : "s"}`, value: formatUsd(view.subtotal_usd) });
  rows.push({ key: "tax", label: pctLabel("Sales tax", sharedPercent(view.lines, (p) => p.tax_percentage)), value: formatUsd(view.tax_usd) });
  rows.push({ key: "fee", label: pctLabel("Tomame fee", sharedPercent(view.lines, (p) => p.value_fee_percentage)), value: formatUsd(view.fee_usd) });
  const boxes = view.boxes.length;
  const freightLabel = boxes > 0 ? `Freight · ${boxes} box${boxes === 1 ? "" : "es"}, ${formatLbs(view.boxed_weight_lbs)}` : "Freight";
  rows.push({ key: "freight", label: freightLabel, value: formatGhs(view.freight_ghs) });
  if (view.consolidation_saving_ghs > 0) {
    rows.push({ key: "saving", label: "Consolidation saving", value: `− ${formatGhs(view.consolidation_saving_ghs)}`, tone: "saving" });
  }
  if (zone) {
    rows.push({
      key: "delivery",
      label: /deliver/i.test(zone.name) ? zone.name : `Door delivery · ${zone.name}`,
      value: zone.fee_ghs > 0 ? `from ${formatGhs(zone.fee_ghs)}, chosen at checkout` : "Free",
      tone: zone.fee_ghs > 0 ? undefined : "free",
    });
  }
  return rows;
}
