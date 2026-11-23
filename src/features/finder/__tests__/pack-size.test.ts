import { describe, expect, it } from "vitest";

import { packPhrase, packSizeOf, perUnit } from "../pack-size";
import { isSuspiciouslyLow, outlierReference } from "../price-outlier";

describe("packSizeOf", () => {
  it.each([
    ["Kirkland Minoxidil 5% Extra Strength Men 6 Month Supply Hair Regrowth EXP 06/28", 6, "month"],
    ["Kirkland Minoxidil 5% Extra Strength Men 6Month Supply Hair Regrowth 02-2027", 6, "month"],
    ["KIRKLAND Signature 5% Minoxidil Hair Regrowth for Men - 1 Month Supply", 1, "month"],
    ["Tide PODS Laundry Detergent, Pack of 3", 3, "pack"],
    ["Duracell AA Batteries 4-Pack", 4, "pack"],
    ["Jarrow Zinc Balance 15 mg, 100 Capsules", 1, "pack"],
    ["Sony WH-1000XM5 Wireless Headphones", 1, "pack"],
  ])("%s → %i", (title, units, kind) => {
    expect(packSizeOf(title)).toEqual({ units, kind });
  });

  it("phrases a pack for the customer", () => {
    expect(packPhrase("Minoxidil 6 Month Supply")).toBe("a 6-month supply");
    expect(packPhrase("Minoxidil - 1 Month Supply")).toBe("a 1-month supply");
    expect(packPhrase("Pack of 3")).toBe("a pack of 3");
    expect(packPhrase("Sony headphones")).toBeNull();
  });
});

describe("outlier check per unit — the Kirkland case (2026-11-23)", () => {
  const listings = [
    { title: "Kirkland Minoxidil 5% Extra Strength Men 6 Month Supply", priceUsd: 22 },
    { title: "Kirkland Minoxidil 5% Extra Strength Men 6Month Supply", priceUsd: 22 },
    { title: "KIRKLAND Signature 5% Minoxidil - 1 Month Supply", priceUsd: 12.99 },
  ];

  it("no longer flags a 1-month bottle as far below 6-month packs", () => {
    const raw = outlierReference(listings.map((l) => l.priceUsd));
    expect(isSuspiciouslyLow(12.99, raw)).toBe(true); // the old, wrong verdict
    const reference = outlierReference(listings.map((l) => perUnit(l.priceUsd, l.title)));
    for (const l of listings) expect(isSuspiciouslyLow(perUnit(l.priceUsd, l.title), reference)).toBe(false);
  });

  it("still flags a single item far below the same item elsewhere", () => {
    const reference = outlierReference([240, 250, 260].map((p) => perUnit(p, "AirPods Pro 2")));
    expect(isSuspiciouslyLow(perUnit(82, "AirPods Pro 2"), reference)).toBe(true);
  });
});
