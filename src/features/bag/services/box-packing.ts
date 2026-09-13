import type { PricingBreakdown } from "@/lib/pricing";

/**
 * Box packing and the consolidation saving — pure functions, no I/O, so the
 * money rules are unit-tested in isolation. `bag.service.ts` feeds them priced
 * lines and admin constants and persists the result.
 *
 * Rules (approved 2026-09-13, docs/phase-4-handoff.md §1):
 * - A box holds `box_capacity_lbs` of CHARGEABLE weight; lines pack greedily in
 *   bag order; a line heavier than a box gets one of its own. Capacity has no
 *   pricing meaning — freight stays per line.
 * - The saving is `consolidation_saving_pct × Σ freight` of a box, only when the
 *   box holds two or more lines. Freight here excludes handling, tax, the
 *   service fee and the item price.
 * - A line with no known weight joins the box at 0 lb and is flagged so the
 *   meter can say the weight is still to be confirmed.
 */

export interface BoxConstants {
  box_capacity_lbs: number;
  consolidation_saving_pct: number;
  minimum_chargeable_weight_lbs: number;
}

export interface PackableLine {
  id: string;
  quantity: number;
  /** Region the line ships from; lines without one cannot be boxed. */
  region_code: string | null;
  /**
   * Listed weight of one unit. Weight-based groups carry it on the breakdown;
   * flat-rate groups do not, so the caller passes the extraction's own figure.
   */
  weight_lbs: number | null;
  pricing: PricingBreakdown | null;
}

export interface PackedBox {
  region_code: string;
  /** 1-based within the region, for "Box 1", "Box 2". */
  index: number;
  line_ids: string[];
  capacity_lbs: number;
  /** Chargeable weight packed so far. */
  weight_lbs: number;
  fill_pct: number;
  headroom_lbs: number;
  /** Freight (ex handling) the box carries, GHS. */
  freight_ghs: number;
  saving_ghs: number;
  /** What one more line like the ones already here would add to the saving. 0 when it would not fit. */
  marginal_saving_ghs: number;
  /** Lines in the box whose listing gave no weight. The copy needs the number, not just the fact. */
  unweighed_line_count: number;
  has_unweighed_lines: boolean;
}

export interface PackingPlan {
  boxes: PackedBox[];
  /** Lines that could not be boxed: no pricing or no region. They still count in the bag. */
  unboxed_line_ids: string[];
  consolidation_saving_ghs: number;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Chargeable weight of a line: the floor the engine charged, times quantity. Null when unknown. */
export function chargeableWeightLbs(
  line: PackableLine,
  constants: BoxConstants,
): number | null {
  const w = line.pricing?.weight_lbs ?? line.weight_lbs;
  if (w == null || !(w > 0)) return null;
  return r2(
    Math.max(w, constants.minimum_chargeable_weight_lbs) * line.quantity,
  );
}

/**
 * The freight the saving applies to, in GHS: weight × rate for weight-based
 * groups (handling excluded), the flat/fixed freight for the others.
 */
export function lineFreightExHandlingGhs(pricing: PricingBreakdown): number {
  if (
    pricing.pricing_method === "weight_expression" &&
    pricing.freight_usd != null
  ) {
    const handling = pricing.handling_fee_usd ?? 0;
    return r2(
      Math.max(0, pricing.freight_usd - handling) * pricing.exchange_rate,
    );
  }
  return r2(Math.max(0, pricing.flat_rate_ghs));
}

export function packLines(
  lines: PackableLine[],
  constants: BoxConstants,
): PackingPlan {
  const boxes: PackedBox[] = [];
  const unboxed: string[] = [];
  const capacity = constants.box_capacity_lbs;

  for (const line of lines) {
    if (!line.pricing || !line.region_code || !(capacity > 0)) {
      unboxed.push(line.id);
      continue;
    }
    const weight = chargeableWeightLbs(line, constants);
    const w = weight ?? 0;
    const freight = lineFreightExHandlingGhs(line.pricing);

    // First open box in the region with room; a line that cannot fit anywhere
    // (heavier than a box, or every box full) opens a new one.
    let box = boxes.find(
      (b) =>
        b.region_code === line.region_code &&
        b.weight_lbs + w <= b.capacity_lbs,
    );
    if (!box) {
      box = {
        region_code: line.region_code,
        index:
          boxes.filter((b) => b.region_code === line.region_code).length + 1,
        line_ids: [],
        capacity_lbs: capacity,
        weight_lbs: 0,
        fill_pct: 0,
        headroom_lbs: capacity,
        freight_ghs: 0,
        saving_ghs: 0,
        marginal_saving_ghs: 0,
        unweighed_line_count: 0,
        has_unweighed_lines: false,
      };
      boxes.push(box);
    }
    box.line_ids.push(line.id);
    box.weight_lbs = r2(box.weight_lbs + w);
    box.freight_ghs = r2(box.freight_ghs + freight);
    if (weight == null) {
      box.has_unweighed_lines = true;
      box.unweighed_line_count += 1;
    }
  }

  for (const box of boxes) {
    box.fill_pct = Math.min(
      100,
      Math.round((box.weight_lbs / box.capacity_lbs) * 100),
    );
    box.headroom_lbs = r2(Math.max(0, box.capacity_lbs - box.weight_lbs));
    box.saving_ghs =
      box.line_ids.length >= 2
        ? r2(box.freight_ghs * constants.consolidation_saving_pct)
        : 0;
    box.marginal_saving_ghs = marginalSavingGhs(box, constants);
  }

  return {
    boxes,
    unboxed_line_ids: unboxed,
    consolidation_saving_ghs: r2(
      boxes.reduce((acc, b) => acc + b.saving_ghs, 0),
    ),
  };
}

/**
 * When the next box leaves: the next `departureWeekday` (0 = Sunday) whose
 * cutoff (`cutoffHours` before departure, at 00:00 UTC of that day) is still
 * ahead of `now`. A departure whose cutoff has passed rolls to the following week.
 */
export function nextDeparture(
  now: Date,
  departureWeekday: number,
  cutoffHours: number,
): { departs_at: Date; cutoff_at: Date } {
  const start = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  for (let add = 0; add < 15; add++) {
    const candidate = new Date(start.getTime() + add * 86_400_000);
    if (candidate.getUTCDay() !== departureWeekday) continue;
    const cutoff = new Date(candidate.getTime() - cutoffHours * 3_600_000);
    if (cutoff.getTime() > now.getTime())
      return { departs_at: candidate, cutoff_at: cutoff };
  }
  // Unreachable for a valid weekday (two weeks always contain one whose cutoff is ahead).
  const fallback = new Date(start.getTime() + 7 * 86_400_000);
  return {
    departs_at: fallback,
    cutoff_at: new Date(fallback.getTime() - cutoffHours * 3_600_000),
  };
}

/**
 * "Add one more and save GH₵X" — the saving this box would carry with one more
 * line in it, minus the saving it carries now.
 *
 * The hypothetical line is modelled on the ones already in the box: its weight
 * and its freight are the box's own means. That is the only figure the bag can
 * honestly project — the customer has not chosen the next product, so nothing
 * else about it is known — and it is derived from live prices, never a literal.
 *
 * Two cases follow from the saving rule (pct × the box's freight, only from two
 * lines up):
 * - It fits: the box's freight grows by the mean, and a one-line box crosses
 *   into earning a saving at all, which is why the first addition is the big one.
 * - It does not fit: the line opens a second box, that box holds one line, and
 *   nothing is saved. The answer is 0 and the caller shows no promise.
 */
function marginalSavingGhs(box: PackedBox, constants: BoxConstants): number {
  const n = box.line_ids.length;
  if (n === 0) return 0;
  // Weight is averaged over the lines that HAVE one. Averaging over all of them
  // would let unweighed siblings drag the mean toward zero and make a nearly
  // full box promise a saving for an item that would in fact open a second one.
  // With no weighed line at all the box is already packed on an unknown, so the
  // projection rides the same assumption rather than inventing a weight.
  const weighed = n - box.unweighed_line_count;
  const meanWeight = weighed > 0 ? box.weight_lbs / weighed : 0;
  const meanFreight = box.freight_ghs / n;
  if (box.weight_lbs + meanWeight > box.capacity_lbs) return 0;
  const nextSaving =
    (box.freight_ghs + meanFreight) * constants.consolidation_saving_pct;
  return r2(Math.max(0, nextSaving - box.saving_ghs));
}
