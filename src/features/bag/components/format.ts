import { formatGhs, formatUsd } from "@/features/marketing/format";
import { taxGroupRowLabel, type TaxFacts } from "@/lib/pricing/tax-label";
import { CUSTOMS_ROW_LABEL, CUSTOMS_ROW_VALUE, FREIGHT_ROW_LABEL, feeRowLabel } from "@/config/price-story";
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
  const service = line.pricing?.store_shipping_option?.label;
  const parts = [
    line.product.store,
    line.product.variant,
    line.product.weight_lbs != null ? formatLbs(line.product.weight_lbs) : null,
    // The store shipping service chosen on the quote, so the bag shows what is being paid for.
    service ? `ships via ${service}` : null,
  ];
  return parts.filter((p): p is string => !!p).join(" · ");
}

/** "$586.47 incl. tax, fee & freight" — the line's USD echo, from the server's total_usd (freight is in it). */
export function formatLineUsd(line: BagLine): string | null {
  const usd = line.pricing?.total_usd;
  return usd != null ? `${formatUsd(usd)} incl. tax, fee & freight` : null;
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

/** The priced lines, as the tax helpers want them. Unpriced lines drop out. */
function taxFactsOf(lines: BagLine[]): TaxFacts[] {
  return lines
    .map((l) => l.pricing)
    .filter((p): p is NonNullable<BagLine["pricing"]> => !!p)
    .map((p) => ({ subtotal_usd: p.subtotal_usd, tax_percentage: p.tax_percentage, tax_usd: p.tax_usd }));
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
  // THE GROUP CASE. `view.tax_usd` sums lines that may have been charged the
  // rate and lines that hit the floor, so a bare "Sales tax 10%" can be false
  // of the total even when every line shares a rate — QA measured $49.47 of
  // items billed $6.00 under a 10% label, an effective 12.1%. `taxGroupRowLabel`
  // states the whole rule when any line was floored.
  rows.push({
    key: "tax",
    label: taxGroupRowLabel(taxFactsOf(view.lines), sharedPercent(view.lines, (p) => p.tax_percentage), "sales tax"),
    value: formatUsd(view.tax_usd),
  });
  rows.push({ key: "fee", label: feeRowLabel(sharedPercent(view.lines, (p) => p.value_fee_percentage)), value: formatUsd(view.fee_usd) });
  if (view.store_shipping_usd > 0) {
    rows.push({ key: "store_shipping", label: "Store shipping", value: formatUsd(view.store_shipping_usd) });
  }
  const boxes = view.boxes.length;
  const freightLabel = boxes > 0 ? `${FREIGHT_ROW_LABEL} · ${boxes} box${boxes === 1 ? "" : "es"}, ${formatLbs(view.boxed_weight_lbs)}` : FREIGHT_ROW_LABEL;
  rows.push({ key: "freight", label: freightLabel, value: formatGhs(view.freight_ghs) });
  // Display only: customs sits inside the freight above.
  rows.push({ key: "customs", label: CUSTOMS_ROW_LABEL, value: CUSTOMS_ROW_VALUE, tone: "muted" });
  if (view.consolidation_saving_ghs > 0) {
    rows.push({ key: "saving", label: "Consolidation saving", value: `− ${formatGhs(view.consolidation_saving_ghs)}`, tone: "saving" });
  }
  rows.push(buildDeliveryRow(view));
  return rows;
}

/** "Door delivery · Greater Accra" / "Pickup · Weija hub" / "Delivery — choose below". */
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
/**
 * Past this the row stops counting seconds and says plainly that it is still
 * reading (a failed read is being retried, 106). The job itself ends within
 * five minutes either way (`PASTE_GIVE_UP_MS`).
 */
export const PENDING_LONG_MS = 90_000;

export type PendingPhase = "reading" | "slow" | "stuck" | "long" | "failed" | "assisted";

export interface PendingWait {
  phase: PendingPhase;
  /** The line the customer reads. */
  title: string;
  /** The second line, or null when the title says enough. */
  detail: string | null;
}

/**
 * What the screen can truthfully promise while the customer walks away.
 *
 * `notifies` is whether a finished job will reach this viewer with a bell
 * entry and an email — true for a signed-in customer (`notifyPasteFinished`),
 * false for a `tm_quote_session` visitor, who has no account to notify. The
 * copy must not say "we'll let you know" to someone it cannot tell.
 */
export interface PendingWaitOptions {
  notifies?: boolean;
}

/**
 * What to say about a link that is still being read.
 *
 * Struck from `queued_at` on the row, NOT from when this component mounted, so
 * reloading the page does not restart the customer's wait — they would see
 * "reading this page" again on something that has been going for a minute.
 */
export function describePendingWait(
  pending: BagLinePending,
  now: Date,
  options: PendingWaitOptions = {},
): PendingWait {
  // A person already has it. Nothing the machine says about its own progress
  // matters any more, and the form must not be offered a second time.
  if (pending.assisted_open) {
    return {
      phase: "assisted",
      title: "A buyer is on it",
      detail: "We have your description. A buyer will message you on WhatsApp.",
    };
  }

  if (pending.status === "failed") {
    return {
      phase: "failed",
      title: "We couldn't read this page",
      detail: pending.error ?? "Describe what you want and a buyer will find it for you.",
    };
  }

  const elapsed = now.getTime() - new Date(pending.queued_at).getTime();
  const followUp = options.notifies
    ? "we'll tell you when it's priced."
    : "the price will appear here when it's ready.";

  // Plain status, no personality: a wait is information, not a joke (2026-11-20).
  if (elapsed >= PENDING_LONG_MS) {
    return {
      phase: "long",
      title: "Still reading…",
      detail: "This store is slow to answer; we're trying again. Or ask a buyer and we'll find it for you on WhatsApp.",
    };
  }
  if (elapsed >= PENDING_STUCK_MS) {
    return {
      phase: "stuck",
      title: "Still reading this page",
      detail: `Some stores take longer to read. You can carry on and ${followUp} Or describe it and a buyer will find it for you on WhatsApp.`,
    };
  }
  if (elapsed >= PENDING_SLOW_MS) {
    return {
      phase: "slow",
      title: "Reading this page",
      detail: `This one is taking a little longer. You can carry on and ${followUp}`,
    };
  }
  return { phase: "reading", title: "Reading this page", detail: null };
}

// ── Why Pay is waiting ──────────────────────────────────────────────────────

export interface PayBlockContext {
  isSignedIn: boolean;
  /** The signed-in viewer has a name and phone on file. */
  hasContact: boolean;
  /** Fix 5: a phone is on file but is not a complete number. */
  phoneIncomplete?: boolean;
  /** Fix 5: the chosen delivery address's phone is not a complete number. */
  addressPhoneIncomplete?: boolean;
}

function countItems(n: number): string {
  return n === 1 ? "1 item" : `${n} items`;
}

/** "it" / "them", "it's" / "they're". */
function pronoun(n: number, one: string, many: string): string {
  return n === 1 ? one : many;
}

/**
 * Why the bag's Pay button is waiting, in one plain sentence, or null when it
 * is not. Reads and checks that finish on their own come first, then what only
 * the customer can fix. Shown beside the button so a held line explains itself
 * instead of checkout answering with a bare 409.
 */
export function payBlockReason(view: BagView, ctx: PayBlockContext): string | null {
  const lines = view.lines;
  if (lines.length === 0) return null;

  const reading = lines.filter((l) => l.pending != null).length;
  if (reading > 0) return `Reading ${countItems(reading)}. Pay opens once ${pronoun(reading, "it's", "they're")} priced.`;

  const freight = lines.filter((l) => l.freight_checking).length;
  if (freight > 0) return `Checking the freight on ${countItems(freight)}. This usually takes a few seconds.`;

  const sourcing = lines.filter((l) => l.sourcing != null && l.sourcing.status !== "available");
  const notComing = sourcing.filter((l) => l.sourcing?.status === "unavailable").length;
  if (notComing > 0) return `We can't get ${countItems(notComing)}. Remove ${pronoun(notComing, "it", "them")} to pay for the rest.`;
  if (sourcing.length > 0) return `A buyer is pricing ${countItems(sourcing.length)}. Pay opens once ${pronoun(sourcing.length, "it's", "they're")} priced.`;

  const held = lines.map((l) => l.pay_hold).filter((h): h is NonNullable<BagLine["pay_hold"]> => h != null && h.kind !== "freight_check");
  const gone = held.filter((h) => h.kind === "unavailable").length;
  if (gone > 0) return `${pronoun(gone, "1 item is", `${gone} items are`)} no longer available. Remove ${pronoun(gone, "it", "them")} to pay for the rest.`;
  const checking = held.filter((h) => h.kind === "price_check" && !h.needs_staff).length;
  if (checking > 0) return `Checking the price of ${countItems(checking)} with the store. This usually takes under a minute.`;
  const price = held.filter((h) => h.kind === "price_check").length;
  if (price > 0) return `We're confirming the price of ${countItems(price)}. Pay opens once it's confirmed.`;
  const stock = held.filter((h) => h.kind === "stock_check").length;
  if (stock > 0) return `We're confirming stock and condition for ${countItems(stock)}. Pay opens once it's confirmed.`;

  const unpriced = lines.filter((l) => l.pricing == null).length;
  if (unpriced > 0) return `${pronoun(unpriced, "1 item can't", `${unpriced} items can't`)} be priced right now. Remove ${pronoun(unpriced, "it", "them")} to pay for the rest.`;

  if (ctx.isSignedIn && !view.delivery) return "Choose how you'd like it delivered to pay.";
  if (ctx.isSignedIn && ctx.addressPhoneIncomplete) return "The delivery address's phone number looks incomplete. Edit the address to pay.";
  if (ctx.isSignedIn && !ctx.hasContact) {
    return ctx.phoneIncomplete ? "Your phone number looks incomplete. Fix it under Your details to pay." : "Add your name and phone number to pay.";
  }
  return null;
}

/** "microcenter.com" — what a customer recognises when there is no product name yet. */
export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
