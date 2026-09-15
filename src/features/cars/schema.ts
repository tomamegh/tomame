import * as z from "zod";

import {
  CAR_BODY_TYPES,
  CAR_DRIVETRAINS,
  CAR_ENQUIRY_KINDS,
  CAR_FUEL_TYPES,
  CAR_MILEAGE_UNITS,
  CAR_ORIGIN_COUNTRIES,
  CAR_PRICE_STATES,
  CAR_TRANSMISSIONS,
} from "@/config/constants";

/**
 * What a request may say about a car (migration 067).
 *
 * `src/lib/validators/` does not exist in this repo; a feature's zod schemas
 * live beside the feature, as `features/watches/schema.ts` and
 * `features/sourcing/schema.ts` do.
 *
 * THE RULE THIS FILE EXISTS TO ENFORCE is the three price states. The database
 * has the same invariant (`car_listings_price_state_has_price`) and it is the
 * one that actually guarantees it — but a constraint violation surfaces as a
 * 500 with a Postgres string in it, and an admin who has just typed a listing
 * deserves to be told "a fixed price needs a price" in a sentence. Both, then:
 * the database for the guarantee, this for the message.
 *
 * MONEY ARRIVES IN PESEWAS, as integers. Not cedis, not a decimal string. A
 * schema that accepted "185000.50" would have to round it, and the rounding
 * would live in a validator rather than anywhere anyone would look for it.
 * CLAUDE.md: payment amounts are in pesewas.
 */

// ── Shared field builders ───────────────────────────────────────────────────

const enumOf = <T extends Record<string, string>>(source: T) =>
  z.enum(Object.values(source) as [string, ...string[]]);

/**
 * A price in pesewas.
 *
 * `.int()` rather than a rounding coercion: a non-integer here means the caller
 * sent cedis by mistake, and silently multiplying or truncating would put a
 * wrong five-figure number on a public page. The ceiling is GH₵20,000,000,
 * below the INT4 limit the column is declared with, so a fat-fingered extra
 * zero is a 400 and not a Postgres overflow.
 */
const pesewas = z
  .number()
  .int("Amounts must be whole pesewas (GHS x 100)")
  .positive("An amount must be more than zero")
  .max(2_000_000_000, "That amount is larger than any car we ship");

/** The same, but a component of a total, which may legitimately be zero. */
const componentPesewas = z
  .number()
  .int("Amounts must be whole pesewas (GHS x 100)")
  .min(0)
  .max(2_000_000_000, "That amount is larger than any car we ship");

/**
 * The URL segment. Mirrors the column's CHECK exactly — lowercase, digits and
 * single hyphens — because a slug that passes here and fails there is a 500 on
 * a form an admin has just spent ten minutes filling in.
 */
const slug = z
  .string()
  .trim()
  .min(3, "A link needs at least three characters")
  .max(120, "That link is too long")
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Use lowercase letters, numbers and hyphens");

/**
 * The 1981 VIN alphabet: 17 characters, no I, O or Q (they are
 * indistinguishable from 1 and 0 on a stamped plate). Uppercased before the
 * check, because nobody types a VIN in capitals off an auction sheet.
 */
const vin = z
  .string()
  .trim()
  .transform((value) => value.toUpperCase())
  .refine(
    (value) => /^[A-HJ-NPR-Z0-9]{17}$/.test(value),
    "A VIN is 17 characters and never contains I, O or Q",
  );

/** ISO calendar date, the shape a `<input type="date">` sends. */
const isoDate = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date like 2026-03-01");

// ── Listings ────────────────────────────────────────────────────────────────

const listingFields = {
  slug,
  make: z.string().trim().min(1, "Which make?").max(80),
  model: z.string().trim().min(1, "Which model?").max(80),
  trim: z.string().trim().max(80).nullish(),
  // The same window the column CHECKs. Open at the top because dealers list
  // model years ahead of the calendar.
  year: z.number().int().min(1950, "That year is too early").max(2100),
  mileage: z.number().int().min(0).max(2_000_000).nullish(),
  mileage_unit: enumOf(CAR_MILEAGE_UNITS).default(CAR_MILEAGE_UNITS.MI),
  body_type: enumOf(CAR_BODY_TYPES).nullish(),
  fuel: enumOf(CAR_FUEL_TYPES).default(CAR_FUEL_TYPES.PETROL),
  transmission: enumOf(CAR_TRANSMISSIONS).default(CAR_TRANSMISSIONS.AUTOMATIC),
  drivetrain: enumOf(CAR_DRIVETRAINS).nullish(),
  exterior_colour: z.string().trim().max(60).nullish(),
  vin: vin.nullish(),
  origin_country: enumOf(CAR_ORIGIN_COUNTRIES),
  vessel_name: z.string().trim().max(120).nullish(),
  sailed_on: isoDate.nullish(),
  eta_tema: isoDate.nullish(),
  description: z.string().trim().max(20_000).default(""),
  price_state: enumOf(CAR_PRICE_STATES).default(CAR_PRICE_STATES.ON_REQUEST),
  price_pesewas: pesewas.nullish(),
  vehicle_price_pesewas: componentPesewas.nullish(),
  freight_insurance_pesewas: componentPesewas.nullish(),
  duty_clearing_pesewas: componentPesewas.nullish(),
  service_fee_pesewas: componentPesewas.nullish(),
  is_published: z.boolean().default(false),
  sort_order: z.number().int().min(0).max(100_000).default(0),
};

/**
 * The three-state rule, as a refinement both create and update share.
 *
 * Applied to the WHOLE object rather than to `price_pesewas` alone because the
 * rule is about the pair: neither field is wrong on its own.
 */
type PriceShape = {
  price_state?: string;
  price_pesewas?: number | null;
};

function refinePriceState(value: PriceShape, ctx: z.RefinementCtx): void {
  const state = value.price_state ?? CAR_PRICE_STATES.ON_REQUEST;
  const price = value.price_pesewas ?? null;

  if (state === CAR_PRICE_STATES.ON_REQUEST && price !== null) {
    ctx.addIssue({
      code: "custom",
      path: ["price_pesewas"],
      message:
        "A price-on-request listing must not carry a price. Choose a fixed or negotiable price, or clear the amount.",
    });
    return;
  }
  if (state !== CAR_PRICE_STATES.ON_REQUEST && price === null) {
    ctx.addIssue({
      code: "custom",
      path: ["price_pesewas"],
      message:
        state === CAR_PRICE_STATES.FIXED
          ? "A fixed price needs a price."
          : "A negotiable listing needs an asking price for an offer to be made against.",
    });
  }
}

/**
 * And the breakdown, which may be absent or complete but never disagree.
 *
 * The database CHECK says the same thing; this one exists so the admin hears
 * "the four parts add up to GH₵184,500, not GH₵185,000" instead of a constraint
 * name. The comparison is on integers, so there is no rounding slack to allow
 * for — that is the reason the whole feature stores pesewas rather than cedis.
 */
function refineBreakdown(
  value: {
    price_pesewas?: number | null;
    vehicle_price_pesewas?: number | null;
    freight_insurance_pesewas?: number | null;
    duty_clearing_pesewas?: number | null;
    service_fee_pesewas?: number | null;
  },
  ctx: z.RefinementCtx,
): void {
  const parts = [
    value.vehicle_price_pesewas,
    value.freight_insurance_pesewas,
    value.duty_clearing_pesewas,
    value.service_fee_pesewas,
  ];
  const present = parts.filter((part) => part !== null && part !== undefined) as number[];
  if (present.length === 0) return;

  if (present.length < parts.length) {
    ctx.addIssue({
      code: "custom",
      path: ["vehicle_price_pesewas"],
      message:
        "Give all four parts of the breakdown or none of them. A partial breakdown reads as though the missing lines are zero.",
    });
    return;
  }

  const total = value.price_pesewas ?? null;
  if (total === null) {
    ctx.addIssue({
      code: "custom",
      path: ["price_pesewas"],
      message: "A breakdown needs a total to break down.",
    });
    return;
  }
  const sum = present.reduce((a, b) => a + b, 0);
  if (sum !== total) {
    ctx.addIssue({
      code: "custom",
      path: ["price_pesewas"],
      message: `The four parts add up to ${sum} pesewas, but the total says ${total}.`,
    });
  }
}

export const createCarListingSchema = z
  .object(listingFields)
  .superRefine((value, ctx) => {
    refinePriceState(value, ctx);
    refineBreakdown(value, ctx);
  });

export type CreateCarListingInput = z.infer<typeof createCarListingSchema>;

/**
 * An update is a full replacement of the editable half, not a patch.
 *
 * A partial patch cannot be validated against the price rule: "set price_state
 * to on_request" is legal or illegal depending on a `price_pesewas` that is not
 * in the request. The admin form holds the whole listing anyway, so it sends the
 * whole listing and every save is checkable on its own.
 */
export const updateCarListingSchema = z
  .object(listingFields)
  .superRefine((value, ctx) => {
    refinePriceState(value, ctx);
    refineBreakdown(value, ctx);
  });

export type UpdateCarListingInput = z.infer<typeof updateCarListingSchema>;

/** The admin list's filters. Everything optional; no filter means everything. */
export const adminCarListQuerySchema = z.object({
  /** Tri-state on purpose: drafts only, published only, or both. */
  published: z.enum(["true", "false"]).optional(),
  search: z.string().trim().max(120).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).max(100_000).default(0),
});

export type AdminCarListQuery = z.infer<typeof adminCarListQuerySchema>;

export const carIdSchema = z.uuid("Unknown car");

// ── Photos ──────────────────────────────────────────────────────────────────

/**
 * The metadata beside an upload. The FILE itself is never described here — its
 * type, size and dimensions are measured by sharp after the re-encode
 * (`features/media/services/image-upload.ts`) and nothing the browser claims
 * about it is believed.
 */
export const carPhotoUploadSchema = z.object({
  alt_text: z.string().trim().max(300).optional(),
  /** First upload on an empty listing becomes the cover unless told otherwise. */
  is_cover: z.boolean().optional(),
});

export type CarPhotoUploadInput = z.infer<typeof carPhotoUploadSchema>;

/**
 * A reorder is the whole gallery in its new order, not a pair of ids to swap.
 *
 * Sending the full list makes the operation idempotent and makes a dropped
 * request harmless: replaying it produces the same arrangement. A swap replayed
 * twice undoes itself.
 */
export const reorderCarPhotosSchema = z.object({
  photo_ids: z
    .array(z.uuid())
    .min(1, "Send the photos in the order you want them")
    .max(60, "That is more photos than any listing has"),
  cover_photo_id: z.uuid().nullish(),
});

export type ReorderCarPhotosInput = z.infer<typeof reorderCarPhotosSchema>;

// ── Enquiries ───────────────────────────────────────────────────────────────

/**
 * A customer asking about a car.
 *
 * The listing id is a path segment and the user comes from the session, so
 * neither is here: CLAUDE.md, never trust a client-provided user_id. The kind
 * is checked against the LISTING's price state in the service, which a schema
 * cannot do because that fact is on another row.
 */
export const createCarEnquirySchema = z
  .object({
    kind: enumOf(CAR_ENQUIRY_KINDS),
    offer_pesewas: pesewas.nullish(),
    message: z.string().trim().max(2_000).nullish(),
  })
  .superRefine((value, ctx) => {
    const amount = value.offer_pesewas ?? null;
    if (value.kind === CAR_ENQUIRY_KINDS.OFFER && amount === null) {
      ctx.addIssue({
        code: "custom",
        path: ["offer_pesewas"],
        message: "How much are you offering?",
      });
    }
    if (value.kind === CAR_ENQUIRY_KINDS.PRICE_REQUEST && amount !== null) {
      ctx.addIssue({
        code: "custom",
        path: ["offer_pesewas"],
        // Not merely tidiness: an amount on a price request renders in the admin
        // queue as a bid on a car with no advertised price, and gets answered as
        // though it were one.
        message: "A price request does not carry an amount. Make an offer instead.",
      });
    }
  });

export type CreateCarEnquiryInput = z.infer<typeof createCarEnquirySchema>;

/**
 * The admin's answer. `status` is the transition being asked for, and the
 * service validates it against the row's current state — a schema can only say
 * the word is spelled correctly.
 *
 * `open` is absent deliberately: reopening a settled negotiation is not an
 * action this queue offers, and a customer can always make a fresh offer.
 */
export const answerCarEnquirySchema = z
  .object({
    status: z.enum(["answered", "accepted", "declined"]),
    admin_response: z.string().trim().max(2_000).nullish(),
    quoted_pesewas: pesewas.nullish(),
  })
  .superRefine((value, ctx) => {
    const hasWords = (value.admin_response ?? "").length > 0;
    const hasFigure = value.quoted_pesewas != null;
    if (value.status === "answered" && !hasWords && !hasFigure) {
      ctx.addIssue({
        code: "custom",
        path: ["admin_response"],
        // "Answered" with nothing attached is a row that leaves the queue while
        // the customer is still waiting, and nobody ever looks at it again.
        message: "An answer needs a price or a reply.",
      });
    }
    if (value.status === "declined" && !hasWords) {
      ctx.addIssue({
        code: "custom",
        path: ["admin_response"],
        message: "Say why it was declined. The customer sees this.",
      });
    }
  });

export type AnswerCarEnquiryInput = z.infer<typeof answerCarEnquirySchema>;

export const adminCarEnquiryQuerySchema = z.object({
  status: z.enum(["open", "answered", "accepted", "declined", "withdrawn"]).optional(),
  car_listing_id: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).max(100_000).default(0),
});

export type AdminCarEnquiryQuery = z.infer<typeof adminCarEnquiryQuerySchema>;
