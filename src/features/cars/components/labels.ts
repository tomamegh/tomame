import {
  CAR_PRICE_STATES,
  type CarBodyType,
  type CarDrivetrain,
  type CarFuelType,
  type CarPriceState,
  type CarTransmission,
} from "@/config/constants";
import type { CarListingView } from "../types";
import { formatEta, voyageStage } from "../format";

/**
 * The words the car SCREENS need that `src/features/cars/format.ts` does not
 * already own.
 *
 * WHY IT IS A SEPARATE FILE AND NOT MORE OF `format.ts`. Everything in
 * `format.ts` is a decision the product would be wrong without — mileage is
 * never converted, an unpriced listing never prints a number. Everything here
 * is a decision about WORDING on a customer-facing surface: what `plug_in_hybrid`
 * is called in a spec row, and what a card's ribbon says about a ship. Those
 * change when the copy changes and have no bearing on what a listing means, so
 * they sit with the components that print them.
 *
 * Pure and framework-free for the same reason `format.ts` is: the ribbon takes
 * the day as an argument rather than reading a clock, so a card rendered on the
 * server and hydrated in a browser three hours either side of midnight cannot
 * disagree with itself about whether a car has landed.
 *
 * British English, as the rest of the product.
 */

// ── Specification words ─────────────────────────────────────────────────────

/**
 * Every enum value has an entry, and the maps are exhaustive `Record`s rather
 * than lookups with a `??` fallback: adding a fuel type to
 * `src/config/constants.ts` then fails typecheck here instead of shipping a
 * spec row that reads "plug_in_hybrid" to a customer.
 */
const FUEL_LABELS: Record<CarFuelType, string> = {
  petrol: "Petrol",
  diesel: "Diesel",
  hybrid: "Hybrid",
  plug_in_hybrid: "Plug-in hybrid",
  electric: "Electric",
  other: "Other fuel",
};

const TRANSMISSION_LABELS: Record<CarTransmission, string> = {
  automatic: "Automatic",
  manual: "Manual",
  // Said in full on the detail page's spec table and abbreviated nowhere: a
  // customer who does not know the acronym learns nothing from "CVT".
  cvt: "CVT automatic",
  other: "Other gearbox",
};

const DRIVETRAIN_LABELS: Record<CarDrivetrain, string> = {
  fwd: "Front-wheel drive",
  rwd: "Rear-wheel drive",
  awd: "All-wheel drive",
  "4wd": "Four-wheel drive",
};

const BODY_LABELS: Record<CarBodyType, string> = {
  sedan: "Saloon",
  suv: "SUV",
  hatchback: "Hatchback",
  pickup: "Pickup",
  van: "Van",
  coupe: "Coupé",
  wagon: "Estate",
  convertible: "Convertible",
  bus: "Bus",
  truck: "Truck",
  other: "Other body",
};

export function fuelLabel(fuel: CarFuelType): string {
  return FUEL_LABELS[fuel];
}

export function transmissionLabel(transmission: CarTransmission): string {
  return TRANSMISSION_LABELS[transmission];
}

export function drivetrainLabel(drivetrain: CarDrivetrain): string {
  return DRIVETRAIN_LABELS[drivetrain];
}

export function bodyTypeLabel(body: CarBodyType): string {
  return BODY_LABELS[body];
}

/** The short form for a card's spec strip: "Auto", not "Automatic". */
const SHORT_TRANSMISSION: Record<CarTransmission, string> = {
  automatic: "Auto",
  manual: "Manual",
  cvt: "CVT",
  other: "Gearbox n/a",
};

export function shortTransmissionLabel(transmission: CarTransmission): string {
  return SHORT_TRANSMISSION[transmission];
}

// ── The voyage ribbon ───────────────────────────────────────────────────────

/**
 * The tone a ribbon takes. Three, not five, because a ribbon is read at a
 * glance from across a grid: green means it is here, coral means it is nearly
 * here, and neutral means it is a date to note rather than a thing to act on.
 */
export type CarRibbonTone = "green" | "coral" | "neutral";

export interface CarVoyageRibbon {
  text: string;
  tone: CarRibbonTone;
}

/**
 * Where the car is, in the words a customer plans around — or NOTHING.
 *
 * NULL IS A REAL ANSWER AND MUST STAY ONE. `sailed_on` and `eta_tema` are both
 * nullable, and a listing carrying neither is a car we have not been given
 * shipping dates for. Every alternative to returning null here is a claim:
 * "In transit" says it is on a ship, "Arriving soon" says we know when, and a
 * grey "Status unknown" pill is a badge whose only content is our own missing
 * paperwork. So a card with no dates simply has no ribbon on it, and the photo
 * runs clean to the corner.
 *
 * `today` is the caller's ISO day (`YYYY-MM-DD`) — the same contract
 * `voyageStage` sets, and for the same reason: the server and the browser
 * disagree about the date for several hours around midnight, and a helper that
 * read the clock itself would hydrate to different words than it rendered.
 */
export function voyageRibbon(
  listing: Pick<CarListingView, "sailed_on" | "eta_tema">,
  today: string,
): CarVoyageRibbon | null {
  const stage = voyageStage(listing, today);
  const eta = formatEta(listing.eta_tema);

  switch (stage) {
    case "landed":
      // Past its ETA. Said as a fact about the yard rather than about the
      // ship, because that is the thing a buyer can act on today.
      return { text: "Landed in Tema", tone: "green" };
    case "arriving":
      return { text: eta ? `Arriving ${eta}` : "Arriving soon", tone: "coral" };
    case "at_sea":
      return {
        text: eta ? `At sea · Tema ${eta}` : "At sea",
        tone: "neutral",
      };
    case "not_sailed": {
      const sails = formatEta(listing.sailed_on);
      return { text: sails ? `Sails ${sails}` : "Awaiting shipment", tone: "neutral" };
    }
    case "unknown":
    default:
      return null;
  }
}

/** The ribbon's Tailwind skin. Tokens only; the tones are the design's, not new colours. */
export const RIBBON_TONE_CLASS: Record<CarRibbonTone, string> = {
  green: "bg-tm-green-bg text-tm-green-ink",
  coral: "bg-tm-tint text-tm-coral-strong",
  neutral: "bg-tm-pill-bg text-tm-text-2",
};

// ── Price state ─────────────────────────────────────────────────────────────

/**
 * Whether a listing may be bought outright right now.
 *
 * Only a `fixed` or `negotiable` listing carries a figure, and only a figure
 * can be charged. An `on_request` car has no price — the database forbids one
 * existing — so there is nothing for a "Buy now" to put through Paystack, and
 * the button is not drawn rather than drawn and refused.
 *
 * The SERVER decides for real: `/api/cars/checkout` answers 409 when a listing
 * is not purchasable. This only decides what to paint.
 */
export function isBuyable(state: CarPriceState): boolean {
  return state === CAR_PRICE_STATES.FIXED || state === CAR_PRICE_STATES.NEGOTIABLE;
}

// ── Gallery order ───────────────────────────────────────────────────────────

/**
 * The gallery, cover first.
 *
 * `listCarPhotos` sorts by `sort_order` alone, so the photograph an admin
 * MARKED as the cover is not necessarily the one that comes back first. The
 * card and the detail page must open on the same picture — a customer who taps
 * a silver Highlander and lands on a photo of its boot has been shown two
 * different cars — so the cover is lifted to the front here and the rest keep
 * the order the admin arranged.
 *
 * Non-mutating: the input array belongs to the caller (and, on a server render,
 * to a view model that other things read).
 */
export function galleryOrder<T extends { is_cover: boolean }>(
  photos: readonly T[],
): T[] {
  const cover = photos.find((photo) => photo.is_cover);
  if (!cover) return [...photos];
  return [cover, ...photos.filter((photo) => photo !== cover)];
}

// ── The day ─────────────────────────────────────────────────────────────────

/**
 * The calendar day a ribbon is measured against, as `YYYY-MM-DD`.
 *
 * Ghana observes GMT all year and never shifts for daylight saving, so the UTC
 * day IS the customer's day — the same fact `timeOfDayFor` in
 * `home.service.ts` relies on, and the reason there is no timezone library
 * anywhere in this repo.
 *
 * It takes the clock as an ARGUMENT so it stays pure and so one render measures
 * every card against one instant. A grid where the first card decided a car had
 * landed and the fourteenth decided it had not — because the two read
 * `new Date()` either side of midnight — is a bug nobody would ever reproduce.
 */
export function accraDay(now: Date): string {
  return now.toISOString().slice(0, 10);
}
