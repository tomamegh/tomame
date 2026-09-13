import { describe, it, expect } from "vitest";
import type { PricingBreakdown } from "@/lib/pricing";
import { chargeableWeightLbs, lineFreightExHandlingGhs, nextDeparture, packLines, type PackableLine } from "../services/box-packing";

const C = { box_capacity_lbs: 9, consolidation_saving_pct: 0.2, minimum_chargeable_weight_lbs: 1 };

function weightLine(id: string, weightLbs: number | undefined, qty = 1, region: string | null = "USA"): PackableLine {
  const freightUsd = weightLbs != null ? Math.max(weightLbs, 1) * qty * 5 + 3 : undefined;
  const pricing: PricingBreakdown = {
    pricing_method: "weight_expression", pricing_group: "other", item_price: 100, item_currency: "USD", item_price_usd: 100,
    quantity: qty, subtotal_usd: 100 * qty, exchange_rate: 15, mid_market_rate: 14.43, tax_percentage: 0.1, tax_usd: 10 * qty,
    value_fee_percentage: 0.07, value_fee_usd: 7 * qty, flat_rate_ghs: freightUsd != null ? freightUsd * 15 : 0, total_ghs: 0,
    total_pesewas: 0, fee_calculation_note: "", weight_lbs: weightLbs, freight_usd: freightUsd, handling_fee_usd: 3, freight_rate_per_lb: 5,
  };
  return { id, quantity: qty, region_code: region, weight_lbs: null, pricing };
}

function flatLine(id: string, flatGhs: number, qty = 1): PackableLine {
  const l = weightLine(id, 2, qty);
  l.pricing = { ...l.pricing!, pricing_method: "flat_rate", flat_rate_ghs: flatGhs * qty, freight_usd: undefined, handling_fee_usd: undefined };
  return l;
}

describe("chargeableWeightLbs", () => {
  it("floors at the minimum and scales with quantity; unknown stays null", () => {
    expect(chargeableWeightLbs(weightLine("a", 0.6, 3), C)).toBe(3);
    expect(chargeableWeightLbs(weightLine("a", 2.5, 2), C)).toBe(5);
    expect(chargeableWeightLbs(weightLine("a", undefined), C)).toBeNull();
  });
});

describe("lineFreightExHandlingGhs", () => {
  it("strips the handling fee from weight freight and takes flat freight whole", () => {
    // 0.6 lb → 1 lb × $5 + $3 = $8; ex handling $5 × 15 = GH₵75
    expect(lineFreightExHandlingGhs(weightLine("a", 0.6).pricing!)).toBe(75);
    expect(lineFreightExHandlingGhs(flatLine("b", 400, 2).pricing!)).toBe(800);
  });
});

describe("flat-rate lines weigh what the listing says", () => {
  it("falls back to the extraction's weight when the breakdown carries none", () => {
    const l = flatLine("a", 250);
    l.pricing = { ...l.pricing!, weight_lbs: undefined };
    expect(chargeableWeightLbs({ ...l, weight_lbs: 1.2 }, C)).toBe(1.2);
    expect(chargeableWeightLbs({ ...l, weight_lbs: 0.5 }, C)).toBe(1); // floored at the minimum
    expect(chargeableWeightLbs({ ...l, weight_lbs: null }, C)).toBeNull();
  });
});

describe("packLines", () => {
  it("packs greedily by chargeable weight and saves 20% of the box freight once two lines share it", () => {
    const plan = packLines([weightLine("a", 0.6), weightLine("b", 4.8)], C);
    expect(plan.boxes).toHaveLength(1);
    const [box] = plan.boxes;
    expect(box).toMatchObject({ region_code: "USA", index: 1, line_ids: ["a", "b"], weight_lbs: 5.8, fill_pct: 64, headroom_lbs: 3.2 });
    // freight ex handling: (1 + 4.8) lb × $5 × 15 = GH₵435 → 20% = GH₵87
    expect(box!.freight_ghs).toBe(435);
    expect(box!.saving_ghs).toBe(87);
    expect(plan.consolidation_saving_ghs).toBe(87);
  });

  it("a single line saves nothing", () => {
    const plan = packLines([weightLine("a", 3)], C);
    expect(plan.boxes[0]!.saving_ghs).toBe(0);
    expect(plan.consolidation_saving_ghs).toBe(0);
  });

  it("overflow opens Box 2; an oversize line gets its own box", () => {
    const plan = packLines([weightLine("a", 5), weightLine("b", 5), weightLine("c", 21.8)], C);
    expect(plan.boxes.map((b) => [b.index, b.line_ids, b.weight_lbs])).toEqual([[1, ["a"], 5], [2, ["b"], 5], [3, ["c"], 21.8]]);
    expect(plan.boxes[2]!.fill_pct).toBe(100);
    expect(plan.boxes[2]!.headroom_lbs).toBe(0);
  });

  it("flat-rate lines join the box and their flat freight joins the saving", () => {
    const plan = packLines([flatLine("a", 400), weightLine("b", 2)], C);
    expect(plan.boxes).toHaveLength(1);
    // flat 400 + (2 lb × $5 × 15 = 150) = 550 → 20% = 110
    expect(plan.boxes[0]!.saving_ghs).toBe(110);
  });

  it("unknown weight joins at 0 lb and is flagged; unpriced or region-less lines stay unboxed", () => {
    const plan = packLines([weightLine("a", undefined), weightLine("b", 2), { id: "c", quantity: 1, region_code: "USA", weight_lbs: null, pricing: null }, weightLine("d", 1, 1, null)], C);
    expect(plan.boxes[0]!.line_ids).toEqual(["a", "b"]);
    expect(plan.boxes[0]!.has_unweighed_lines).toBe(true);
    expect(plan.boxes[0]!.weight_lbs).toBe(2);
    expect(plan.unboxed_line_ids).toEqual(["c", "d"]);
  });

  it("regions never share a box", () => {
    const plan = packLines([weightLine("a", 1, 1, "USA"), weightLine("b", 1, 1, "UK")], C);
    expect(plan.boxes.map((b) => [b.region_code, b.index])).toEqual([["USA", 1], ["UK", 1]]);
    expect(plan.consolidation_saving_ghs).toBe(0);
  });
});

describe("nextDeparture", () => {
  it("picks the coming Friday while its cutoff is ahead, else the Friday after", () => {
    // Sunday 13 Sep 2026 10:00Z → Friday 18 Sep, cutoff Thursday 17 Sep 00:00Z
    const a = nextDeparture(new Date("2026-09-13T10:00:00Z"), 5, 24);
    expect(a.departs_at.toISOString()).toBe("2026-09-18T00:00:00.000Z");
    expect(a.cutoff_at.toISOString()).toBe("2026-09-17T00:00:00.000Z");
    // Thursday 17 Sep 08:00Z: cutoff passed → Friday 25 Sep
    const b = nextDeparture(new Date("2026-09-17T08:00:00Z"), 5, 24);
    expect(b.departs_at.toISOString()).toBe("2026-09-25T00:00:00.000Z");
    // On the departure weekday itself with cutoff passed → next week
    const c = nextDeparture(new Date("2026-09-18T08:00:00Z"), 5, 24);
    expect(c.departs_at.toISOString()).toBe("2026-09-25T00:00:00.000Z");
  });
});
