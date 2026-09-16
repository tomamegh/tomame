import "server-only";

import {
  CarEnquiryExistsError,
  CarInvariantError,
  CarListingSoldError,
  CarSlugTakenError,
  CarVinTakenError,
  answerCarEnquiry as answerCarEnquiryRow,
  deleteCarListing,
  getCarEnquiry,
  getCarListingById,
  getCarListingBySlug,
  insertCarEnquiry,
  insertCarListing,
  listCarEnquiries,
  listCarListings,
  listCarPhotos,
  listCarPhotosForListings,
  setCarListingPublished,
  updateCarListing,
  type CarListingWrite,
  type ListCarEnquiriesOptions,
  type ListCarListingsOptions,
} from "@/db/queries/cars";
import { deleteCarPhotoObject } from "./car-photo-storage";
import {
  AUDIT_ACTOR_ROLES,
  AUDIT_ENTITY_TYPES,
  CAR_ENQUIRY_KINDS,
  CAR_ENQUIRY_STATUSES,
  CAR_PRICE_STATES,
} from "@/config/constants";
import { logAuditEvent } from "@/features/audit/services/audit.service";
import { APIError } from "@/lib/auth/api-helpers";
import { logger } from "@/lib/logger";
import { carTitle } from "../format";
import {
  toCarListingView,
  toCarPhotoView,
  type CarEnquiryRow,
  type CarListingRow,
  type CarListingView,
  type CarPhotoRow,
  type CarPhotoView,
} from "../types";
import type {
  AnswerCarEnquiryInput,
  CreateCarEnquiryInput,
  CreateCarListingInput,
  UpdateCarListingInput,
} from "../schema";

/**
 * The cars business logic (migration 067) — admin writes, customer enquiries.
 *
 * WHAT IS NOT HERE, AND MUST NOT BE ADDED WITHOUT A PRODUCT DECISION: a money
 * path. Nothing in this file touches `orders`, `payments`, `carts`,
 * `cart_items` or `order_groups`, and `acceptCarEnquiry` records that a human
 * said yes and stops. Buying a car raises questions this phase has no answer
 * to — deposit or full pre-payment, and what happens to a customer's money
 * while the vehicle is mid-ocean — and a half-built purchase path would mean an
 * `orders` row in a state machine nobody agreed to. Migration 067's header is
 * the long version.
 *
 * EVERY MUTATION IS AUDITED, and not as housekeeping. A listing carries a
 * five-figure advertised price on a public page; "who changed the price of the
 * Highlander, and from what" and "who unpublished it the day before it landed"
 * must both have answers. CLAUDE.md does not permit a mutation like that without
 * an `audit_logs` row. All three tables are keyed by UUID, so `entity_id` takes
 * the id directly and the slug rides in `metadata`.
 *
 * TWO RULES A CHECK CONSTRAINT CANNOT ENFORCE live here, because they span rows:
 *   - an OFFER only belongs on a `negotiable` listing, and a PRICE REQUEST only
 *     on an `on_request` one;
 *   - an enquiry may only be answered from a state that is still open.
 *
 * Layering: routes authenticate, rate-limit and shape responses; the reads and
 * writes are `db/queries/cars`; nothing here touches an HTTP object.
 */

/** Who did it. Resolved by the route from the admin session. */
export interface CarActor {
  id: string;
  email: string | null;
}

/** Who is asking. Resolved by the route from the customer's session. */
export interface CarCustomer {
  id: string;
  email: string | null;
}

// ── Reads ───────────────────────────────────────────────────────────────────

/** The public list: published listings only, in the order an admin arranged. */
export async function listPublishedCars(
  options: Omit<ListCarListingsOptions, "publishedOnly"> = {},
): Promise<{ cars: CarListingView[]; total: number }> {
  const { rows, total } = await listCarListings({ ...options, publishedOnly: true });
  return { cars: rows.map(toCarListingView), total };
}

/** The admin list: drafts included unless a filter says otherwise. */
export async function listCarsForAdmin(
  options: ListCarListingsOptions = {},
): Promise<{ cars: CarListingView[]; total: number }> {
  const { rows, total } = await listCarListings(options);
  return { cars: rows.map(toCarListingView), total };
}

/**
 * One listing and its gallery, for a public page.
 *
 * `publishedOnly` is left at the query's default (true), so an unpublished draft
 * 404s here rather than being rendered for anyone holding the link.
 */
export async function getPublishedCarBySlug(
  slug: string,
): Promise<{ car: CarListingView; photos: CarPhotoView[] } | null> {
  const row = await getCarListingBySlug(slug);
  if (!row) return null;
  return { car: toCarListingView(row), photos: await photosFor(row) };
}

/** One listing and its gallery, whatever its publish state. Admin console. */
export async function getCarForAdmin(
  id: string,
): Promise<{ car: CarListingView; photos: CarPhotoView[] } | null> {
  const row = await getCarListingById(id);
  if (!row) return null;
  return { car: toCarListingView(row), photos: await photosFor(row) };
}

/**
 * A listing's photos as views.
 *
 * NEVER THROWS. A gallery is an addition to a page that has already resolved;
 * failing the whole listing because the attachment store hiccuped would be a
 * worse outcome than a page with no pictures on it — the same call
 * `listVisibleOrderPhotos` makes for the journey screen.
 */
async function photosFor(row: CarListingRow): Promise<CarPhotoView[]> {
  const fallbackAlt = carTitle(row);
  try {
    return (await listCarPhotos(row.id)).map((photo) => toCarPhotoView(photo, fallbackAlt));
  } catch (error) {
    logger.warn("car photos unavailable", {
      carListingId: row.id,
      error: error instanceof Error ? error.message : String(error),
    });
    return [];
  }
}

// ── Admin writes: listings ──────────────────────────────────────────────────

export async function createCar(
  actor: CarActor,
  input: CreateCarListingInput,
): Promise<CarListingView> {
  let row: CarListingRow;
  try {
    row = await insertCarListing({ ...toWrite(input), created_by: actor.id });
  } catch (error) {
    throw mapWriteError(error);
  }

  await logAuditEvent({
    actorId: actor.id,
    actorRole: AUDIT_ACTOR_ROLES.ADMIN,
    action: "car_listing_created",
    entityType: AUDIT_ENTITY_TYPES.CAR_LISTING,
    entityId: row.id,
    metadata: {
      table: "car_listings",
      slug: row.slug,
      title: carTitle(row),
      vin: row.vin,
      priceState: row.price_state,
      pricePesewas: row.price_pesewas,
      isPublished: row.is_published,
      actorEmail: actor.email,
    },
  });

  return toCarListingView(row);
}

/**
 * Edit one listing.
 *
 * The current row is read first so the audit entry can say what CHANGED rather
 * than only what it is now. The price is the reason: a car's advertised figure
 * moving from GH₵185,000 to GH₵155,000 is the single most consequential edit in
 * this feature, and an audit row that records only the new number cannot answer
 * what it was before.
 */
export async function updateCar(
  actor: CarActor,
  id: string,
  input: UpdateCarListingInput,
): Promise<CarListingView> {
  const current = await getCarListingById(id);
  if (!current) throw new APIError(404, "Car listing not found");

  let row: CarListingRow | null;
  try {
    row = await updateCarListing(id, { ...toWrite(input), updated_by: actor.id });
  } catch (error) {
    throw mapWriteError(error);
  }
  if (!row) throw new APIError(404, "Car listing not found");

  const priceChanged =
    current.price_pesewas !== row.price_pesewas || current.price_state !== row.price_state;

  await logAuditEvent({
    actorId: actor.id,
    actorRole: AUDIT_ACTOR_ROLES.ADMIN,
    // A price move gets its own action so the log can be filtered for it
    // without reading the metadata of every edit.
    action: priceChanged ? "car_listing_repriced" : "car_listing_updated",
    entityType: AUDIT_ENTITY_TYPES.CAR_LISTING,
    entityId: row.id,
    metadata: {
      table: "car_listings",
      slug: row.slug,
      title: carTitle(row),
      previousPriceState: current.price_state,
      newPriceState: row.price_state,
      previousPricePesewas: current.price_pesewas,
      newPricePesewas: row.price_pesewas,
      previousPublished: current.is_published,
      newPublished: row.is_published,
      previousSlug: current.slug,
      actorEmail: actor.email,
    },
  });

  return toCarListingView(row);
}

/**
 * Put a listing on the site, or take it off.
 *
 * A separate call from `updateCar` on purpose: it happens from a list screen
 * that does not hold the rest of the row, and pushing it through the full
 * replacement would let a publish toggle silently rewrite twenty other columns
 * with whatever that screen last had in memory.
 *
 * PUBLISHING IS GUARDED. A car with no photograph is a card with a grey box on
 * the storefront, and the whole proposition is "look at the car". The check is
 * here rather than as a CHECK constraint because it is a rule about a
 * TRANSITION and depends on another table — the same reason 054's hold rule is
 * app-side.
 */
export async function setCarPublished(
  actor: CarActor,
  id: string,
  isPublished: boolean,
): Promise<CarListingView> {
  const current = await getCarListingById(id);
  if (!current) throw new APIError(404, "Car listing not found");

  if (isPublished && !current.is_published) {
    const photos = await listCarPhotos(id);
    if (photos.length === 0) {
      throw new APIError(
        422,
        "Add at least one photograph before publishing. A car listing with no picture is not a listing.",
      );
    }
  }

  // Idempotent: asking for the state it is already in changes nothing and
  // writes no audit row, so a double-clicked toggle does not fill the log with
  // publishes that did not happen.
  if (current.is_published === isPublished) return toCarListingView(current);

  const row = await setCarListingPublished(id, isPublished, actor.id);
  if (!row) throw new APIError(404, "Car listing not found");

  await logAuditEvent({
    actorId: actor.id,
    actorRole: AUDIT_ACTOR_ROLES.ADMIN,
    action: isPublished ? "car_listing_published" : "car_listing_unpublished",
    entityType: AUDIT_ENTITY_TYPES.CAR_LISTING,
    entityId: row.id,
    metadata: {
      table: "car_listings",
      slug: row.slug,
      title: carTitle(row),
      priceState: row.price_state,
      pricePesewas: row.price_pesewas,
      actorEmail: actor.email,
    },
  });

  return toCarListingView(row);
}

/**
 * Remove a listing outright.
 *
 * THE PHOTOS ARE READ BEFORE THE ROW IS DELETED. `car_photos` cascades from
 * `car_listings` (067), but a cascade deletes ROWS, not BYTES: without this the
 * bucket keeps every photograph of a car nobody can reach any more, growing
 * forever with nothing pointing at it. The objects go last, after the row is
 * gone, because a failure there leaves unreachable bytes (recoverable) rather
 * than a listing whose gallery 404s (not).
 *
 * The deleted row comes back from the query so the audit entry keeps a copy of
 * what vanished — `audit_logs` is append-only and is the only remaining trace.
 */
export async function deleteCar(actor: CarActor, id: string): Promise<CarListingView | null> {
  // Read first: after the delete, the cascade has already taken these rows and
  // their storage keys with them.
  let storagePaths: string[] = [];
  try {
    storagePaths = (await listCarPhotos(id)).map((photo) => photo.storage_path);
  } catch (error) {
    // Losing the list costs us the cleanup, not the deletion. Logged loudly
    // because the orphans it leaves are invisible from every screen.
    logger.error("car delete: could not list photos to clean up", {
      carListingId: id,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  let row: CarListingRow | null;
  try {
    row = await deleteCarListing(id);
  } catch (error) {
    throw mapWriteError(error);
  }
  if (!row) return null;

  for (const path of storagePaths) {
    await deleteCarPhotoObject(path);
  }

  await logAuditEvent({
    actorId: actor.id,
    actorRole: AUDIT_ACTOR_ROLES.ADMIN,
    action: "car_listing_deleted",
    entityType: AUDIT_ENTITY_TYPES.CAR_LISTING,
    entityId: row.id,
    metadata: {
      table: "car_listings",
      slug: row.slug,
      title: carTitle(row),
      vin: row.vin,
      priceState: row.price_state,
      pricePesewas: row.price_pesewas,
      wasPublished: row.is_published,
      photoCount: storagePaths.length,
      actorEmail: actor.email,
    },
  });

  return toCarListingView(row);
}

// ── Enquiries ───────────────────────────────────────────────────────────────

/**
 * A customer asks about a car: the price, or an offer.
 *
 * THE KIND MUST MATCH THE LISTING, and this is the only place that can be
 * checked. `car_enquiries_kind_amount` already guarantees an offer carries an
 * amount and a price request does not; what a CHECK cannot see is the LISTING's
 * price state, which lives on another row. Without this:
 *
 *   - an offer could be made on a `fixed` car, and the admin queue would show a
 *     negotiation on a vehicle that is explicitly not negotiable;
 *   - a price request could be raised against a car whose price is printed on
 *     the page the customer is standing on, which is a queue item nobody can
 *     usefully answer.
 *
 * The listing must also be PUBLISHED. A draft is not on the site, so an enquiry
 * against one came from a guessed id rather than from a page.
 */
export async function createCarEnquiry(
  customer: CarCustomer,
  carListingId: string,
  input: CreateCarEnquiryInput,
): Promise<CarEnquiryRow> {
  const listing = await getCarListingById(carListingId);
  if (!listing || !listing.is_published) throw new APIError(404, "Car listing not found");

  if (listing.price_state === CAR_PRICE_STATES.FIXED) {
    throw new APIError(
      422,
      "This car has a fixed price, so there is nothing to negotiate. Get in touch if you would like to buy it.",
    );
  }
  if (
    input.kind === CAR_ENQUIRY_KINDS.OFFER &&
    listing.price_state !== CAR_PRICE_STATES.NEGOTIABLE
  ) {
    throw new APIError(422, "This car is not open to offers yet. Ask us for a price first.");
  }
  if (
    input.kind === CAR_ENQUIRY_KINDS.PRICE_REQUEST &&
    listing.price_state !== CAR_PRICE_STATES.ON_REQUEST
  ) {
    throw new APIError(422, "This car already has an asking price. Make an offer against it.");
  }

  let row: CarEnquiryRow;
  try {
    row = await insertCarEnquiry({
      car_listing_id: listing.id,
      // From the session, never from the body. CLAUDE.md: never trust a
      // client-provided user_id.
      user_id: customer.id,
      kind: input.kind,
      offer_pesewas: input.offer_pesewas ?? null,
      message: input.message ?? null,
    });
  } catch (error) {
    if (error instanceof CarEnquiryExistsError) throw new APIError(409, error.message);
    if (error instanceof CarInvariantError) throw new APIError(422, error.message);
    throw error;
  }

  await logAuditEvent({
    // The customer is the actor here — this is their own action, and the audit
    // trail is what proves an offer was made at a particular moment.
    actorId: customer.id,
    actorRole: AUDIT_ACTOR_ROLES.USER,
    action: "car_enquiry_created",
    entityType: AUDIT_ENTITY_TYPES.CAR_ENQUIRY,
    entityId: row.id,
    metadata: {
      table: "car_enquiries",
      carListingId: listing.id,
      slug: listing.slug,
      title: carTitle(listing),
      kind: row.kind,
      offerPesewas: row.offer_pesewas,
      listingPriceState: listing.price_state,
      listingPricePesewas: listing.price_pesewas,
      actorEmail: customer.email,
    },
  });

  return row;
}

/** The admin queue, or one listing's enquiries. */
export async function listCarEnquiriesForAdmin(
  options: ListCarEnquiriesOptions = {},
): Promise<{ enquiries: CarEnquiryRow[]; total: number }> {
  const { rows, total } = await listCarEnquiries(options);
  return { enquiries: rows, total };
}

/** One customer's own enquiries. Scoped in SQL, not by policy — see the query. */
export async function listCarEnquiriesForCustomer(
  customer: CarCustomer,
  options: Omit<ListCarEnquiriesOptions, "userId"> = {},
): Promise<{ enquiries: CarEnquiryRow[]; total: number }> {
  const { rows, total } = await listCarEnquiries({ ...options, userId: customer.id });
  return { enquiries: rows, total };
}

/**
 * The states an enquiry may be answered FROM.
 *
 * `answered` is in the list because a negotiation goes back and forth: we
 * counter, the customer replies, we counter again. `accepted`, `declined` and
 * `withdrawn` are settled — reopening them is not an action this queue offers,
 * and a customer who wants to try again makes a fresh offer, which
 * `uq_car_enquiries_live` now permits because their old row is no longer live.
 */
const ANSWERABLE_FROM: readonly string[] = [
  CAR_ENQUIRY_STATUSES.OPEN,
  CAR_ENQUIRY_STATUSES.ANSWERED,
];

/**
 * An admin answers: a price, a counter, an acceptance or a refusal.
 *
 * ACCEPTING TAKES NO MONEY AND CREATES NO ORDER. It records that a human said
 * yes, so that the buyer can pick the conversation up off-platform. See the
 * file header before wiring anything else to it.
 *
 * The transition is validated against the row's CURRENT state and the whole
 * thing is idempotent in the way that matters: answering an already-settled
 * enquiry is a 409, not a silent overwrite of somebody else's decision. Two
 * admins working the queue at once is the ordinary case, not the exotic one.
 */
export async function answerEnquiry(
  actor: CarActor,
  enquiryId: string,
  input: AnswerCarEnquiryInput,
): Promise<CarEnquiryRow> {
  const current = await getCarEnquiry(enquiryId);
  if (!current) throw new APIError(404, "Enquiry not found");

  if (!ANSWERABLE_FROM.includes(current.status)) {
    throw new APIError(
      409,
      `This enquiry is already ${current.status}. Ask the customer to make a fresh offer.`,
    );
  }

  let row: CarEnquiryRow | null;
  try {
    row = await answerCarEnquiryRow(enquiryId, {
      status: input.status,
      admin_response: input.admin_response ?? null,
      quoted_pesewas: input.quoted_pesewas ?? null,
      answered_by: actor.id,
    });
  } catch (error) {
    if (error instanceof CarInvariantError) throw new APIError(422, error.message);
    throw error;
  }
  if (!row) throw new APIError(404, "Enquiry not found");

  await logAuditEvent({
    actorId: actor.id,
    actorRole: AUDIT_ACTOR_ROLES.ADMIN,
    action: `car_enquiry_${input.status}`,
    entityType: AUDIT_ENTITY_TYPES.CAR_ENQUIRY,
    entityId: row.id,
    metadata: {
      table: "car_enquiries",
      carListingId: row.car_listing_id,
      customerId: row.user_id,
      kind: row.kind,
      previousStatus: current.status,
      newStatus: row.status,
      offerPesewas: row.offer_pesewas,
      quotedPesewas: row.quoted_pesewas,
      actorEmail: actor.email,
    },
  });

  return row;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * The validated input as the columns the table actually has.
 *
 * Every optional field is normalised to `null` rather than left `undefined`: an
 * absent key in a PostgREST UPDATE leaves the old value in place, which would
 * make "clear the VIN" impossible and would quietly keep a stale vessel name on
 * a car that has been moved to another ship.
 */
function toWrite(input: CreateCarListingInput | UpdateCarListingInput): CarListingWrite {
  return {
    slug: input.slug,
    make: input.make,
    model: input.model,
    trim: input.trim ?? null,
    year: input.year,
    mileage: input.mileage ?? null,
    mileage_unit: input.mileage_unit,
    body_type: input.body_type ?? null,
    fuel: input.fuel,
    transmission: input.transmission,
    drivetrain: input.drivetrain ?? null,
    exterior_colour: input.exterior_colour ?? null,
    vin: input.vin ?? null,
    origin_country: input.origin_country,
    vessel_name: input.vessel_name ?? null,
    sailed_on: input.sailed_on ?? null,
    eta_tema: input.eta_tema ?? null,
    description: input.description,
    price_state: input.price_state,
    price_pesewas: input.price_pesewas ?? null,
    vehicle_price_pesewas: input.vehicle_price_pesewas ?? null,
    freight_insurance_pesewas: input.freight_insurance_pesewas ?? null,
    duty_clearing_pesewas: input.duty_clearing_pesewas ?? null,
    service_fee_pesewas: input.service_fee_pesewas ?? null,
    is_published: input.is_published,
    sort_order: input.sort_order,
  };
}

/**
 * A database refusal as a status code the admin can act on.
 *
 * A taken link or a duplicate VIN is the admin's mistake, not a server fault —
 * 409, with the sentence the query layer already wrote. An invariant violation
 * is a 422: the row is wrong, and reaching it means a writer got past the
 * schema, so it is logged rather than merely returned.
 */
function mapWriteError(error: unknown): unknown {
  if (error instanceof CarSlugTakenError) return new APIError(409, error.message);
  if (error instanceof CarVinTakenError) return new APIError(409, error.message);
  // A 409, not the 500 this used to be. `car_orders.car_listing_id` is
  // ON DELETE RESTRICT, so deleting a car somebody has bought raises 23503 —
  // a refusal with a reason, not a fault. The admin is told the sale record
  // points at it and that unpublishing is what takes it off the site.
  if (error instanceof CarListingSoldError) return new APIError(409, error.message);
  if (error instanceof CarInvariantError) {
    logger.error("car listing invariant violated past validation", { detail: error.detail });
    return new APIError(422, error.message);
  }
  return error;
}

/** One listing with the single photograph a card shows, or null when it has none. */
export interface CarWithCover {
  car: CarListingView;
  cover: CarPhotoView | null;
}

/**
 * Attach each listing's cover photograph, in ONE database round trip.
 *
 * WHY IT LIVES HERE NOW. This was `features/cars/components/car-covers.ts` — a
 * `server-only` module doing a database read from a components folder, which
 * CLAUDE.md calls an architecture bug outright, and which also meant the Home
 * rail issued one `car_photos` query per car before it could paint. It is one
 * `in (...)` now, and it sits in the layer that is allowed to ask.
 *
 * WHICH PHOTOGRAPH WINS. `is_cover` is the one an admin chose, so it wins. The
 * first row by `sort_order` is the fallback, because a card with a picture is
 * better than a card with a grey box, and a listing whose cover flag was never
 * set still has a gallery.
 *
 * IT NEVER THROWS AND NEVER DROPS A LISTING. A failed photo read costs the
 * pictures, not the cars: every listing comes back, some with a null cover, and
 * the card renders its placeholder. A forecourt that vanishes because one
 * `car_photos` read timed out would be a far worse screen than a grey box.
 */
export async function attachCovers(
  cars: readonly CarListingView[],
): Promise<CarWithCover[]> {
  if (cars.length === 0) return [];

  let byListing = new Map<string, CarPhotoRow[]>();
  try {
    for (const photo of await listCarPhotosForListings(cars.map((car) => car.id))) {
      const bucket = byListing.get(photo.car_listing_id);
      if (bucket) bucket.push(photo);
      else byListing.set(photo.car_listing_id, [photo]);
    }
  } catch (error) {
    logger.warn("car covers unavailable", {
      count: cars.length,
      error: error instanceof Error ? error.message : String(error),
    });
    byListing = new Map();
  }

  return cars.map((car) => {
    const photos = byListing.get(car.id) ?? [];
    const row = photos.find((photo) => photo.is_cover) ?? photos[0];
    return { car, cover: row ? toCarPhotoView(row, carTitle(car)) : null };
  });
}
