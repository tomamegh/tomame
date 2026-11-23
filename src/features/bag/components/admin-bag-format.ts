import type { AdminTone } from "@/components/layout/admin/admin-page";
import type { AdminBagLineState, AdminBagRow } from "@/db/queries/admin-bags";
import type { AdminBoxItem } from "@/db/queries/admin-boxes";
import type { ConsolidationBoxRow } from "@/db/queries/consolidation-boxes";
import {
  chargeableWeightLbs,
  type BoxConstants,
  type PackableLine,
} from "@/features/bag/services/box-packing";
import { capacityFill } from "@/features/warehouse/weights";
import { quoteAgeDays } from "@/features/bag/quote-clock";

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
  /** Bags with at least one line someone has to act on (failed, unpriced, gone, still reading). */
  blocked: number;
  /** Bags with nothing in the way: no line to act on, quotes current, details in. */
  ready: number;
  /** How many bags carry each reason (Fix 14); a bag can carry several. */
  reasons: Record<BagReasonKey, number>;
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

  const reasons: Record<BagReasonKey, number> = { needs_price: 0, stuck: 0, reading: 0, expired: 0, details: 0, anonymous: 0 };
  let ready = 0;
  for (const bag of bags) {
    const list = bagReasons(bag, now);
    if (isBagReady(list)) ready += 1;
    for (const reason of list) reasons[reason.key] += 1;
  }
  return {
    count: bags.length,
    blocked: bags.filter((bag) => bag.blocked_line_count > 0).length,
    ready,
    reasons,
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
  gone: { label: "Listing gone", tone: "coral" },
};

// ── Why a bag is not ready (site brief Fix 14) ──────────────────────────────

/** A line still reading after this long is stuck, not busy. */
export const READING_STUCK_AFTER_MINUTES = 30;

export type BagReasonKey = "needs_price" | "stuck" | "reading" | "expired" | "details" | "anonymous";

export interface BagReason {
  key: BagReasonKey;
  /** What is in the way, in the admin's words. */
  label: string;
  /** What to do about it. */
  action: string;
  tone: AdminTone;
  /** Where the action happens, when it is somewhere else in the admin. */
  href?: string;
  /** The Re-quote button clears it. */
  requote?: boolean;
  /**
   * Stops the bag being Ready to pay. Missing details and a visitor not signed
   * in do not: the customer fills those in at checkout, so they are notes.
   */
  blocking: boolean;
}

/** Ready to pay: nothing blocking (a note about checkout details may remain). */
export function isBagReady(reasons: readonly BagReason[]): boolean {
  return !reasons.some((reason) => reason.blocking);
}

/** Tile and filter copy for each reason, most urgent first. */
export const BAG_REASON_LABEL: Record<BagReasonKey, string> = {
  needs_price: "Need a price by hand",
  stuck: "Stuck reading",
  reading: "Still reading",
  expired: "Quote expired",
  details: "Missing details",
  anonymous: "Not signed in",
};

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/**
 * Every reason a bag is not "Ready to pay", most urgent first, each with its
 * next action. No blocking reason is Ready to pay. Never a bare "Blocked":
 * - a link that failed, a listing with no price, or one no longer on file needs
 *   a person to price it (the paste queue);
 * - a link still being read finishes on its own, unless it has been at it for
 *   READING_STUCK_AFTER_MINUTES;
 * - a quote past its 24 hours is re-quoted at today's rate (the Re-quote
 *   button); the customer's own bag does the same when they open it;
 * - a signed-in customer with no delivery or no phone fills them in at
 *   checkout; a visitor signs in there.
 */
export function bagReasons(bag: AdminBagRow, now: Date): BagReason[] {
  const reasons: BagReason[] = [];
  const count = (state: AdminBagLineState) => bag.lines.filter((line) => line.state === state).length;

  const failed = count("failed");
  const unpriced = count("unpriced");
  const gone = count("gone");
  if (failed + unpriced + gone > 0) {
    const parts = [
      failed ? `${plural(failed, "link")} could not be read` : null,
      unpriced ? `${plural(unpriced, "listing")} had no price` : null,
      gone ? `${plural(gone, "listing")} no longer on file` : null,
    ].filter(Boolean);
    reasons.push({
      key: "needs_price",
      label: parts.join(" · "),
      action: gone && !failed && !unpriced ? "Ask the customer to paste the link again" : "Price it by hand from the paste queue",
      tone: "coral",
      href: gone && !failed && !unpriced ? undefined : "/admin/pastes",
      blocking: true,
    });
  }

  const reading = bag.lines.filter((line) => line.state === "reading");
  if (reading.length > 0) {
    const stuckBefore = now.getTime() - READING_STUCK_AFTER_MINUTES * 60_000;
    const stuck = reading.filter((line) => Date.parse(line.created_at) < stuckBefore).length;
    reasons.push(
      stuck > 0
        ? { key: "stuck", label: `Reading ${plural(stuck, "link")} for over ${READING_STUCK_AFTER_MINUTES} minutes`, action: "Check it in the paste queue", tone: "amber", href: "/admin/pastes", blocking: true }
        : { key: "reading", label: `Still reading ${plural(reading.length, "link")}`, action: "Nothing to do: it finishes on its own", tone: "neutral", blocking: true },
    );
  }

  if (bag.expired_line_count > 0) {
    const oldest = bag.lines
      .filter((line) => line.state === "expired")
      .map((line) => quoteAgeDays(line.quoted_at ?? line.created_at, now))
      .reduce<number | null>((max, d) => (d == null ? max : max == null ? d : Math.max(max, d)), null);
    reasons.push({
      key: "expired",
      label: `Quote expired${oldest != null && oldest > 0 ? ` · quoted ${plural(oldest, "day")} ago` : ""}`,
      action: "Re-quote at today's rate",
      tone: "amber",
      requote: true,
      blocking: true,
    });
  }

  if (bag.owner.kind === "anonymous") {
    reasons.push({ key: "anonymous", label: "Not signed in", action: "They sign in at checkout; no way to contact them yet", tone: "muted", blocking: false });
  } else {
    const missing = [!bag.delivery_chosen ? "delivery" : null, !bag.owner.phone ? "phone number" : null].filter(Boolean);
    if (missing.length > 0) {
      reasons.push({
        key: "details",
        label: `No ${missing.join(" or ")} yet`,
        action: "They add it at checkout; nudge them if the bag is sitting",
        tone: "muted",
        href: bag.owner.user_id ? `/admin/users/${bag.owner.user_id}` : undefined,
        blocking: false,
      });
    }
  }

  return reasons;
}

// ── Sitting bags: who to chase (Fix 14) ─────────────────────────────────────

export type SittingBucket = "2-3 days" | "4-7 days" | "1-2 weeks" | "over 2 weeks";

export function sittingBucket(bag: AdminBagRow, now: Date): SittingBucket {
  const days = (now.getTime() - Date.parse(bag.updated_at)) / 86_400_000;
  if (days < 4) return "2-3 days";
  if (days < 8) return "4-7 days";
  if (days < 15) return "1-2 weeks";
  return "over 2 weeks";
}

/** Sitting bags, oldest first: the follow-up list. */
export function sittingBags(bags: readonly AdminBagRow[], now: Date): AdminBagRow[] {
  return bags.filter((bag) => isBagStale(bag, now)).sort((a, b) => Date.parse(a.updated_at) - Date.parse(b.updated_at));
}

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
  /** The true percentage, uncapped (Fix 11): 141.2 lb in a 9 lb box is 1569%. */
  fillPct: number;
  headroomLbs: number;
  /** How far past the capacity it is; 0 when it fits. */
  overLbs: number;
  over: boolean;
  /** Items with no weight at all. They were counted at 0 lb. */
  unweighedCount: number;
  /** Items weighed on the hub's scale (confirmed). */
  weighedCount: number;
  /** Items whose weight is only the listing's (an estimate). */
  estimateCount: number;
  /** Items heavier than the box on their own: oversize freight that should not be in it. */
  oversizeRefs: string[];
  /** Items that have been paid for, and items still sitting in an open bag. */
  committedCount: number;
  provisionalCount: number;
}

export type BoxItemWeightSource = "scale" | "listed" | "none";

/**
 * One item's chargeable weight and where it came from. The hub's scale wins
 * (confirmed: the reading covers every unit, floored at the minimum per unit);
 * else the listing through the packer's own `chargeableWeightLbs` (estimate).
 */
export function boxItemWeight(
  item: AdminBoxItem,
  constants: BoxConstants,
): { lbs: number | null; source: BoxItemWeightSource } {
  const scale = item.scale_weight_lbs ?? null;
  if (scale != null && scale > 0) {
    return { lbs: round2(Math.max(scale, constants.minimum_chargeable_weight_lbs * item.quantity)), source: "scale" };
  }
  const listed = chargeableWeightLbs(toPackableLine(item), constants);
  return listed == null ? { lbs: null, source: "none" } : { lbs: listed, source: "listed" };
}

/**
 * How full a box is.
 *
 * Each item's weight comes from `boxItemWeight`: the hub's scale when the parcel
 * was weighed, else the packer's own `chargeableWeightLbs`, so the admin and the
 * customer are told the same estimate. Fill is the true figure (Fix 11): an
 * over-capacity box says how far over, never "100% · 0 lb spare".
 *
 * An item with no known weight contributes 0 and is counted separately: a box
 * that looks 40% full with four unweighed items in it is not 40% full, and the
 * screen has to be able to say so.
 */
export function describeBoxFill(
  box: ConsolidationBoxRow,
  items: readonly AdminBoxItem[],
  constants: BoxConstants,
): BoxFill {
  let chargeableLbs = 0;
  let unweighedCount = 0;
  let weighedCount = 0;
  let estimateCount = 0;
  const oversizeRefs: string[] = [];
  const capacity = box.capacity_lbs;

  for (const item of items) {
    const weight = boxItemWeight(item, constants);
    if (weight.lbs == null) {
      unweighedCount += 1;
      continue;
    }
    chargeableLbs += weight.lbs;
    if (weight.source === "scale") weighedCount += 1;
    else estimateCount += 1;
    if (capacity > 0 && weight.lbs > capacity) oversizeRefs.push(item.reference ?? shortTitle(item.title) ?? "An item");
  }

  chargeableLbs = round2(chargeableLbs);
  const fill = capacityFill(chargeableLbs, capacity);

  return {
    chargeableLbs,
    fillPct: fill.pct ?? 0,
    headroomLbs: fill.spareLbs,
    overLbs: fill.overLbs,
    over: fill.over,
    unweighedCount,
    weighedCount,
    estimateCount,
    oversizeRefs,
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
  return boxItemWeight(item, constants).lbs;
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

function shortTitle(title: string | null): string | null {
  if (!title) return null;
  const t = title.trim();
  return t.length > 40 ? `${t.slice(0, 38).trimEnd()}…` : t;
}
