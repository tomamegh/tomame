import { describe, it, expect } from "vitest";

import {
  carTitle,
  daysBetween,
  enquiryCallToAction,
  enquiryKindFor,
  formatEta,
  formatMileage,
  formatPesewas,
  originLabel,
  priceBreakdownRows,
  priceLabel,
  suggestCarSlug,
  voyageStage,
} from "../format";

/**
 * The pure half of the cars feature.
 *
 * Three of these are not style checks. `priceLabel` must never print a number
 * for a price-on-request listing; `formatMileage` must never convert a unit; and
 * `priceBreakdownRows` must never invent a line to make the arithmetic work.
 * Each of those would be a wrong claim about a five-figure purchase.
 */

describe("formatPesewas", () => {
  it("prints whole cedis without a decimal tail", () => {
    expect(formatPesewas(18_450_000)).toBe("GH₵184,500");
  });

  it("keeps real pesewas rather than rounding a price away", () => {
    expect(formatPesewas(18_450_050)).toBe("GH₵184,500.50");
  });
});

describe("priceLabel", () => {
  it("prints the amount for a fixed price and says what it includes", () => {
    const label = priceLabel({ price_state: "fixed", price_pesewas: 18_450_000 });
    expect(label.text).toBe("GH₵184,500");
    expect(label.isAmount).toBe(true);
    expect(label.note).toMatch(/duty and clearing included/i);
  });

  it("prints the asking price for a negotiable listing and invites an offer", () => {
    const label = priceLabel({ price_state: "negotiable", price_pesewas: 9_900_000 });
    expect(label.text).toBe("GH₵99,000");
    expect(label.note).toMatch(/offers welcome/i);
  });

  it("NEVER prints a number when the price is on request", () => {
    const label = priceLabel({ price_state: "on_request", price_pesewas: null });
    expect(label.text).toBe("Price on request");
    expect(label.isAmount).toBe(false);
  });

  it("still prints no number if a stale price rides along on an on_request row", () => {
    // The database forbids this combination; the helper must not depend on that
    // to avoid publishing a price the listing exists to withhold.
    const label = priceLabel({ price_state: "on_request", price_pesewas: 18_450_000 });
    expect(label.text).toBe("Price on request");
    expect(label.isAmount).toBe(false);
  });
});

describe("enquiryKindFor / enquiryCallToAction", () => {
  it("offers a price request only on an unpriced car", () => {
    expect(enquiryKindFor("on_request")).toBe("price_request");
    expect(enquiryCallToAction("on_request")).toBe("Ask for the price");
  });

  it("offers an offer only on a negotiable car", () => {
    expect(enquiryKindFor("negotiable")).toBe("offer");
    expect(enquiryCallToAction("negotiable")).toBe("Make an offer");
  });

  it("offers nothing on a fixed price — there is nothing to negotiate", () => {
    expect(enquiryKindFor("fixed")).toBeNull();
    expect(enquiryCallToAction("fixed")).toBeNull();
  });
});

describe("formatMileage", () => {
  it("prints the unit it was given and does not convert", () => {
    expect(formatMileage(82_000, "mi")).toBe("82,000 mi");
    expect(formatMileage(82_000, "km")).toBe("82,000 km");
  });

  it("returns null for an unknown reading rather than claiming zero", () => {
    expect(formatMileage(null, "mi")).toBeNull();
  });
});

describe("carTitle", () => {
  it("reads as a person would say it", () => {
    expect(carTitle({ year: 2019, make: "Toyota", model: "Highlander", trim: "XLE" })).toBe(
      "2019 Toyota Highlander XLE",
    );
  });

  it("drops an absent trim without leaving a double space", () => {
    expect(carTitle({ year: 2021, make: "Kia", model: "Sorento", trim: null })).toBe(
      "2021 Kia Sorento",
    );
  });
});

describe("originLabel", () => {
  it("names the countries the parcel list does not have", () => {
    expect(originLabel("JAPAN")).toBe("Japan");
    expect(originLabel("KOREA")).toBe("South Korea");
    expect(originLabel("GERMANY")).toBe("Germany");
  });
});

describe("voyageStage", () => {
  const listing = { sailed_on: "2026-02-01", eta_tema: "2026-03-14" };

  it("is not sailed before the sailing date", () => {
    expect(voyageStage(listing, "2026-01-20")).toBe("not_sailed");
  });

  it("is at sea in the middle of the crossing", () => {
    expect(voyageStage(listing, "2026-02-10")).toBe("at_sea");
  });

  it("is arriving inside the last fortnight", () => {
    expect(voyageStage(listing, "2026-03-05")).toBe("arriving");
  });

  it("has landed once the ETA has passed", () => {
    expect(voyageStage(listing, "2026-03-20")).toBe("landed");
  });

  it("says nothing when there are no dates at all", () => {
    expect(voyageStage({ sailed_on: null, eta_tema: null }, "2026-03-20")).toBe("unknown");
  });
});

describe("daysBetween", () => {
  it("counts whole days forward", () => {
    expect(daysBetween("2026-03-01", "2026-03-14")).toBe(13);
  });

  it("goes negative for a date already past", () => {
    expect(daysBetween("2026-03-20", "2026-03-14")).toBe(-6);
  });
});

describe("formatEta", () => {
  it("prints the date a customer plans around", () => {
    expect(formatEta("2026-03-14")).toBe("14 March 2026");
  });

  it("is null when there is no ETA", () => {
    expect(formatEta(null)).toBeNull();
  });
});

describe("priceBreakdownRows", () => {
  it("builds the card from the breakdown and ends on the landed total", () => {
    const rows = priceBreakdownRows(
      {
        vehicle_pesewas: 10_000_000,
        freight_insurance_pesewas: 2_000_000,
        duty_clearing_pesewas: 5_500_000,
        service_fee_pesewas: 950_000,
      },
      18_450_000,
    );

    expect(rows).toHaveLength(5);
    expect(rows.at(-1)).toEqual({
      label: "Landed in Tema",
      pesewas: 18_450_000,
      isTotal: true,
    });
    // The four components add up to the total. The database enforces this too;
    // the card must not be able to show a set that does not.
    const parts = rows.slice(0, 4).reduce((sum, row) => sum + row.pesewas, 0);
    expect(parts).toBe(18_450_000);
  });

  it("draws nothing without a breakdown", () => {
    expect(priceBreakdownRows(null, 18_450_000)).toEqual([]);
  });

  it("draws nothing without a total, rather than inventing one", () => {
    expect(
      priceBreakdownRows(
        {
          vehicle_pesewas: 1,
          freight_insurance_pesewas: 1,
          duty_clearing_pesewas: 1,
          service_fee_pesewas: 1,
        },
        null,
      ),
    ).toEqual([]);
  });
});

describe("suggestCarSlug", () => {
  it("makes a readable link out of the car's name", () => {
    expect(
      suggestCarSlug({ year: 2019, make: "Toyota", model: "Highlander", trim: "XLE" }),
    ).toBe("2019-toyota-highlander-xle");
  });

  it("strips accents rather than leaving a hole in the word", () => {
    expect(suggestCarSlug({ year: 2020, make: "Citroën", model: "C3" })).toBe(
      "2020-citroen-c3",
    );
  });

  it("never ends on a hyphen, which the column's CHECK would refuse", () => {
    const slug = suggestCarSlug({ year: 2022, make: "BMW", model: "X5", trim: "  " });
    expect(slug).toBe("2022-bmw-x5");
    expect(slug.endsWith("-")).toBe(false);
  });
});
