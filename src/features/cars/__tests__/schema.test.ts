import { describe, it, expect } from "vitest";

import {
  answerCarEnquirySchema,
  createCarEnquirySchema,
  createCarListingSchema,
} from "../schema";

/**
 * The three price states, and the enquiry rule that mirrors them.
 *
 * The DATABASE is what guarantees these (`car_listings_price_state_has_price`,
 * `car_enquiries_kind_amount`); this layer exists so the admin is told which
 * field is wrong in a sentence instead of being handed a constraint name in a
 * 500. Both halves are tested because the pair is the invariant: a rule that is
 * only enforced in one direction lets the other one through.
 */

const base = {
  slug: "2019-toyota-highlander-xle",
  make: "Toyota",
  model: "Highlander",
  year: 2019,
  origin_country: "JAPAN",
  description: "Clean.",
};

describe("createCarListingSchema — the three price states", () => {
  it("accepts a fixed price with a price", () => {
    const parsed = createCarListingSchema.safeParse({
      ...base,
      price_state: "fixed",
      price_pesewas: 18_450_000,
    });
    expect(parsed.success).toBe(true);
  });

  it("accepts a negotiable listing with an asking price", () => {
    const parsed = createCarListingSchema.safeParse({
      ...base,
      price_state: "negotiable",
      price_pesewas: 18_450_000,
    });
    expect(parsed.success).toBe(true);
  });

  it("accepts price-on-request with no price at all", () => {
    const parsed = createCarListingSchema.safeParse({ ...base, price_state: "on_request" });
    expect(parsed.success).toBe(true);
  });

  it("refuses a fixed price with no price", () => {
    const parsed = createCarListingSchema.safeParse({ ...base, price_state: "fixed" });
    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues[0]?.message).toMatch(/needs a price/i);
  });

  it("refuses a negotiable listing with nothing to offer against", () => {
    const parsed = createCarListingSchema.safeParse({ ...base, price_state: "negotiable" });
    expect(parsed.success).toBe(false);
  });

  it("refuses price-on-request that still carries a price", () => {
    const parsed = createCarListingSchema.safeParse({
      ...base,
      price_state: "on_request",
      price_pesewas: 18_450_000,
    });
    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues[0]?.message).toMatch(/must not carry a price/i);
  });
});

describe("createCarListingSchema — the breakdown", () => {
  const priced = { ...base, price_state: "fixed" as const, price_pesewas: 18_450_000 };

  it("accepts four parts that add up to the total", () => {
    const parsed = createCarListingSchema.safeParse({
      ...priced,
      vehicle_price_pesewas: 10_000_000,
      freight_insurance_pesewas: 2_000_000,
      duty_clearing_pesewas: 5_500_000,
      service_fee_pesewas: 950_000,
    });
    expect(parsed.success).toBe(true);
  });

  it("refuses four parts that do not", () => {
    const parsed = createCarListingSchema.safeParse({
      ...priced,
      vehicle_price_pesewas: 10_000_000,
      freight_insurance_pesewas: 2_000_000,
      duty_clearing_pesewas: 5_500_000,
      service_fee_pesewas: 1_000_000,
    });
    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues[0]?.message).toMatch(/add up to/i);
  });

  it("refuses a partial breakdown, which reads as though the rest were zero", () => {
    const parsed = createCarListingSchema.safeParse({
      ...priced,
      vehicle_price_pesewas: 10_000_000,
      freight_insurance_pesewas: 2_000_000,
    });
    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues[0]?.message).toMatch(/all four parts/i);
  });
});

describe("createCarListingSchema — field shapes", () => {
  it("uppercases a VIN and refuses one with the ambiguous letters", () => {
    const ok = createCarListingSchema.safeParse({
      ...base,
      price_state: "on_request",
      vin: "1hgcm82633a004352",
    });
    expect(ok.success).toBe(true);
    expect(ok.data?.vin).toBe("1HGCM82633A004352");

    const bad = createCarListingSchema.safeParse({
      ...base,
      price_state: "on_request",
      vin: "1HGCM8263IA004352",
    });
    expect(bad.success).toBe(false);
  });

  it("refuses a slug with capitals or spaces, matching the column's CHECK", () => {
    const parsed = createCarListingSchema.safeParse({
      ...base,
      slug: "2019 Toyota Highlander",
      price_state: "on_request",
    });
    expect(parsed.success).toBe(false);
  });

  it("refuses a price given in cedis rather than pesewas", () => {
    const parsed = createCarListingSchema.safeParse({
      ...base,
      price_state: "fixed",
      price_pesewas: 184_500.5,
    });
    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues[0]?.message).toMatch(/whole pesewas/i);
  });

  it("defaults mileage to miles, since most stock is American", () => {
    const parsed = createCarListingSchema.safeParse({ ...base, price_state: "on_request" });
    expect(parsed.data?.mileage_unit).toBe("mi");
  });
});

describe("createCarEnquirySchema", () => {
  it("requires an amount on an offer", () => {
    expect(createCarEnquirySchema.safeParse({ kind: "offer" }).success).toBe(false);
    expect(
      createCarEnquirySchema.safeParse({ kind: "offer", offer_pesewas: 17_000_000 }).success,
    ).toBe(true);
  });

  it("forbids an amount on a price request", () => {
    expect(createCarEnquirySchema.safeParse({ kind: "price_request" }).success).toBe(true);
    const bad = createCarEnquirySchema.safeParse({
      kind: "price_request",
      offer_pesewas: 17_000_000,
    });
    expect(bad.success).toBe(false);
  });
});

describe("answerCarEnquirySchema", () => {
  it("refuses an answer with neither words nor a figure", () => {
    expect(answerCarEnquirySchema.safeParse({ status: "answered" }).success).toBe(false);
  });

  it("accepts an answer that is just a price", () => {
    expect(
      answerCarEnquirySchema.safeParse({ status: "answered", quoted_pesewas: 17_800_000 })
        .success,
    ).toBe(true);
  });

  it("requires a reason for a decline — the customer reads it", () => {
    expect(answerCarEnquirySchema.safeParse({ status: "declined" }).success).toBe(false);
    expect(
      answerCarEnquirySchema.safeParse({ status: "declined", admin_response: "Sold already." })
        .success,
    ).toBe(true);
  });

  it("does not offer a way back to open — a settled row stays settled", () => {
    expect(answerCarEnquirySchema.safeParse({ status: "open" }).success).toBe(false);
  });
});
