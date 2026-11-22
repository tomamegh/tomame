import { describe, expect, it } from "vitest";

import { addressBlockLines } from "../format";
import { displayPhone, isContactPhone, normaliseContactPhone } from "../phone";

describe("one phone rule (Fix 5)", () => {
  it("normalises every spelling of a complete Ghana number to one", () => {
    for (const raw of ["0244098017", "024 409 8017", "+233 24 409 8017", "233244098017", "+233 0244098017"]) {
      expect(normaliseContactPhone(raw)).toBe("+233244098017");
    }
  });

  it("refuses the nine-digit slip the review found", () => {
    expect(isContactPhone("024409801")).toBe(false);
    expect(isContactPhone("+23324409801")).toBe(false);
  });

  it("takes an international number from abroad", () => {
    expect(normaliseContactPhone("+1 (415) 555-0100")).toBe("+14155550100");
  });

  it("shows one spelling, whichever way the number was stored", () => {
    expect(displayPhone("0244098017")).toBe("+233 24 409 8017");
    expect(displayPhone("+233244098017")).toBe("+233 24 409 8017");
    expect(displayPhone("024409801")).toBe("024409801");
  });
});

describe("addressBlockLines (Fix 5)", () => {
  it("is the address as entered, with no label in it", () => {
    expect(addressBlockLines({ line1: "10 Nii William Street", line2: null, area: null, city: "Accra", region: null })).toEqual(["10 Nii William Street", "Accra"]);
    expect(addressBlockLines({ line1: "4 Old Bortianor", line2: "Near West Hills Mall", area: "Bortianor", city: "Accra", region: "Greater Accra" })).toEqual([
      "4 Old Bortianor",
      "Near West Hills Mall",
      "Bortianor, Accra",
      "Greater Accra",
    ]);
  });
});
