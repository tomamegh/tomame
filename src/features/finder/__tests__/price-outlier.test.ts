import { describe, expect, it } from "vitest";

import { isSuspiciouslyLow, medianOf, outlierReason, outlierReference, referencePriceUsd } from "../price-outlier";

describe("price outliers among exact matches", () => {
  it("takes the median of the priced matches", () => {
    expect(medianOf([249, 82, 319, 240])).toBe(244.5);
    expect(medianOf([0, Number.NaN])).toBeNull();
  });

  it("does not judge with fewer than three priced matches", () => {
    expect(referencePriceUsd([82, 323])).toBeNull();
    expect(isSuspiciouslyLow(82, referencePriceUsd([82, 323]))).toBe(false);
  });

  it("flags a new item priced far below the others", () => {
    const ref = referencePriceUsd([82, 249, 240, 319]);
    expect(isSuspiciouslyLow(82, ref)).toBe(true);
    expect(isSuspiciouslyLow(219, ref)).toBe(false);
  });

  it("with two matches, flags only an extreme gap", () => {
    const ref = outlierReference([82, 323]);
    expect(isSuspiciouslyLow(82, ref)).toBe(true);
    expect(isSuspiciouslyLow(200, outlierReference([200, 323]))).toBe(false);
    expect(outlierReference([82])).toBeNull();
  });

  it("says why in plain words", () => {
    expect(outlierReason(82, 244.5)).toBe("Price far below other new listings ($82 against a typical $244.50): we check the seller before you pay");
  });
});
