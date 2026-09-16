import {
  CAR_BODY_TYPES,
  CAR_DRIVETRAINS,
  CAR_FUEL_TYPES,
  CAR_MILEAGE_UNITS,
  CAR_ORIGIN_COUNTRIES,
  CAR_PRICE_STATES,
  CAR_TRANSMISSIONS,
  type CarPriceState,
} from "@/config/constants";
import { originLabel } from "@/features/cars/format";
import type { CarListingView } from "@/features/cars/types";

/**
 * The car form's rules, with no React in them (migration 067).
 *
 * WHY THIS IS A MODULE AND NOT A HANDFUL OF EXPRESSIONS IN THE FORM. Everything
 * here has a right answer, so everything here can have a test, and two of them
 * are answers the product would be wrong without:
 *
 *   1. THE THREE PRICE STATES ARE MADE UNREACHABLE IN THEIR ILLEGAL
 *      COMBINATIONS, here, before a request is built. `car_listings_price_state_
 *      has_price` refuses "on request, but priced" and "fixed, with no price"
 *      from the database's side, and `features/cars/schema.ts` refuses them with
 *      a sentence — but an admin who has just typed a listing should never meet
 *      either. `buildCarPayload` derives the five money columns FROM the chosen
 *      state rather than from whatever the fields happen to hold, so an
 *      on-request listing cannot carry a price even if a value is sitting in a
 *      hidden input, and `carFormProblem` refuses to let the form be submitted
 *      at all while a fixed price has no figure.
 *
 *   2. CEDIS BECOME PESEWAS WITHOUT FLOATING POINT. Money is an INTEGER number
 *      of pesewas in the database (CLAUDE.md, and `car_listings.price_pesewas`
 *      is INTEGER). The admin types cedis, because nobody quotes a car in
 *      pesewas, and `parseCedis` converts by splitting the string on its decimal
 *      point and padding — never `Math.round(Number(value) * 100)`, which loses
 *      or gains a pesewa on values a form will genuinely see. A pesewa astray
 *      here is a breakdown that does not sum to its total, which is a 422 the
 *      admin cannot explain.
 *
 * `car_listings_eta_after_sailing` is checked here too. It is the one 067
 * invariant that `features/cars/schema.ts` does NOT mirror, so without this the
 * only thing between a mistyped date and a Postgres constraint name is a 422
 * reading "that listing is not a valid combination".
 *
 * British English, as the rest of the product.
 */

// ── Values ──────────────────────────────────────────────────────────────────

/**
 * The form, as strings.
 *
 * EVERY FIELD IS A STRING, including the numbers and the money. A form holds
 * what was typed, not what it means: `year` is "" while the admin is halfway
 * through deleting it, and a `number | null` state would have to decide what
 * that is before the admin has finished. The conversion happens once, in
 * `buildCarPayload`, at the moment a request is made.
 */
export interface CarFormValues {
  slug: string;
  make: string;
  model: string;
  trim: string;
  year: string;
  mileage: string;
  mileage_unit: string;
  body_type: string;
  fuel: string;
  transmission: string;
  drivetrain: string;
  exterior_colour: string;
  vin: string;
  origin_country: string;
  vessel_name: string;
  sailed_on: string;
  eta_tema: string;
  description: string;
  price_state: string;
  /** The headline price, in cedis as typed. */
  price: string;
  /** The four components of it, in cedis as typed. */
  vehicle_price: string;
  freight_insurance: string;
  duty_clearing: string;
  service_fee: string;
  sort_order: string;
}

/** A blank listing: a petrol automatic from the USA, priced on request. */
export function emptyCarForm(): CarFormValues {
  return {
    slug: "",
    make: "",
    model: "",
    trim: "",
    year: "",
    mileage: "",
    mileage_unit: CAR_MILEAGE_UNITS.MI,
    body_type: "",
    fuel: CAR_FUEL_TYPES.PETROL,
    transmission: CAR_TRANSMISSIONS.AUTOMATIC,
    drivetrain: "",
    exterior_colour: "",
    vin: "",
    origin_country: CAR_ORIGIN_COUNTRIES.USA,
    vessel_name: "",
    sailed_on: "",
    eta_tema: "",
    description: "",
    // The safest of the three to default to: a listing that says nothing about
    // money cannot say the wrong thing about it.
    price_state: CAR_PRICE_STATES.ON_REQUEST,
    price: "",
    vehicle_price: "",
    freight_insurance: "",
    duty_clearing: "",
    service_fee: "",
    sort_order: "0",
  };
}

/** A saved listing, back into the fields it was typed in. */
export function carFormFromListing(car: CarListingView): CarFormValues {
  return {
    slug: car.slug,
    make: car.make,
    model: car.model,
    trim: car.trim ?? "",
    year: String(car.year),
    mileage: car.mileage === null ? "" : String(car.mileage),
    mileage_unit: car.mileage_unit,
    body_type: car.body_type ?? "",
    fuel: car.fuel,
    transmission: car.transmission,
    drivetrain: car.drivetrain ?? "",
    exterior_colour: car.exterior_colour ?? "",
    vin: car.vin ?? "",
    origin_country: car.origin_country,
    vessel_name: car.vessel_name ?? "",
    sailed_on: car.sailed_on ?? "",
    eta_tema: car.eta_tema ?? "",
    description: car.description,
    price_state: car.price_state,
    price: cedisFromPesewas(car.price_pesewas),
    vehicle_price: cedisFromPesewas(car.breakdown?.vehicle_pesewas ?? null),
    freight_insurance: cedisFromPesewas(car.breakdown?.freight_insurance_pesewas ?? null),
    duty_clearing: cedisFromPesewas(car.breakdown?.duty_clearing_pesewas ?? null),
    service_fee: cedisFromPesewas(car.breakdown?.service_fee_pesewas ?? null),
    sort_order: String(car.sort_order),
  };
}

// ── Money ───────────────────────────────────────────────────────────────────

export type MoneyParse =
  /** `pesewas` is null when the field was left blank, which is a legal answer. */
  | { ok: true; pesewas: number | null }
  | { ok: false; problem: string };

/** The schema's ceiling, restated so the form refuses before the request does. */
const MAX_PESEWAS = 2_000_000_000;

/**
 * "184,500" / "GH₵184,500.25" / "" → pesewas, exactly.
 *
 * NO FLOATING POINT ANYWHERE IN HERE. `Math.round(Number("816.55") * 100)` is a
 * coin toss on the second decimal because 816.55 is not representable in binary
 * — and a car listing whose breakdown is one pesewa off its total is refused by
 * `car_listings_breakdown_sums_to_total` with a message about a constraint. So
 * the string is split on its decimal point and the halves are combined as
 * integers, which is exact for every input a form can produce.
 *
 * Three decimals are REFUSED rather than rounded. Rounding a price an admin is
 * about to advertise is not a formatting decision, and a silent one would be
 * invisible until a customer asked why the figure moved.
 */
export function parseCedis(raw: string): MoneyParse {
  // Thousands separators and a pasted currency symbol are what an admin copying
  // a figure out of a spreadsheet actually types.
  const cleaned = raw.replace(/[\s,]/g, "").replace(/^GH₵|^GHS/i, "");
  if (cleaned.length === 0) return { ok: true, pesewas: null };

  if (!/^\d+(\.\d+)?$/.test(cleaned)) {
    return { ok: false, problem: "Use digits, like 184500 or 184500.50." };
  }

  const [whole, fraction = ""] = cleaned.split(".");
  if (fraction.length > 2) {
    return {
      ok: false,
      problem: "Cedis go to two decimal places. A third would have to be rounded away.",
    };
  }

  const pesewas = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(pesewas)) {
    return { ok: false, problem: "That amount is larger than any car we ship." };
  }
  if (pesewas > MAX_PESEWAS) {
    return { ok: false, problem: "That amount is larger than any car we ship." };
  }
  return { ok: true, pesewas };
}

/**
 * Pesewas back into the string the admin would have typed.
 *
 * The inverse of `parseCedis` for every value it can produce, which is what
 * makes an edit that touches nothing save the same figures it loaded. Whole
 * cedis lose the ".00" — car prices are round in practice and two zeroes on a
 * six-figure number is noise — but a figure that genuinely carries pesewas keeps
 * them, because the round trip is the point.
 */
export function cedisFromPesewas(pesewas: number | null): string {
  if (pesewas === null) return "";
  const whole = Math.trunc(pesewas / 100);
  const remainder = Math.abs(pesewas % 100);
  return remainder === 0 ? String(whole) : `${whole}.${String(remainder).padStart(2, "0")}`;
}

// ── The breakdown ───────────────────────────────────────────────────────────

/**
 * What the four components currently say, against the headline price.
 *
 * ALL FOUR OR NONE, which is `refineBreakdown`'s rule and the reason
 * `toCarListingView` refuses to build a partial one: "freight GH₵18,000, duty
 * unknown" beside a total reads as though the missing lines are zero.
 */
export type BreakdownState =
  | { kind: "empty" }
  | { kind: "unreadable"; problem: string }
  /** Some but not all four filled in. */
  | { kind: "partial"; filled: number }
  /** All four filled in. `difference` is sum − total, so positive means over. */
  | { kind: "complete"; sum: number; total: number | null; difference: number | null };

export function describeBreakdown(values: CarFormValues): BreakdownState {
  const raw = [
    values.vehicle_price,
    values.freight_insurance,
    values.duty_clearing,
    values.service_fee,
  ];

  const parsed: (number | null)[] = [];
  for (const entry of raw) {
    const result = parseCedis(entry);
    if (!result.ok) return { kind: "unreadable", problem: result.problem };
    parsed.push(result.pesewas);
  }

  const filled = parsed.filter((part) => part !== null) as number[];
  if (filled.length === 0) return { kind: "empty" };
  if (filled.length < parsed.length) return { kind: "partial", filled: filled.length };

  const sum = filled.reduce((a, b) => a + b, 0);
  const total = parseCedis(values.price);
  const totalPesewas = total.ok ? total.pesewas : null;

  return {
    kind: "complete",
    sum,
    total: totalPesewas,
    difference: totalPesewas === null ? null : sum - totalPesewas,
  };
}

// ── What is stopping the save ───────────────────────────────────────────────

const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const VIN_PATTERN = /^[A-HJ-NPR-Z0-9]{17}$/;

/**
 * The ONE sentence standing between this form and a save, or null.
 *
 * One rather than a list on purpose: an admin fixes the thing the button is
 * complaining about, and a wall of red beside eleven fields is how the real
 * problem gets missed. The order below is the order an admin would meet them.
 *
 * Every rule here is also enforced by the schema or by a CHECK — this is the
 * layer that stops the round trip, never the layer that guarantees the outcome.
 */
export function carFormProblem(values: CarFormValues): string | null {
  if (values.make.trim().length === 0) return "Which make?";
  if (values.model.trim().length === 0) return "Which model?";

  const year = Number(values.year);
  if (!Number.isInteger(year) || year < 1950 || year > 2100) {
    return "Give a model year between 1950 and 2100.";
  }

  const slug = values.slug.trim();
  if (slug.length < 3) return "The link needs at least three characters.";
  if (slug.length > 120) return "That link is too long.";
  if (!SLUG_PATTERN.test(slug)) return "The link takes lowercase letters, numbers and hyphens.";

  if (values.mileage.trim().length > 0) {
    const mileage = Number(values.mileage);
    if (!Number.isInteger(mileage) || mileage < 0 || mileage > 2_000_000) {
      return "The odometer reading should be a whole number of miles or kilometres.";
    }
  }

  const vin = values.vin.trim().toUpperCase();
  if (vin.length > 0 && !VIN_PATTERN.test(vin)) {
    return "A VIN is 17 characters and never contains I, O or Q.";
  }

  // The one 067 invariant the zod layer does not mirror
  // (`car_listings_eta_after_sailing`). Without this the admin meets it as a
  // 422 naming a constraint.
  if (values.sailed_on && values.eta_tema && values.eta_tema < values.sailed_on) {
    return "The ship cannot reach Tema before it sails.";
  }

  const priceProblem = priceStateProblem(values);
  if (priceProblem) return priceProblem;

  const sortOrder = Number(values.sort_order);
  if (!Number.isInteger(sortOrder) || sortOrder < 0 || sortOrder > 100_000) {
    return "The sort order is a whole number from 0 upwards.";
  }

  return null;
}

/**
 * The price half of it, separately, because the price control shows its own
 * message under the money fields rather than only on the button.
 */
export function priceStateProblem(values: CarFormValues): string | null {
  const price = parseCedis(values.price);
  if (!price.ok) return price.problem;

  if (values.price_state === CAR_PRICE_STATES.ON_REQUEST) {
    // Not reachable through the form — choosing "on request" clears the money
    // fields and hides them, and `buildCarPayload` sends nulls regardless. It is
    // here so that a future caller that sets the values directly is refused
    // rather than meeting `car_listings_price_state_has_price` as a 422.
    if (price.pesewas !== null) {
      return "A price-on-request listing carries no price. Clear the amount or choose another state.";
    }
    return null;
  }

  if (price.pesewas === null) {
    return values.price_state === CAR_PRICE_STATES.FIXED
      ? "A fixed price needs a price."
      : "A negotiable listing needs an asking price for an offer to be made against.";
  }

  const breakdown = describeBreakdown(values);
  if (breakdown.kind === "unreadable") return breakdown.problem;
  if (breakdown.kind === "partial") {
    return "Give all four parts of the breakdown or none of them. A partial breakdown reads as though the missing lines are zero.";
  }
  if (breakdown.kind === "complete" && breakdown.difference !== null && breakdown.difference !== 0) {
    const over = breakdown.difference > 0;
    return `The four parts come to ${cedis(breakdown.sum)}, which is ${cedis(Math.abs(breakdown.difference))} ${over ? "more" : "less"} than the price above.`;
  }

  return null;
}

/** A plain "GH₵184,500" for a message. Display only; never a stored figure. */
function cedis(pesewas: number): string {
  const value = pesewas / 100;
  return `GH₵${value.toLocaleString("en-GH", {
    minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}

// ── The request ─────────────────────────────────────────────────────────────

/** Exactly the body `POST /api/admin/cars` and `PUT /api/admin/cars/[id]` take. */
export interface CarListingPayload {
  slug: string;
  make: string;
  model: string;
  trim: string | null;
  year: number;
  mileage: number | null;
  mileage_unit: string;
  body_type: string | null;
  fuel: string;
  transmission: string;
  drivetrain: string | null;
  exterior_colour: string | null;
  vin: string | null;
  origin_country: string;
  vessel_name: string | null;
  sailed_on: string | null;
  eta_tema: string | null;
  description: string;
  price_state: CarPriceState;
  price_pesewas: number | null;
  vehicle_price_pesewas: number | null;
  freight_insurance_pesewas: number | null;
  duty_clearing_pesewas: number | null;
  service_fee_pesewas: number | null;
  is_published: boolean;
  sort_order: number;
}

/**
 * The form as a request body, or the reason there isn't one.
 *
 * THE MONEY IS DERIVED FROM THE STATE, not copied out of the fields. An
 * on-request listing sends five nulls no matter what the inputs hold, which is
 * what makes the illegal combination unreachable rather than merely discouraged
 * — the form could be left with a stale figure in a hidden input and this would
 * still be right.
 *
 * `is_published` IS AN ARGUMENT AND IS ALWAYS SENT. `updateCarListingSchema` is
 * a full replacement rather than a patch, so a PUT that omitted the flag would
 * be rejected, and one that hard-coded `false` would silently take a live car
 * off the site every time somebody corrected its mileage. The edit screen passes
 * the listing's CURRENT value; publishing is the separate PATCH verb.
 */
export function buildCarPayload(
  values: CarFormValues,
  isPublished: boolean,
): { ok: true; body: CarListingPayload } | { ok: false; problem: string } {
  const problem = carFormProblem(values);
  if (problem) return { ok: false, problem };

  const state = values.price_state as CarPriceState;
  const onRequest = state === CAR_PRICE_STATES.ON_REQUEST;

  const price = parseCedis(values.price);
  const parts = [
    parseCedis(values.vehicle_price),
    parseCedis(values.freight_insurance),
    parseCedis(values.duty_clearing),
    parseCedis(values.service_fee),
  ];
  // `carFormProblem` has already refused anything unreadable; this narrows the
  // union rather than re-deciding it.
  if (!price.ok || parts.some((part) => !part.ok)) {
    return { ok: false, problem: "That amount could not be read." };
  }
  const amounts: (number | null)[] = parts.map((part) => (part.ok ? part.pesewas : null));
  const [vehicle = null, freight = null, duty = null, fee = null] = amounts;

  return {
    ok: true,
    body: {
      slug: values.slug.trim(),
      make: values.make.trim(),
      model: values.model.trim(),
      trim: blankToNull(values.trim),
      year: Number(values.year),
      mileage: values.mileage.trim().length === 0 ? null : Number(values.mileage),
      mileage_unit: values.mileage_unit,
      body_type: blankToNull(values.body_type),
      fuel: values.fuel,
      transmission: values.transmission,
      drivetrain: blankToNull(values.drivetrain),
      exterior_colour: blankToNull(values.exterior_colour),
      // Uppercased here as well as in the schema: an admin who typed a
      // lowercase VIN should see the stored form come back, not their own.
      vin: blankToNull(values.vin.toUpperCase()),
      origin_country: values.origin_country,
      vessel_name: blankToNull(values.vessel_name),
      sailed_on: blankToNull(values.sailed_on),
      eta_tema: blankToNull(values.eta_tema),
      description: values.description.trim(),
      price_state: state,
      price_pesewas: onRequest ? null : price.pesewas,
      vehicle_price_pesewas: onRequest ? null : vehicle,
      freight_insurance_pesewas: onRequest ? null : freight,
      duty_clearing_pesewas: onRequest ? null : duty,
      service_fee_pesewas: onRequest ? null : fee,
      is_published: isPublished,
      sort_order: Number(values.sort_order),
    },
  };
}

function blankToNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

/**
 * Choosing a price state, with the money that state cannot carry cleared out.
 *
 * CLEARED RATHER THAN HIDDEN. Hiding the fields would leave the illegal pair in
 * form state, and the first thing anyone would do on the next screen is
 * reintroduce it by reading them. An admin who switches to "price on request"
 * and back has to retype the figure, which is the honest cost of having said the
 * car has no price.
 */
export function withPriceState(values: CarFormValues, state: CarPriceState): CarFormValues {
  if (state !== CAR_PRICE_STATES.ON_REQUEST) return { ...values, price_state: state };
  return {
    ...values,
    price_state: state,
    price: "",
    vehicle_price: "",
    freight_insurance: "",
    duty_clearing: "",
    service_fee: "",
  };
}

// ── Choices ─────────────────────────────────────────────────────────────────

export interface Choice {
  value: string;
  label: string;
}

/** The three states, in the order an admin decides between them. */
export const PRICE_STATE_CHOICES: readonly {
  value: CarPriceState;
  label: string;
  blurb: string;
}[] = [
  {
    value: CAR_PRICE_STATES.FIXED,
    label: "Fixed price",
    blurb:
      "One landed figure, printed on the car's page. There is nothing to negotiate, so no enquiry can be raised against it.",
  },
  {
    value: CAR_PRICE_STATES.NEGOTIABLE,
    label: "Open to offers",
    blurb:
      "An asking price, printed, with an offer button under it. Offers arrive in the enquiry queue.",
  },
  {
    value: CAR_PRICE_STATES.ON_REQUEST,
    label: "Price on request",
    blurb:
      "No figure anywhere on the page. The customer asks, and the request arrives in the enquiry queue for you to answer.",
  },
];

export const BODY_TYPE_CHOICES: readonly Choice[] = humanise(CAR_BODY_TYPES, {
  suv: "SUV",
});

export const FUEL_CHOICES: readonly Choice[] = humanise(CAR_FUEL_TYPES, {
  plug_in_hybrid: "Plug-in hybrid",
});

export const TRANSMISSION_CHOICES: readonly Choice[] = humanise(CAR_TRANSMISSIONS, {
  cvt: "CVT",
});

export const DRIVETRAIN_CHOICES: readonly Choice[] = humanise(CAR_DRIVETRAINS, {
  fwd: "Front-wheel drive",
  rwd: "Rear-wheel drive",
  awd: "All-wheel drive",
  "4wd": "Four-wheel drive",
});

export const ORIGIN_CHOICES: readonly Choice[] = Object.values(CAR_ORIGIN_COUNTRIES).map(
  (value) => ({ value, label: originLabel(value) }),
);

export const MILEAGE_UNIT_CHOICES: readonly Choice[] = [
  { value: CAR_MILEAGE_UNITS.MI, label: "miles" },
  { value: CAR_MILEAGE_UNITS.KM, label: "km" },
];

/**
 * Slugs as words: "plug_in_hybrid" → "Plug in hybrid", unless the caller knows
 * better. The overrides exist because an acronym and a hyphen are the two things
 * a generic humaniser always gets wrong, and "Suv" on a select is the kind of
 * detail that makes an admin screen feel unfinished.
 */
function humanise(
  source: Record<string, string>,
  overrides: Record<string, string> = {},
): Choice[] {
  return Object.values(source).map((value) => ({
    value,
    label: overrides[value] ?? value.charAt(0).toUpperCase() + value.slice(1).replace(/_/g, " "),
  }));
}
