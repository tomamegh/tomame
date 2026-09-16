import { describe, expect, it } from "vitest";

import { CAR_PRICE_STATES } from "@/config/constants";
import {
  buildCarPayload,
  carFormProblem,
  cedisFromPesewas,
  describeBreakdown,
  emptyCarForm,
  parseCedis,
  priceStateProblem,
  withPriceState,
  type CarFormValues,
} from "../car-form-state";

/**
 * The car form's rules (migration 067).
 *
 * TWO THINGS ARE WORTH A TEST HERE, and they are the two the feature would be
 * wrong without: that an illegal price combination cannot be built, and that
 * cedis become pesewas without a coin going astray. The rest of the form is
 * fields.
 */

function form(overrides: Partial<CarFormValues> = {}): CarFormValues {
  return {
    ...emptyCarForm(),
    slug: "2019-toyota-highlander-xle",
    make: "Toyota",
    model: "Highlander",
    year: "2019",
    ...overrides,
  };
}

describe("parseCedis", () => {
  it("reads a plain figure", () => {
    expect(parseCedis("184500")).toEqual({ ok: true, pesewas: 18_450_000 });
  });

  it("reads the thousands separators and currency symbol an admin pastes", () => {
    expect(parseCedis("GH₵184,500.50")).toEqual({ ok: true, pesewas: 18_450_050 });
    expect(parseCedis(" 184 500 ")).toEqual({ ok: true, pesewas: 18_450_000 });
  });

  it("treats a blank field as no amount, which is a legal answer", () => {
    expect(parseCedis("")).toEqual({ ok: true, pesewas: null });
    expect(parseCedis("   ")).toEqual({ ok: true, pesewas: null });
  });

  it("pads a single decimal place rather than reading it as pesewas", () => {
    // "0.5" is fifty pesewas, not five. The obvious bug in a hand-rolled parser.
    expect(parseCedis("0.5")).toEqual({ ok: true, pesewas: 50 });
  });

  /**
   * THE REASON THIS FUNCTION EXISTS. Every one of these is a value where
   * `Math.round(Number(value) * 100)` is either wrong or only accidentally
   * right, and a pesewa astray makes a breakdown disagree with its total.
   */
  it("converts without floating point", () => {
    expect(parseCedis("816.55").ok && parseCedis("816.55")).toMatchObject({ pesewas: 81_655 });
    expect(parseCedis("1.005")).toMatchObject({ ok: false });
    expect(parseCedis("70.07")).toMatchObject({ pesewas: 7007 });
    expect(parseCedis("1234567.89")).toMatchObject({ pesewas: 123_456_789 });
  });

  it("refuses a third decimal place rather than rounding it away", () => {
    const result = parseCedis("184500.555");
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.problem).toMatch(/two decimal places/i);
  });

  it("refuses letters and refuses an amount past the column's ceiling", () => {
    expect(parseCedis("one hundred").ok).toBe(false);
    expect(parseCedis("99999999").ok).toBe(false);
  });

  it("round-trips through cedisFromPesewas", () => {
    for (const pesewas of [0, 50, 7007, 18_450_000, 18_450_050, 123_456_789]) {
      expect(parseCedis(cedisFromPesewas(pesewas))).toEqual({ ok: true, pesewas });
    }
    expect(cedisFromPesewas(null)).toBe("");
    // Whole cedis lose the ".00"; a figure that carries pesewas keeps them.
    expect(cedisFromPesewas(18_450_000)).toBe("184500");
    expect(cedisFromPesewas(18_450_050)).toBe("184500.50");
  });
});

describe("the three price states", () => {
  it("refuses a fixed price with no price", () => {
    const problem = priceStateProblem(form({ price_state: CAR_PRICE_STATES.FIXED, price: "" }));
    expect(problem).toBe("A fixed price needs a price.");
  });

  it("refuses a negotiable listing with no asking price", () => {
    const problem = priceStateProblem(
      form({ price_state: CAR_PRICE_STATES.NEGOTIABLE, price: "" }),
    );
    expect(problem).toMatch(/needs an asking price/i);
  });

  it("refuses an on-request listing that is carrying a price", () => {
    // Unreachable through the form — `withPriceState` clears the field — but the
    // rule is stated so a caller that sets the values directly is refused here
    // rather than by `car_listings_price_state_has_price`.
    const problem = priceStateProblem(
      form({ price_state: CAR_PRICE_STATES.ON_REQUEST, price: "184500" }),
    );
    expect(problem).toMatch(/carries no price/i);
  });

  it("clears the money when the admin chooses price on request", () => {
    const priced = form({
      price_state: CAR_PRICE_STATES.FIXED,
      price: "184500",
      vehicle_price: "100000",
      freight_insurance: "30000",
      duty_clearing: "44500",
      service_fee: "10000",
    });
    const cleared = withPriceState(priced, CAR_PRICE_STATES.ON_REQUEST);
    expect(cleared).toMatchObject({
      price_state: CAR_PRICE_STATES.ON_REQUEST,
      price: "",
      vehicle_price: "",
      freight_insurance: "",
      duty_clearing: "",
      service_fee: "",
    });
    expect(priceStateProblem(cleared)).toBeNull();
  });

  it("leaves the money alone when moving between the two priced states", () => {
    const priced = form({ price_state: CAR_PRICE_STATES.FIXED, price: "184500" });
    expect(withPriceState(priced, CAR_PRICE_STATES.NEGOTIABLE).price).toBe("184500");
  });

  /** The illegal pair must not be constructible, whatever is in the fields. */
  it("sends five nulls for an on-request listing even with figures in state", () => {
    const stale: CarFormValues = {
      ...form(),
      price_state: CAR_PRICE_STATES.ON_REQUEST,
      price: "",
      // A value left behind by a caller that did not go through `withPriceState`.
      vehicle_price: "100000",
    };
    const built = buildCarPayload(stale, false);
    expect(built.ok).toBe(true);
    expect(built.ok && built.body).toMatchObject({
      price_state: CAR_PRICE_STATES.ON_REQUEST,
      price_pesewas: null,
      vehicle_price_pesewas: null,
      freight_insurance_pesewas: null,
      duty_clearing_pesewas: null,
      service_fee_pesewas: null,
    });
  });
});

describe("the breakdown", () => {
  const complete = {
    price: "184500",
    vehicle_price: "100000",
    freight_insurance: "30000",
    duty_clearing: "44500",
    service_fee: "10000",
  };

  it("is nothing at all when every part is blank", () => {
    expect(describeBreakdown(form())).toEqual({ kind: "empty" });
  });

  it("is partial when some but not all four are filled", () => {
    const state = describeBreakdown(form({ vehicle_price: "100000", duty_clearing: "44500" }));
    expect(state).toEqual({ kind: "partial", filled: 2 });
  });

  it("refuses a partial breakdown on save", () => {
    const problem = priceStateProblem(
      form({ price_state: CAR_PRICE_STATES.FIXED, price: "184500", vehicle_price: "100000" }),
    );
    expect(problem).toMatch(/all four parts/i);
  });

  it("adds the four parts up and reports the difference against the total", () => {
    const state = describeBreakdown(form(complete));
    expect(state).toEqual({
      kind: "complete",
      sum: 18_450_000,
      total: 18_450_000,
      difference: 0,
    });
  });

  it("names the shortfall when the parts do not reach the total", () => {
    const problem = priceStateProblem(
      form({ ...complete, price_state: CAR_PRICE_STATES.FIXED, service_fee: "9000" }),
    );
    expect(problem).toMatch(/GH₵1,000 less than the price above/);
  });

  it("names the overshoot when the parts pass the total", () => {
    const problem = priceStateProblem(
      form({ ...complete, price_state: CAR_PRICE_STATES.FIXED, service_fee: "10500" }),
    );
    expect(problem).toMatch(/GH₵500 more than the price above/);
  });

  it("lets a matching breakdown through", () => {
    expect(
      priceStateProblem(form({ ...complete, price_state: CAR_PRICE_STATES.FIXED })),
    ).toBeNull();
  });

  /**
   * A pesewa is the unit the database compares in, so a difference of one is a
   * refused write — the form has to catch it here.
   */
  it("catches a one-pesewa disagreement", () => {
    const state = describeBreakdown(form({ ...complete, service_fee: "10000.01" }));
    expect(state).toMatchObject({ difference: 1 });
  });
});

describe("carFormProblem", () => {
  it("passes a complete listing", () => {
    expect(carFormProblem(form())).toBeNull();
  });

  it("asks for the things a listing cannot be without", () => {
    expect(carFormProblem(form({ make: "  " }))).toBe("Which make?");
    expect(carFormProblem(form({ model: "" }))).toBe("Which model?");
    expect(carFormProblem(form({ year: "" }))).toMatch(/model year/i);
    expect(carFormProblem(form({ year: "1890" }))).toMatch(/model year/i);
  });

  it("mirrors the slug column's own CHECK", () => {
    expect(carFormProblem(form({ slug: "ab" }))).toMatch(/three characters/i);
    expect(carFormProblem(form({ slug: "Toyota Highlander" }))).toMatch(/lowercase/i);
    expect(carFormProblem(form({ slug: "toyota--highlander" }))).toMatch(/lowercase/i);
  });

  it("checks the VIN alphabet, and lets a blank VIN through", () => {
    expect(carFormProblem(form({ vin: "" }))).toBeNull();
    expect(carFormProblem(form({ vin: "5TDZARFH8KS123456" }))).toBeNull();
    // I, O and Q are not in the 1981 alphabet.
    expect(carFormProblem(form({ vin: "5TDZARFH8KS12345O" }))).toMatch(/17 characters/i);
    expect(carFormProblem(form({ vin: "TOOSHORT" }))).toMatch(/17 characters/i);
  });

  it("uppercases the VIN on the way out, as the column stores it", () => {
    const built = buildCarPayload(form({ vin: "5tdzarfh8ks123456" }), false);
    expect(built.ok && built.body.vin).toBe("5TDZARFH8KS123456");
  });

  /**
   * `car_listings_eta_after_sailing` is the one 067 invariant `schema.ts` does
   * not mirror, so without this the admin meets a Postgres constraint name.
   */
  it("refuses a ship that reaches Tema before it sails", () => {
    expect(carFormProblem(form({ sailed_on: "2026-03-01", eta_tema: "2026-02-01" }))).toMatch(
      /cannot reach Tema before it sails/i,
    );
    expect(carFormProblem(form({ sailed_on: "2026-03-01", eta_tema: "2026-03-01" }))).toBeNull();
    // Either date alone is fine; the constraint only bites when both are set.
    expect(carFormProblem(form({ eta_tema: "2026-02-01" }))).toBeNull();
  });

  it("blanks the optional fields to null rather than sending empty strings", () => {
    const built = buildCarPayload(form({ trim: "  ", vessel_name: "", body_type: "" }), false);
    expect(built.ok && built.body).toMatchObject({
      trim: null,
      vessel_name: null,
      body_type: null,
      drivetrain: null,
      mileage: null,
    });
  });

  it("carries the publish flag it is given, because a PUT is a full replacement", () => {
    // Hard-coding `false` here would take a live car off the site every time
    // somebody corrected its mileage.
    expect(buildCarPayload(form(), true)).toMatchObject({ body: { is_published: true } });
    expect(buildCarPayload(form(), false)).toMatchObject({ body: { is_published: false } });
  });

  it("refuses to build a body at all while something is wrong", () => {
    const built = buildCarPayload(form({ price_state: CAR_PRICE_STATES.FIXED, price: "" }), false);
    expect(built).toEqual({ ok: false, problem: "A fixed price needs a price." });
  });
});
