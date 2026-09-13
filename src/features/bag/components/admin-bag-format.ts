import type { AdminTone } from "@/components/layout/admin/admin-page";
import type { AdminBagLineState, AdminBagRow } from "@/db/queries/admin-bags";
import type { AdminBoxItem } from "@/db/queries/admin-boxes";
import type { ConsolidationBoxRow } from "@/db/queries/consolidation-boxes";
import {
  chargeableWeightLbs,
  type BoxConstants,
  type PackableLine,
} from "@/features/bag/services/box-packing";

/**
 * Pure shaping for the admin's bag and box screens.
 *
 * Framework-free — no React, no Supabase, no clock of its own — so every rule
 * below is unit tested without a DOM, and so a component never has to decide
 * what a figure means.
 *
 * NOTHING HERE COMPUTES MONEY. The bag figures are sums of stored snapshots
 * (`db/queries/admin-bags.ts` explains why they are snapshots), and the box
 * weights come from `box-packing.ts`'s own `chargeableWeightLbs` rather than a
 * second spelling of the same arithmetic.
 */

// ── Bags ────────────────────────────────────────────────────────────────────

/**
 * A bag untouched for this long is worth a nudge.
 *
 * Two days, not two hours: a Ghanaian customer pricing a US purchase routinely
 * sleeps on it, and a queue that fills up overnight teaches an admin to ignore
 * the badge. Chosen for this screen, not read from a table — there is no
 * `abandonment_hours` constant, and inventing one in `pricing_constants` for a
 * display threshold would be worse than naming it here.
 */
export const BAG_STALE_AFTER_HOURS = 48;

export interface AdminBagTotals {
  /** Bags in the listed status that hold at least one line. */
  count: number;
  /** Bags with at least one line that cannot be checked out yet. */
  blocked: number;
  /** Bags whose last activity is older than `BAG_STALE_AFTER_HOURS`. */
  stale: number;
  /** Σ of every bag's snapshot value. A snapshot, never a live quote. */
  snapshotValueGhs: number;
  /** Σ of every bag's `sum(quantity)` — the things, not the lines. */
  itemCount: number;
}

/**
 * The four figures the bags screen tiles.
 *
 * `now` is a parameter rather than a `Date.now()` call so the function is total
 * and the test does not have to freeze a clock.
 */
export function summariseBags(bags: readonly AdminBagRow[], now: Date): AdminBagTotals {
  const staleBefore = now.getTime() - BAG_STALE_AFTER_HOURS * 3_600_000;

  return {
    count: bags.length,
    blocked: bags.filter((bag) => bag.blocked_line_count > 0).length,
    stale: bags.filter((bag) => isStale(bag.updated_at, staleBefore)).length,
    snapshotValueGhs: round2(bags.reduce((sum, bag) => sum + bag.snapshot_value_ghs, 0)),
    itemCount: bags.reduce((sum, bag) => sum + bag.item_count, 0),
  };
}

/** Has this bag been sitting long enough to be worth a nudge? */
export function isBagStale(bag: AdminBagRow, now: Date): boolean {
  return isStale(bag.updated_at, now.getTime() - BAG_STALE_AFTER_HOURS * 3_600_000);
}

/**
 * An unparseable timestamp is NOT stale.
 *
 * `Date.parse` answers NaN for a value Postgres could not have produced, and
 * every comparison against NaN is false — so the result is "not stale" either
 * way. Written out so the behaviour is a decision rather than an accident: a
 * broken timestamp must not push a live bag into a chase queue.
 */
function isStale(iso: string, staleBefore: number): boolean {
  const at = Date.parse(iso);
  return Number.isFinite(at) && at < staleBefore;
}

/** What a blocked line is waiting on, in the admin's words. */
const LINE_STATE_COPY: Record<AdminBagLineState, { label: string; tone: AdminTone }> = {
  priced: { label: "Priced", tone: "green" },
  unpriced: { label: "No price", tone: "amber" },
  reading: { label: "Reading the link", tone: "neutral" },
  failed: { label: "Extraction failed", tone: "coral" },
  expired: { label: "Quote expired", tone: "amber" },
};

export function bagLineStateCopy(state: AdminBagLineState): { label: string; tone: AdminTone } {
  return LINE_STATE_COPY[state];
}

/**
 * How to name a bag's owner.
 *
 * An anonymous bag is named by the tail of its session cookie, not the whole
 * thing: enough to tell two visitors apart in a list, not enough to be worth
 * copying out of an admin's screen. A signed-in bag prefers the name, falls back
 * to the email, and only then to "Customer" — never to a raw user id.
 */
export function bagOwnerLabel(bag: AdminBagRow): string {
  if (bag.owner.kind === "anonymous") {
    const session = bag.owner.session_id ?? "";
    return session ? `Visitor · ${session.slice(-6)}` : "Visitor";
  }
  return bag.owner.name ?? bag.owner.email ?? "Customer";
}

// ── Boxes ───────────────────────────────────────────────────────────────────

export interface BoxFill {
  /** Chargeable weight packed, in lb — quantities and the minimum already applied. */
  chargeableLbs: number;
  /** 0–100, clamped. A box can be over capacity; the meter cannot. */
  fillPct: number;
  headroomLbs: number;
  /** Items whose listing gave no weight. They were counted at 0 lb. */
  unweighedCount: number;
  /** Items that have been paid for, and items still sitting in an open bag. */
  committedCount: number;
  provisionalCount: number;
}

/**
 * How full a box is.
 *
 * The per-item weight comes from `chargeableWeightLbs` in `box-packing.ts` —
 * the same function the customer's bag meter is drawn from, so the admin and the
 * customer cannot be told two different numbers about one box. This function
 * only adds them up and expresses the result against the box's own capacity.
 *
 * An item with no known weight contributes 0 and is counted separately, exactly
 * as the packer does: a box that looks 40% full with four unweighed items in it
 * is not 40% full, and the screen has to be able to say so.
 */
export function describeBoxFill(
  box: ConsolidationBoxRow,
  items: readonly AdminBoxItem[],
  constants: BoxConstants,
): BoxFill {
  let chargeableLbs = 0;
  let unweighedCount = 0;

  for (const item of items) {
    const weight = chargeableWeightLbs(toPackableLine(item), constants);
    if (weight == null) unweighedCount += 1;
    else chargeableLbs += weight;
  }

  chargeableLbs = round2(chargeableLbs);
  const capacity = box.capacity_lbs;

  return {
    chargeableLbs,
    fillPct: capacity > 0 ? Math.min(100, Math.round((chargeableLbs / capacity) * 100)) : 0,
    headroomLbs: round2(Math.max(0, capacity - chargeableLbs)),
    unweighedCount,
    committedCount: items.filter((item) => item.kind === "order").length,
    provisionalCount: items.filter((item) => item.kind === "bag_line").length,
  };
}

/**
 * One item's chargeable weight, for a row beside the meter.
 *
 * Same function as the meter uses, so a line and the bar above it can never
 * disagree. Null means the listing gave no weight — the packer counted it at
 * 0 lb and the row says so rather than printing "0 lb", which would read as a
 * weightless item rather than an unknown one.
 */
export function itemChargeableLbs(
  item: AdminBoxItem,
  constants: BoxConstants,
): number | null {
  return chargeableWeightLbs(toPackableLine(item), constants);
}

/**
 * A box item in the shape the packer understands.
 *
 * `region_code` is a non-null placeholder because the item is already IN a box,
 * so the packer's "lines without a region cannot be boxed" rule has nothing left
 * to decide here — we are measuring a packed box, not packing one.
 */
function toPackableLine(item: AdminBoxItem): PackableLine {
  return {
    id: item.id,
    quantity: item.quantity,
    region_code: "packed",
    weight_lbs: item.weight_lbs,
    pricing: item.pricing,
  };
}

/** The kit tone for a box status: open is live, landed is settled, the rest are neutral. */
export function boxStatusTone(status: ConsolidationBoxRow["status"]): AdminTone {
  switch (status) {
    case "open":
      return "coral";
    case "landed":
      return "green";
    case "in_transit":
      return "neutral";
    default:
      return "muted";
  }
}

/**
 * Is this box's cutoff in the past?
 *
 * A box past its cutoff that is still `open` is the one thing on the boxes
 * screen that genuinely needs a human: nothing closes a box automatically, so it
 * will sit there collecting lines that will miss the flight.
 */
export function isPastCutoff(box: ConsolidationBoxRow, now: Date): boolean {
  if (!box.cutoff_at) return false;
  const cutoff = Date.parse(box.cutoff_at);
  return Number.isFinite(cutoff) && cutoff < now.getTime();
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
