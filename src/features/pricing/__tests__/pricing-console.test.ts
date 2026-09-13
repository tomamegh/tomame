import { describe, expect, it } from "vitest";

import {
  REQUIRED_PRICING_CONSTANT_KEYS,
  collectMissingConstants,
} from "../services/pricing-constant-keys";

/** A complete, usable set — the shape a migrated database holds. */
function completeConstants(): Record<string, number> {
  return Object.fromEntries(REQUIRED_PRICING_CONSTANT_KEYS.map((key) => [key, 1]));
}

describe("collectMissingConstants", () => {
  it("finds nothing to complain about when every row is present", () => {
    expect(collectMissingConstants(completeConstants())).toEqual([]);
  });

  it("names the row that is absent", () => {
    const values = completeConstants();
    delete values.fx_buffer_pct;
    expect(collectMissingConstants(values)).toEqual(["fx_buffer_pct"]);
  });

  it("treats a row that is not a finite number as missing, because it cannot price either", () => {
    const values = { ...completeConstants(), handling_fee_usd: Number.NaN };
    expect(collectMissingConstants(values)).toEqual(["handling_fee_usd"]);
  });

  it("accepts zero — a zero fee is a decision, not an absent row", () => {
    const values = { ...completeConstants(), default_value_fee_pct: 0 };
    expect(collectMissingConstants(values)).toEqual([]);
  });

  it("reports every gap at once rather than one per save", () => {
    expect(collectMissingConstants({})).toEqual([...REQUIRED_PRICING_CONSTANT_KEYS]);
  });
});
