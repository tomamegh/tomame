import { describe, expect, it } from "vitest";

import type { AdminPricingGroupRow } from "@/db/queries/admin-money";
import {
  deactivationConsequence,
  describeFreight,
  describeValueFee,
  freightShape,
} from "../components/pricing-group-format";

function group(overrides: Partial<AdminPricingGroupRow> = {}): AdminPricingGroupRow {
  return {
    id: "g1",
    slug: "phone_accessories",
    name: "Phone accessories",
    flat_rate_ghs: 250,
    flat_rate_expression: null,
    value_percentage: 0.05,
    value_percentage_high: null,
    value_threshold_usd: null,
    default_weight_lbs: null,
    requires_weight: false,
    is_active: true,
    sort_order: 0,
    updated_at: "2026-09-13T00:00:00.000Z",
    category_count: 3,
    ...overrides,
  };
}

describe("freightShape", () => {
  it("is flat when the group carries a cedi rate", () => {
    expect(freightShape(group())).toBe("flat");
  });

  it("is weight-based when the expression column marks it so", () => {
    expect(freightShape(group({ flat_rate_ghs: null, flat_rate_expression: "weight" }))).toBe(
      "weight",
    );
  });

  it("is unpriceable when neither column is set, which is a real failure mode", () => {
    expect(freightShape(group({ flat_rate_ghs: null, flat_rate_expression: null }))).toBe(
      "unpriceable",
    );
  });

  it("treats an empty expression string as not set", () => {
    expect(freightShape(group({ flat_rate_ghs: null, flat_rate_expression: "" }))).toBe(
      "unpriceable",
    );
  });
});

describe("describeFreight", () => {
  it("prints the flat rate per item", () => {
    expect(describeFreight(group({ flat_rate_ghs: 250 }))).toBe("GH₵250 per item");
  });

  it("names the assumed weight when the group has one", () => {
    const row = group({ flat_rate_ghs: null, flat_rate_expression: "weight", default_weight_lbs: 2 });
    expect(describeFreight(row)).toContain("2 lb assumed");
  });

  it("says a weight-required group refuses to price without one", () => {
    const row = group({
      flat_rate_ghs: null,
      flat_rate_expression: "weight",
      requires_weight: true,
    });
    expect(describeFreight(row)).toContain("refuses to price");
  });

  it("warns when a group can price nothing", () => {
    const row = group({ flat_rate_ghs: null, flat_rate_expression: null });
    expect(describeFreight(row)).toContain("goes to review");
  });
});

describe("describeValueFee", () => {
  it("is a single percentage when the group is not tiered", () => {
    expect(describeValueFee(group())).toBe("5%");
  });

  it("spells out both tiers and where they switch", () => {
    const row = group({ value_percentage_high: 0.03, value_threshold_usd: 500 });
    expect(describeValueFee(row)).toBe("5% up to $500, then 3%");
  });

  it("ignores a high percentage with no threshold, as the calculator does", () => {
    expect(describeValueFee(group({ value_percentage_high: 0.03 }))).toBe("5%");
  });
});

describe("deactivationConsequence", () => {
  it("counts the categories that will start coming back unpriced", () => {
    const text = deactivationConsequence(group({ category_count: 3 }));
    expect(text).toContain("3 categories");
    expect(text).toContain("needs review");
  });

  it("uses the singular for one category", () => {
    expect(deactivationConsequence(group({ category_count: 1 }))).toContain("1 category still routes");
  });

  it("says plainly when nothing routes to the group", () => {
    expect(deactivationConsequence(group({ category_count: 0 }))).toContain("changes no prices today");
  });
});
