import { describe, expect, it } from "vitest";

import { feePromiseBreaks } from "../fee-promise";

const group = (name: string, base: number, high: number | null = null, is_active = true) => ({
  name,
  is_active,
  value_percentage: base,
  value_percentage_high: high,
});

describe("feePromiseBreaks", () => {
  it("is empty while every active group charges the default", () => {
    expect(feePromiseBreaks([group("Phones", 0.04), group("Shoes", 0.04, 0.04)], 0.04)).toEqual([]);
  });

  it("names a group whose base or high tier differs", () => {
    expect(feePromiseBreaks([group("Shoes", 0.08), group("Phones", 0.04, 0.05)], 0.04)).toEqual([
      { group: "Shoes", percentage: 0.08 },
      { group: "Phones", percentage: 0.05 },
    ]);
  });

  it("ignores deactivated groups and an unknown default", () => {
    expect(feePromiseBreaks([group("Old", 0.08, null, false)], 0.04)).toEqual([]);
    expect(feePromiseBreaks([group("Shoes", 0.08)], null)).toEqual([]);
  });
});
