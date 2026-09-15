import {
  CAR_ENQUIRY_KINDS,
  CAR_PRICE_STATES,
  type CarEnquiryKind,
  type CarMileageUnit,
  type CarOriginCountry,
  type CarPriceState,
} from "@/config/constants";
import type { CarListingView, CarPriceBreakdown } from "./types";

/**
 * Display helpers for the cars feature (migration 067).
 *
 * PURE AND FRAMEWORK-FREE — no React, no clock, no fetch — which is why this is
 * a module and not a handful of expressions inside JSX. Everything here is a
 * decision that has a right answer and can therefore have a test, and three of
 * them are decisions the product would be wrong without:
 *
 *   1. MILEAGE IS NEVER CONVERTED. A Japanese import reads 80,000 km and an
 *      American one reads 80,000 mi, and they are not the same car. The unit
 *      stored with the reading is the unit printed, always. Converting would
 *      produce a number that is on no odometer anywhere and that the customer
 *      cannot check against the vehicle when it lands.
 *
 *   2. AN UNPRICED LISTING NEVER PRINTS A NUMBER. `priceLabel` is total over
 *      the three states rather than a chain of `??`, so the "on request" case
 *      cannot fall through to a stale figure.
 *
 *   3. PESEWAS ARE DIVIDED ONCE, HERE. Money is an integer everywhere else in
 *      the feature; this is the only place it becomes a decimal, at the last
 *      moment before it is shown.
 *
 * British English, as the rest of the product.
 */

const GHS_SYMBOL = "GH₵";

const wholeFormatter = new Intl.NumberFormat("en-GH", { maximumFractionDigits: 0 });
const decimalFormatter = new Intl.NumberFormat("en-GH", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/**
 * Pesewas to a cedi string: 18450000 → "GH₵184,500".
 *
 * Car prices are round to the cedi in practice, and ".00" on a six-figure
 * number is noise — but a figure that genuinely has pesewas keeps them rather
 * than being quietly rounded away, because rounding a price a customer is about
 * to be charged is not a formatting decision.
 */
export function formatPesewas(pesewas: number): string {
  const cedis = pesewas / 100;
  return Number.isInteger(cedis)
    ? `${GHS_SYMBOL}${wholeFormatter.format(cedis)}`
    : `${GHS_SYMBOL}${decimalFormatter.format(cedis)}`;
}

/**
 * The headline price, as a line of text and the shape of the thing it is.
 *
 * Returned as a pair rather than a string so the component can style the three
 * cases differently (a fixed price is bold, "Price on request" is not a price
 * and should not look like one) without re-deriving the state from the words.
 */
export interface CarPriceLabel {
  /** What to print. Never empty. */
  text: string;
  /** Whether `text` is an actual amount, or standing in for the absence of one. */
  isAmount: boolean;
  /** The sentence under it, when the state needs explaining. */
  note: string | null;
}

export function priceLabel(
  listing: Pick<CarListingView, "price_state" | "price_pesewas">,
): CarPriceLabel {
  switch (listing.price_state) {
    case CAR_PRICE_STATES.FIXED:
      return {
        // The invariant `car_listings_price_state_has_price` guarantees the
        // amount is here. The fallback is unreachable through the database and
        // exists only so a hand-built object in a test cannot render "GH₵NaN".
        text: listing.price_pesewas === null ? "Price on request" : formatPesewas(listing.price_pesewas),
        isAmount: listing.price_pesewas !== null,
        // Said plainly because it is the question every customer asks second,
        // and a landed price that turns out to exclude duty is the complaint
        // this whole feature would be remembered for.
        note: "Landed in Tema. Duty and clearing included.",
      };
    case CAR_PRICE_STATES.NEGOTIABLE:
      return {
        text: listing.price_pesewas === null ? "Price on request" : formatPesewas(listing.price_pesewas),
        isAmount: listing.price_pesewas !== null,
        note: "Landed, duty and clearing included. Offers welcome.",
      };
    case CAR_PRICE_STATES.ON_REQUEST:
    default:
      return {
        text: "Price on request",
        isAmount: false,
        note: "Ask us and we will come back with a landed figure.",
      };
  }
}

/** Which conversation a customer may start on a listing in this state. */
export function enquiryKindFor(state: CarPriceState): CarEnquiryKind | null {
  if (state === CAR_PRICE_STATES.ON_REQUEST) return CAR_ENQUIRY_KINDS.PRICE_REQUEST;
  if (state === CAR_PRICE_STATES.NEGOTIABLE) return CAR_ENQUIRY_KINDS.OFFER;
  // A fixed price is not a negotiation. There is nothing to ask.
  return null;
}

/** The words on the button, matching what the enquiry will be. */
export function enquiryCallToAction(state: CarPriceState): string | null {
  const kind = enquiryKindFor(state);
  if (kind === CAR_ENQUIRY_KINDS.PRICE_REQUEST) return "Ask for the price";
  if (kind === CAR_ENQUIRY_KINDS.OFFER) return "Make an offer";
  return null;
}

/**
 * "2019 Toyota Highlander XLE". The name used on cards, in alt text and in the
 * subject line of anything sent about this car.
 */
export function carTitle(
  listing: Pick<CarListingView, "year" | "make" | "model" | "trim">,
): string {
  return [listing.year, listing.make, listing.model, listing.trim?.trim() || null]
    .filter(Boolean)
    .join(" ");
}

/**
 * "82,000 mi" / "82,000 km", and never one converted into the other.
 *
 * Null when the reading is unknown, so the caller omits the field rather than
 * printing "0 mi" on a car whose odometer nobody has read yet — which would be
 * a claim, and a flattering one.
 */
export function formatMileage(
  mileage: number | null,
  unit: CarMileageUnit,
): string | null {
  if (mileage === null || !Number.isFinite(mileage)) return null;
  return `${wholeFormatter.format(Math.round(mileage))} ${unit}`;
}

/** Country codes as people say them. */
const ORIGIN_LABELS: Record<CarOriginCountry, string> = {
  USA: "USA",
  CANADA: "Canada",
  UK: "United Kingdom",
  GERMANY: "Germany",
  JAPAN: "Japan",
  KOREA: "South Korea",
  UAE: "UAE",
  CHINA: "China",
};

export function originLabel(country: CarOriginCountry): string {
  return ORIGIN_LABELS[country] ?? country;
}

/**
 * Where the car is in its crossing, relative to a date the CALLER supplies.
 *
 * `today` is a parameter and not `new Date()` so this stays pure and testable —
 * the same reason `src/features/journeys/format.ts` takes its clock as an
 * argument. Server and browser also disagree about the day for several hours
 * either side of midnight, and a helper that read the clock itself would
 * hydrate to different words than it rendered.
 */
export type CarVoyageStage = "not_sailed" | "at_sea" | "arriving" | "landed" | "unknown";

export function voyageStage(
  listing: Pick<CarListingView, "sailed_on" | "eta_tema">,
  today: string,
): CarVoyageStage {
  const sailed = listing.sailed_on;
  const eta = listing.eta_tema;
  if (!sailed && !eta) return "unknown";
  if (sailed && today < sailed) return "not_sailed";
  if (!eta) return "at_sea";
  if (today > eta) return "landed";
  // Within a fortnight of the ETA the customer should be told to get ready;
  // before that, "arriving 14 March" is the more honest phrasing.
  const days = daysBetween(today, eta);
  return days <= 14 ? "arriving" : "at_sea";
}

/** Whole days from `from` to `to`, both ISO calendar dates. Negative if past. */
export function daysBetween(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.round((b - a) / 86_400_000);
}

/** "Arriving 14 March 2026" — the one date a customer actually plans around. */
export function formatEta(eta: string | null): string | null {
  if (!eta) return null;
  const parsed = new Date(`${eta}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(parsed);
}

/**
 * The "what the price is made of" card, as rows.
 *
 * Built from the breakdown ONLY — never from the total minus the parts we
 * happen to have — so the card can never show a residual line invented to make
 * the arithmetic work. The database refuses a complete breakdown that does not
 * sum to the total, and `toCarListingView` refuses to build an incomplete one,
 * so by the time a value reaches here the three agree.
 */
export interface CarPriceRow {
  label: string;
  pesewas: number;
  /** The last row, which is the total rather than a component. */
  isTotal?: boolean;
}

export function priceBreakdownRows(
  breakdown: CarPriceBreakdown | null,
  totalPesewas: number | null,
): CarPriceRow[] {
  if (!breakdown || totalPesewas === null) return [];
  return [
    { label: "Vehicle", pesewas: breakdown.vehicle_pesewas },
    { label: "Ocean freight and insurance", pesewas: breakdown.freight_insurance_pesewas },
    { label: "Ghana duty and clearing", pesewas: breakdown.duty_clearing_pesewas },
    { label: "Tomame fee", pesewas: breakdown.service_fee_pesewas },
    { label: "Landed in Tema", pesewas: totalPesewas, isTotal: true },
  ];
}

/**
 * A URL-safe slug suggestion from the car's own name: "2019 Toyota Highlander
 * XLE" → "2019-toyota-highlander-xle".
 *
 * A SUGGESTION, not the slug. The admin form prefills with this and the admin
 * may change it; the stored value is never recomputed afterwards, because the
 * link has already been sent to somebody by the time a spelling is corrected.
 */
export function suggestCarSlug(input: {
  year: number;
  make: string;
  model: string;
  trim?: string | null;
}): string {
  return [input.year, input.make, input.model, input.trim ?? ""]
    .join(" ")
    .toLowerCase()
    .normalize("NFKD")
    // Strip accents before the alphanumeric filter, so "Citroën" becomes
    // "citroen" rather than "citro-n".
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120)
    .replace(/-+$/g, "");
}
