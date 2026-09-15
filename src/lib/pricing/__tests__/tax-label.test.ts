import { describe, it, expect } from "vitest";

import {
  taxFloorApplied,
  taxFloorUsd,
  taxGroupRowLabel,
  taxRowLabel,
  type TaxFacts,
} from "../tax-label";

/**
 * The numbers here are the ones Release QA measured on tomame.ca on
 * 2026-09-15, because the point of this module is that those exact receipts
 * stop lying. `tax_pct_usa` is 0.10 and `minimum_tax_usd` is 2.00.
 */
function line(subtotal: number, charged: number, rate = 0.1): TaxFacts {
  return { subtotal_usd: subtotal, tax_percentage: rate, tax_usd: charged };
}

describe("taxFloorApplied", () => {
  it("catches the three receipts QA priced end to end", () => {
    // $6.78 item → charged $2.00 → 29.5%, labelled "10% sales tax"
    expect(taxFloorApplied(line(6.78, 2.0))).toBe(true);
    // $9.48 item → charged $2.00 → 21.1%
    expect(taxFloorApplied(line(9.48, 2.0))).toBe(true);
    // $39.99 item → charged $4.00 → 10.0%, the one that was honest
    expect(taxFloorApplied(line(39.99, 4.0))).toBe(false);
  });

  it("says no when the rate and the floor land on the same figure", () => {
    // 10% of $19.95 is $1.995 → $2.00, which is also the floor. The floor
    // changed nothing, so "10% sales tax" is the true label and must survive.
    expect(taxFloorApplied(line(19.95, 2.0))).toBe(false);
    expect(taxFloorApplied(line(20, 2.0))).toBe(false);
  });

  it("says no rather than guessing when there is nothing to take a percentage of", () => {
    expect(taxFloorApplied(line(0, 2.0))).toBe(false);
    expect(taxFloorApplied(line(10, 2.0, 0))).toBe(false);
    expect(taxFloorApplied(line(NaN, 2.0))).toBe(false);
    expect(taxFloorApplied(line(10, NaN))).toBe(false);
  });

  it("reads a stored breakdown the same way as a fresh one", () => {
    // No new field is written, so an order paid before this module existed
    // resolves identically — which is where an honest receipt matters most.
    const storedOrder = JSON.parse(
      '{"subtotal_usd":6.78,"tax_percentage":0.1,"tax_usd":2,"total_ghs":357.97}',
    );
    expect(taxFloorApplied(storedOrder)).toBe(true);
  });
});

describe("taxRowLabel", () => {
  it("names the minimum instead of a percentage nobody was charged", () => {
    expect(taxRowLabel(line(6.78, 2.0), "sales tax")).toBe("Sales tax (min. $2.00)");
    expect(taxRowLabel(line(9.48, 2.0), "US sales tax")).toBe("US sales tax (min. $2.00)");
  });

  it("leaves an honest row exactly as it was", () => {
    expect(taxRowLabel(line(39.99, 4.0), "sales tax")).toBe("10% sales tax");
    expect(taxRowLabel(line(39.99, 4.0), "US sales tax")).toBe("10% US sales tax");
  });

  it("drops the percentage rather than printing NaN%", () => {
    expect(taxRowLabel(line(39.99, 4.0, NaN), "sales tax")).toBe("Sales tax");
  });

  it("prints a fractional rate without inventing precision", () => {
    expect(taxRowLabel(line(100, 8.0, 0.08), "sales tax")).toBe("8% sales tax");
    expect(taxRowLabel(line(100, 7.5, 0.075), "sales tax")).toBe("7.5% sales tax");
  });
});

describe("taxGroupRowLabel", () => {
  it("states the whole rule for the bag QA measured", () => {
    // Two items, $49.47 of goods, $6.00 of tax — 12.1% under a "10%" label.
    const lines = [line(9.48, 2.0), line(39.99, 4.0)];
    expect(taxGroupRowLabel(lines, 0.1, "sales tax")).toBe(
      "Sales tax (10%, min. $2.00 per item)",
    );
  });

  it("leaves a bag where no line was floored exactly as it was", () => {
    expect(taxGroupRowLabel([line(39.99, 4.0), line(100, 10)], 0.1, "sales tax")).toBe(
      "10% sales tax",
    );
  });

  it("drops the rate when the lines do not share one", () => {
    const lines = [line(6.78, 2.0), line(100, 8.0, 0.08)];
    expect(taxGroupRowLabel(lines, null, "sales tax")).toBe(
      "Sales tax (min. $2.00 per item)",
    );
  });

  it("is the bare noun when there is neither a floor nor a shared rate", () => {
    expect(taxGroupRowLabel([line(39.99, 4.0)], null, "sales tax")).toBe("Sales tax");
  });

  it("handles an empty bag without inventing a floor", () => {
    expect(taxGroupRowLabel([], 0.1, "sales tax")).toBe("10% sales tax");
  });
});

describe("taxFloorUsd", () => {
  it("reads the minimum off whichever line hit it", () => {
    expect(taxFloorUsd([line(39.99, 4.0), line(6.78, 2.0)])).toBe(2);
  });

  it("is null when no line was floored", () => {
    expect(taxFloorUsd([line(39.99, 4.0)])).toBeNull();
    expect(taxFloorUsd([])).toBeNull();
  });
});
