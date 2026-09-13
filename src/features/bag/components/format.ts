import { formatGhs, formatUsd } from "@/features/marketing/format";
import type { BagBox, BagLine, BagLinePending, BagView } from "../types";

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
/**
 * "One item's weight" / "2 items' weights" — the number matters. A box holding
 * two weightless listings that says "one item's weight" tells the customer the
 * other one is known, which is the opposite of true.
 */
export function formatUnweighedCount(box: BagBox): string {
  const n = box.unweighed_line_count;
  return n <= 1 ? "One item's weight is" : `${n} items' weights are`;
}

export function formatBoxHeadroom(box: BagBox): string {
  if (box.has_unweighed_lines) return `${formatUnweighedCount(box)} still to be confirmed, so this box may fill sooner.`;
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
  tone?: "saving" | "free" | "muted";
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
 * box count and weight), the saving (only when non-zero), and the delivery the
 * customer chose. The delivery row reads `view.delivery` — the cart's own
 * choice, already priced into `total_ghs` — not a default zone, so an
 * unchosen delivery says so rather than quoting a fee nobody picked.
 */
export function buildBagSummaryRows(view: BagView): BagSummaryRow[] {
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
  rows.push(buildDeliveryRow(view));
  return rows;
}

/** "Door delivery · Greater Accra" / "Pickup · Osu hub" / "Delivery — choose below". */
function buildDeliveryRow(view: BagView): BagSummaryRow {
  const delivery = view.delivery;
  if (!delivery) return { key: "delivery", label: "Delivery", value: "choose below", tone: "muted" };
  const prefix = delivery.kind === "pickup" ? "Pickup" : "Door delivery";
  const fee = delivery.fee_ghs;
  return {
    key: "delivery",
    label: `${prefix} · ${delivery.zone_name}`,
    value: fee > 0 ? formatGhs(fee) : "Free",
    tone: fee > 0 ? undefined : "free",
  };
}

/**
 * How long a paste waits before the copy changes, in milliseconds.
 *
 * Kelvin's marks: at 5 s stop pretending this is instant and promise to follow
 * up; at 20 s stop waiting and offer the customer a person. Exported so the bag
 * line and the Buy-for-me screen cannot drift apart on the timing.
 */
export const PENDING_SLOW_MS = 5_000;
export const PENDING_STUCK_MS = 20_000;

export type PendingPhase = "reading" | "slow" | "stuck" | "failed";

export interface PendingWait {
  phase: PendingPhase;
  /** The line the customer reads. */
  title: string;
  /** The second line, or null when the title says enough. */
  detail: string | null;
}

/**
 * What to say about a link that is still being read.
 *
 * Struck from `queued_at` on the row, NOT from when this component mounted, so
 * reloading the page does not restart the customer's wait — they would see
 * "reading this page" again on something that has been going for a minute.
 */
export function describePendingWait(pending: BagLinePending, now: Date): PendingWait {
  if (pending.status === "failed") {
    return {
      phase: "failed",
      title: "We could not read this page",
      detail: pending.error ?? "Tell us what you want instead and a buyer will sort it out.",
    };
  }

  const elapsed = now.getTime() - new Date(pending.queued_at).getTime();

  if (elapsed >= PENDING_STUCK_MS) {
    return {
      phase: "stuck",
      title: "This one is being stubborn",
      detail: "Tell us what you want and a buyer will sort it out on WhatsApp.",
    };
  }
  if (elapsed >= PENDING_SLOW_MS) {
    return {
      phase: "slow",
      title: "Taking longer than usual",
      detail: "You can carry on — we'll price it here as soon as we have it.",
    };
  }
  return { phase: "reading", title: "Reading this page…", detail: null };
}

/** "microcenter.com" — what a customer recognises when there is no product name yet. */
export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
