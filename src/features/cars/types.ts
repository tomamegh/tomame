import type {
  CarBodyType,
  CarDrivetrain,
  CarEnquiryKind,
  CarEnquiryStatus,
  CarFuelType,
  CarMileageUnit,
  CarOriginCountry,
  CarPriceState,
  CarTransmission,
} from "@/config/constants";

/**
 * The shapes of the cars feature (migration 067).
 *
 * TWO LAYERS, ON PURPOSE. A `*Row` is the database row in snake_case, exactly as
 * `db/queries/cars.ts` hands it back. A `*View` is what a screen is allowed to
 * see, and the mapper between them is the only place the difference is decided.
 *
 * That split is not tidiness here, it is the security boundary for two columns:
 *
 *   1. `car_photos.storage_path` — the object key. It never leaves the server.
 *      A browser gets `/api/cars/photos/<id>` and nothing else, so nobody can
 *      reconstruct a storage URL, and swapping buckets later touches one file.
 *   2. The price BREAKDOWN of an unpublished listing. A draft is admin-only by
 *      RLS anyway, but the view is what a public route returns, and a route that
 *      accidentally passes a row straight through should not be able to leak a
 *      cost structure.
 *
 * Money is in PESEWAS (GHS x 100) everywhere in this file, as integers, matching
 * `payments.amount` (005). No component of it comes from
 * `src/lib/pricing/calculator.ts` — see migration 067.
 */

// ── Listings ────────────────────────────────────────────────────────────────

/** A `car_listings` row, verbatim. */
export interface CarListingRow {
  id: string;
  slug: string;
  make: string;
  model: string;
  trim: string | null;
  year: number;
  mileage: number | null;
  mileage_unit: CarMileageUnit;
  body_type: CarBodyType | null;
  fuel: CarFuelType;
  transmission: CarTransmission;
  drivetrain: CarDrivetrain | null;
  exterior_colour: string | null;
  vin: string | null;
  origin_country: CarOriginCountry;
  vessel_name: string | null;
  /** ISO date (no time): nobody knows the hour a ship sails. */
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
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * The four figures behind the headline price, when all four are known.
 *
 * All-or-nothing by design. A partial breakdown ("freight GH₵18,000, duty
 * unknown") next to a total is worse than no breakdown: it reads as though the
 * missing lines are zero. The database refuses to let a complete set disagree
 * with the total (`car_listings_breakdown_sums_to_total`) and `toCarListingView`
 * refuses to build one from an incomplete set.
 */
export interface CarPriceBreakdown {
  vehicle_pesewas: number;
  freight_insurance_pesewas: number;
  duty_clearing_pesewas: number;
  service_fee_pesewas: number;
}

/** A listing as a screen sees it. */
export interface CarListingView
  extends Omit<
    CarListingRow,
    | "vehicle_price_pesewas"
    | "freight_insurance_pesewas"
    | "duty_clearing_pesewas"
    | "service_fee_pesewas"
    | "created_by"
    | "updated_by"
  > {
  /** Null unless every component is present. */
  breakdown: CarPriceBreakdown | null;
}

// ── Photos ──────────────────────────────────────────────────────────────────

/** A `car_photos` row, verbatim. `storage_path` is server-side only. */
export interface CarPhotoRow {
  id: string;
  car_listing_id: string;
  storage_path: string;
  content_type: string;
  width: number;
  height: number;
  byte_size: number;
  alt_text: string | null;
  sort_order: number;
  is_cover: boolean;
  uploaded_by: string | null;
  created_at: string;
}

/**
 * A photo as a screen sees it: a same-origin URL, its natural size, and a label.
 *
 * `url` IS A RELATIVE PATH, and every car component must treat it as one. It is
 * not run through `safeImageSrc` (`src/features/app-home/components/format.ts`),
 * which is written for scraped third-party URLs and calls `new URL(value)` —
 * that throws on a relative path, so the helper returns null and the photo
 * silently disappears. Car photos are ours, same-origin, and need no host
 * allowlisting; they need the `/api/cars/photos/**` entry in `next.config.ts`'s
 * `localPatterns` instead, without which `next/image` refuses them outright.
 */
export interface CarPhotoView {
  id: string;
  car_listing_id: string;
  url: string;
  width: number;
  height: number;
  alt: string;
  sort_order: number;
  is_cover: boolean;
}

// ── Enquiries ───────────────────────────────────────────────────────────────

/** A `car_enquiries` row, verbatim. */
export interface CarEnquiryRow {
  id: string;
  car_listing_id: string;
  user_id: string;
  kind: CarEnquiryKind;
  offer_pesewas: number | null;
  message: string | null;
  status: CarEnquiryStatus;
  admin_response: string | null;
  quoted_pesewas: number | null;
  answered_by: string | null;
  answered_at: string | null;
  created_at: string;
  updated_at: string;
}

// ── Mappers ─────────────────────────────────────────────────────────────────

/** Row to view. The only place the breakdown's all-or-nothing rule is applied. */
export function toCarListingView(row: CarListingRow): CarListingView {
  const {
    vehicle_price_pesewas,
    freight_insurance_pesewas,
    duty_clearing_pesewas,
    service_fee_pesewas,
    created_by: _createdBy,
    updated_by: _updatedBy,
    ...rest
  } = row;

  const complete =
    vehicle_price_pesewas !== null &&
    freight_insurance_pesewas !== null &&
    duty_clearing_pesewas !== null &&
    service_fee_pesewas !== null;

  return {
    ...rest,
    breakdown: complete
      ? {
          vehicle_pesewas: vehicle_price_pesewas,
          freight_insurance_pesewas,
          duty_clearing_pesewas,
          service_fee_pesewas,
        }
      : null,
  };
}

/**
 * Row to view, turning the storage key into the route that will serve it.
 *
 * The URL is built from the row's `id`, never from `storage_path`: the key stays
 * on the server, and the serving route looks the row up again anyway so that the
 * listing's publish state is re-checked per request.
 */
export function toCarPhotoView(row: CarPhotoRow, fallbackAlt: string): CarPhotoView {
  return {
    id: row.id,
    car_listing_id: row.car_listing_id,
    url: `/api/cars/photos/${row.id}`,
    width: row.width,
    height: row.height,
    // An empty alt on a photograph of the product is a screen reader saying
    // nothing at all, twenty times. The caller passes the car's name as the
    // floor.
    alt: row.alt_text?.trim() || fallbackAlt,
    sort_order: row.sort_order,
    is_cover: row.is_cover,
  };
}
