import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import type {
  CarEnquiryRow,
  CarListingRow,
  CarPhotoRow,
} from "@/features/cars/types";
import type { CarEnquiryStatus } from "@/config/constants";

/**
 * `car_listings`, `car_photos` and `car_enquiries` access (migration 067).
 *
 * DATA ACCESS ONLY. Who may write a listing, whether an offer is allowed on this
 * particular car, the object that has to be in the bucket before the photo row,
 * and the `audit_logs` entry every mutation owes are all
 * `features/cars/services` — CLAUDE.md: `db/queries` holds no business logic and
 * no auth checks.
 *
 * SERVICE ROLE THROUGHOUT, which is why this module is `server-only`. Migration
 * 061 revoked INSERT/UPDATE/DELETE from `authenticated` and `anon` on every
 * app-written table and 067 follows it, so each write here would be refused
 * through a cookie-bound client. The reads are filtered EXPLICITLY
 * (`.eq("is_published", true)`) rather than leaning on RLS, for the same reason
 * `db/queries/order-photos.ts` gives: this client bypasses policies, so a
 * "published only" promise made by a policy is not a promise made to this file.
 * Forgetting that `.eq` is how an unpublished draft — a car we have not agreed a
 * price for — ends up on a public page.
 *
 * `updated_at` IS STAMPED BY HAND on every UPDATE. There is no shared trigger
 * function in this schema and 067 adds none; `db/queries/policies.ts` sets
 * `last_updated` the same way.
 *
 * Errors are NOT swallowed. An admin who has just corrected a five-figure price
 * must be told when it did not save.
 */

// ONE STRING LITERAL, not a concatenation. Supabase's client types the result of
// `.select()` from the literal it is given; a `"a, b" + "c, d"` widens to `string`
// and every row comes back as `GenericStringError`, which typecheck then refuses
// at each cast site. Long line, correct types.
const LISTING_COLUMNS =
  "id, slug, make, model, trim, year, mileage, mileage_unit, body_type, fuel, transmission, drivetrain, exterior_colour, vin, origin_country, vessel_name, sailed_on, eta_tema, description, price_state, price_pesewas, vehicle_price_pesewas, freight_insurance_pesewas, duty_clearing_pesewas, service_fee_pesewas, is_published, sort_order, created_by, updated_by, created_at, updated_at";

const PHOTO_COLUMNS =
  "id, car_listing_id, storage_path, content_type, width, height, byte_size, alt_text, sort_order, is_cover, uploaded_by, created_at";

const ENQUIRY_COLUMNS =
  "id, car_listing_id, user_id, kind, offer_pesewas, message, status, admin_response, quoted_pesewas, answered_by, answered_at, created_at, updated_at";

/** Postgres unique violation. */
const UNIQUE_VIOLATION = "23505";
/** Postgres CHECK violation — one of 067's invariants refused the row. */
const CHECK_VIOLATION = "23514";
/** Postgres foreign-key violation — another table's row still points at this one. */
const FOREIGN_KEY_VIOLATION = "23503";

/**
 * Thrown instead of a bare `Error` when the slug (or the VIN) is already taken,
 * so the service can answer 409 rather than 500 without reading Postgres error
 * codes itself. Modelled on `PolicySlugTakenError`; a `SELECT` first would race
 * two admins creating the same listing anyway.
 */
export class CarSlugTakenError extends Error {
  constructor(public readonly slug: string) {
    super(`A car listing with the link "${slug}" already exists`);
    this.name = "CarSlugTakenError";
  }
}

/**
 * A VIN identifies one physical vehicle on earth, so a collision is a duplicate
 * listing rather than a naming clash and reads differently to the admin.
 */
export class CarVinTakenError extends Error {
  constructor(public readonly vin: string) {
    super(`Another listing already has the VIN ${vin}`);
    this.name = "CarVinTakenError";
  }
}

/**
 * A 067 CHECK refused the write — the price state and the price disagree, or the
 * breakdown does not add up.
 *
 * The schema layer checks the same rules and gives a readable message, so
 * reaching this means a writer bypassed validation. It is surfaced as a 422
 * rather than a 500 because the row, not the server, is what is wrong; the
 * constraint name travels with it so the log says which invariant fired.
 */
export class CarInvariantError extends Error {
  constructor(public readonly detail: string) {
    super(`That listing is not a valid combination: ${detail}`);
    this.name = "CarInvariantError";
  }
}

/**
 * The listing cannot go, because somebody bought the car.
 *
 * `car_orders.car_listing_id` is `ON DELETE RESTRICT` (068), deliberately: the
 * cascade would take the record of a five-figure sale with it and leave a
 * `payments` row pointing at nothing. So the delete fails with 23503, and
 * without this class the admin who pressed Delete got a 500 carrying a raw
 * Postgres sentence about a foreign key constraint — true, and useless.
 *
 * THE MESSAGE HAS TO CARRY THE WAY OUT, because the admin's actual intent is
 * almost always "take this car off the site" and that IS available:
 * `setCarListingPublished` hides the listing, the public page and the photo
 * route both re-check `is_published`, and the sale keeps its record. Deleting a
 * car somebody owns is not a thing that should be made possible.
 */
export class CarListingSoldError extends Error {
  constructor() {
    super(
      "This car has been bought, so its listing cannot be deleted — the sale record points at it. Unpublish it instead to take it off the site.",
    );
    this.name = "CarListingSoldError";
  }
}

/** The one enquiry a customer may already have open on a car (uq_car_enquiries_live). */
export class CarEnquiryExistsError extends Error {
  constructor() {
    super("You already have an open enquiry on this car");
    this.name = "CarEnquiryExistsError";
  }
}

// ── Listings: public reads ──────────────────────────────────────────────────

export interface ListCarListingsOptions {
  /** Omit for everything (admin). `true` is the only value a public caller uses. */
  publishedOnly?: boolean;
  /** Free text over make, model and trim. */
  search?: string;
  limit?: number;
  offset?: number;
}

/**
 * The list, in the order an admin arranged it: `sort_order` first, newest next.
 *
 * `count` comes back alongside the rows because the admin screen pages and a
 * second head request to measure the same filter is a second round trip for a
 * number the first query already knows.
 */
export async function listCarListings(
  options: ListCarListingsOptions = {},
): Promise<{ rows: CarListingRow[]; total: number }> {
  let query = createAdminClient()
    .from("car_listings")
    .select(LISTING_COLUMNS, { count: "exact" })
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false });

  if (options.publishedOnly !== undefined) {
    query = query.eq("is_published", options.publishedOnly);
  }
  if (options.search) {
    // `or` over the three name columns. The value is escaped for PostgREST's
    // filter grammar by `escapeFilterValue` below: a bare comma or parenthesis
    // in a search box would otherwise be read as filter syntax.
    const term = escapeFilterValue(options.search);
    query = query.or(`make.ilike.%${term}%,model.ilike.%${term}%,trim.ilike.%${term}%`);
  }

  const limit = options.limit ?? 50;
  const offset = options.offset ?? 0;
  query = query.range(offset, offset + limit - 1);

  const { data, error, count } = await query;
  if (error) throw new Error(`Failed to load the car listings: ${error.message}`);

  return {
    rows: ((data ?? []) as Record<string, unknown>[]).map(normalizeListing),
    total: count ?? 0,
  };
}

/** One listing by id, whatever its publish state. Admin lookup. */
export async function getCarListingById(id: string): Promise<CarListingRow | null> {
  const { data, error } = await createAdminClient()
    .from("car_listings")
    .select(LISTING_COLUMNS)
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(`Failed to load the car listing: ${error.message}`);
  return data ? normalizeListing(data as Record<string, unknown>) : null;
}

/**
 * One listing by its URL segment.
 *
 * `publishedOnly` defaults to TRUE. This is the function a public page calls,
 * and a default that leaked drafts would be one forgotten argument away from
 * publishing a car whose price nobody has agreed. An admin preview passes
 * `false` explicitly.
 */
export async function getCarListingBySlug(
  slug: string,
  options: { publishedOnly?: boolean } = {},
): Promise<CarListingRow | null> {
  let query = createAdminClient()
    .from("car_listings")
    .select(LISTING_COLUMNS)
    .eq("slug", slug);

  if (options.publishedOnly !== false) query = query.eq("is_published", true);

  const { data, error } = await query.maybeSingle();
  if (error) throw new Error(`Failed to load the car listing: ${error.message}`);
  return data ? normalizeListing(data as Record<string, unknown>) : null;
}

// ── Listings: writes ────────────────────────────────────────────────────────

/** Every column a writer may set. `id`, `created_at` and `updated_at` are not here. */
export interface CarListingWrite {
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
  price_state: string;
  price_pesewas: number | null;
  vehicle_price_pesewas: number | null;
  freight_insurance_pesewas: number | null;
  duty_clearing_pesewas: number | null;
  service_fee_pesewas: number | null;
  is_published: boolean;
  sort_order: number;
}

export async function insertCarListing(
  input: CarListingWrite & { created_by: string | null },
): Promise<CarListingRow> {
  const { data, error } = await createAdminClient()
    .from("car_listings")
    .insert({ ...input, updated_by: input.created_by })
    .select(LISTING_COLUMNS)
    .single();

  if (error) throw translateWriteError(error, input.slug, input.vin);
  return normalizeListing(data as Record<string, unknown>);
}

/**
 * Replace the editable half of one listing. Null when there is no such row.
 *
 * A FULL REPLACEMENT, not a patch, because the price invariant spans two
 * columns: "set price_state to on_request" cannot be judged without knowing what
 * `price_pesewas` will be afterwards. The admin form holds the whole listing, so
 * it sends the whole listing.
 */
export async function updateCarListing(
  id: string,
  input: CarListingWrite & { updated_by: string | null },
): Promise<CarListingRow | null> {
  const { data, error } = await createAdminClient()
    .from("car_listings")
    .update({ ...input, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select(LISTING_COLUMNS)
    .maybeSingle();

  if (error) throw translateWriteError(error, input.slug, input.vin);
  return data ? normalizeListing(data as Record<string, unknown>) : null;
}

/**
 * Flip the publish flag on its own.
 *
 * Separate from `updateCarListing` deliberately: taking a car off the site is
 * the change an investigation looks for, it happens from a list screen that does
 * not hold the rest of the row, and routing it through the full replacement
 * would mean a publish toggle could silently rewrite twenty other columns with
 * whatever the screen last had in memory.
 */
export async function setCarListingPublished(
  id: string,
  isPublished: boolean,
  updatedBy: string | null,
): Promise<CarListingRow | null> {
  const { data, error } = await createAdminClient()
    .from("car_listings")
    .update({
      is_published: isPublished,
      updated_by: updatedBy,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select(LISTING_COLUMNS)
    .maybeSingle();

  if (error) throw new Error(`Failed to change the listing's publish state: ${error.message}`);
  return data ? normalizeListing(data as Record<string, unknown>) : null;
}

/**
 * Delete one listing and hand back the row that went, so the audit entry can
 * record what it said before it stopped existing.
 *
 * `car_photos` and `car_enquiries` both CASCADE from here (067). The service
 * reads the photo rows FIRST so it can remove their storage objects — a cascade
 * deletes rows, not bytes, and without that step the bucket keeps every
 * photograph of a car nobody can reach any more.
 *
 * `car_orders` DOES NOT CASCADE (068). It RESTRICTS, so deleting a car somebody
 * has bought raises 23503 and the delete does not happen — which is the correct
 * answer and used to reach the admin as an unexplained 500 carrying a raw
 * constraint name. `CarListingSoldError` is that refusal as a sentence, and the
 * only reason this delete translates its error at all.
 */
export async function deleteCarListing(id: string): Promise<CarListingRow | null> {
  const { data, error } = await createAdminClient()
    .from("car_listings")
    .delete()
    .eq("id", id)
    .select(LISTING_COLUMNS)
    .maybeSingle();

  if (error) {
    const sold = soldListingError(error);
    if (sold) throw sold;
    throw new Error(`Failed to delete the car listing: ${error.message}`);
  }
  return data ? normalizeListing(data as Record<string, unknown>) : null;
}

// ── Photos ──────────────────────────────────────────────────────────────────

export interface CarPhotoInsert {
  car_listing_id: string;
  storage_path: string;
  width: number;
  height: number;
  byte_size: number;
  alt_text?: string | null;
  sort_order?: number;
  is_cover?: boolean;
  uploaded_by?: string | null;
}

export async function insertCarPhoto(input: CarPhotoInsert): Promise<CarPhotoRow> {
  const { data, error } = await createAdminClient()
    .from("car_photos")
    .insert(input)
    .select(PHOTO_COLUMNS)
    .single();

  if (error) throw new Error(`Failed to record the car photo: ${error.message}`);
  return normalizePhoto(data as Record<string, unknown>);
}

/** One listing's gallery, in the order it is drawn. */
export async function listCarPhotos(carListingId: string): Promise<CarPhotoRow[]> {
  const { data, error } = await createAdminClient()
    .from("car_photos")
    .select(PHOTO_COLUMNS)
    .eq("car_listing_id", carListingId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) throw new Error(`Failed to load the car photos: ${error.message}`);
  return ((data ?? []) as Record<string, unknown>[]).map(normalizePhoto);
}

/**
 * Every photo belonging to any of these listings, in one round trip.
 *
 * ONE QUERY, NOT ONE PER CAR. The Home rail and `/app/cars` both draw a cover
 * for every listing they show, and doing that with `listCarPhotos` per row is a
 * fan-out that grows with the forecourt: six cars on Home is six queries before
 * the page can paint, and the index is worse. The listings are already in hand,
 * so their ids are too, and one `in (...)` answers for all of them.
 *
 * Ordering matches `listCarPhotos` exactly — `sort_order` then `created_at` —
 * so a caller grouping these by listing sees each gallery in the same order it
 * would have seen reading them one at a time. An empty id list short-circuits:
 * `in ()` is a query that can only return nothing.
 */
export async function listCarPhotosForListings(
  carListingIds: readonly string[],
): Promise<CarPhotoRow[]> {
  if (carListingIds.length === 0) return [];

  const { data, error } = await createAdminClient()
    .from("car_photos")
    .select(PHOTO_COLUMNS)
    .in("car_listing_id", carListingIds as string[])
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) throw new Error(`Failed to load the car photos: ${error.message}`);
  return ((data ?? []) as Record<string, unknown>[]).map(normalizePhoto);
}

/** One photo by id, or null. The serving route's first lookup. */
export async function getCarPhoto(id: string): Promise<CarPhotoRow | null> {
  const { data, error } = await createAdminClient()
    .from("car_photos")
    .select(PHOTO_COLUMNS)
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(`Failed to load the car photo: ${error.message}`);
  return data ? normalizePhoto(data as Record<string, unknown>) : null;
}

/**
 * How many photos a listing already has.
 *
 * Read before an upload so the service can enforce a per-listing ceiling and
 * choose the new photo's `sort_order`. A head count rather than the rows,
 * because the bodies are not wanted.
 */
export async function countCarPhotos(carListingId: string): Promise<number> {
  const { count, error } = await createAdminClient()
    .from("car_photos")
    .select("id", { count: "exact", head: true })
    .eq("car_listing_id", carListingId);

  if (error) throw new Error(`Failed to count the car photos: ${error.message}`);
  return count ?? 0;
}

/** Deleted row back, so the caller can remove the object and audit what went. */
export async function deleteCarPhoto(id: string): Promise<CarPhotoRow | null> {
  const { data, error } = await createAdminClient()
    .from("car_photos")
    .delete()
    .eq("id", id)
    .select(PHOTO_COLUMNS)
    .maybeSingle();

  if (error) throw new Error(`Failed to delete the car photo: ${error.message}`);
  return data ? normalizePhoto(data as Record<string, unknown>) : null;
}

/**
 * Move the cover flag, clearing whatever held it first.
 *
 * TWO STATEMENTS AND THE ORDER MATTERS. `uq_car_photos_cover` is a partial
 * unique index over `(car_listing_id) WHERE is_cover`, so setting the new cover
 * before clearing the old one violates it. Clearing first leaves a listing with
 * no cover for the width of the call, which the read path already handles (it
 * falls back to the first photo by sort order) — the other order leaves the
 * write failing outright.
 */
export async function setCarPhotoCover(
  carListingId: string,
  photoId: string,
): Promise<void> {
  const db = createAdminClient();

  const cleared = await db
    .from("car_photos")
    .update({ is_cover: false })
    .eq("car_listing_id", carListingId)
    .eq("is_cover", true);
  if (cleared.error) {
    throw new Error(`Failed to move the cover photo: ${cleared.error.message}`);
  }

  const set = await db
    .from("car_photos")
    .update({ is_cover: true })
    .eq("id", photoId)
    .eq("car_listing_id", carListingId);
  if (set.error) {
    throw new Error(`Failed to set the cover photo: ${set.error.message}`);
  }
}

/**
 * Write one photo's position.
 *
 * Scoped by `car_listing_id` as well as `id` so a reorder cannot reach a photo
 * on another listing even if an id from a different gallery is sent.
 */
export async function setCarPhotoOrder(
  carListingId: string,
  photoId: string,
  sortOrder: number,
): Promise<void> {
  const { error } = await createAdminClient()
    .from("car_photos")
    .update({ sort_order: sortOrder })
    .eq("id", photoId)
    .eq("car_listing_id", carListingId);

  if (error) throw new Error(`Failed to reorder the car photos: ${error.message}`);
}

// ── Enquiries ───────────────────────────────────────────────────────────────

export interface CarEnquiryInsert {
  car_listing_id: string;
  user_id: string;
  kind: string;
  offer_pesewas: number | null;
  message: string | null;
}

export async function insertCarEnquiry(input: CarEnquiryInsert): Promise<CarEnquiryRow> {
  const { data, error } = await createAdminClient()
    .from("car_enquiries")
    .insert(input)
    .select(ENQUIRY_COLUMNS)
    .single();

  if (error) {
    // `uq_car_enquiries_live` — this customer already has an open or answered
    // enquiry on this car. Usually a double-tapped button on a phone.
    if (error.code === UNIQUE_VIOLATION) throw new CarEnquiryExistsError();
    if (error.code === CHECK_VIOLATION) throw new CarInvariantError(error.message);
    throw new Error(`Failed to record the enquiry: ${error.message}`);
  }
  return normalizeEnquiry(data as Record<string, unknown>);
}

export async function getCarEnquiry(id: string): Promise<CarEnquiryRow | null> {
  const { data, error } = await createAdminClient()
    .from("car_enquiries")
    .select(ENQUIRY_COLUMNS)
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(`Failed to load the enquiry: ${error.message}`);
  return data ? normalizeEnquiry(data as Record<string, unknown>) : null;
}

export interface ListCarEnquiriesOptions {
  status?: CarEnquiryStatus;
  carListingId?: string;
  userId?: string;
  limit?: number;
  offset?: number;
}

/** The admin queue, or one customer's own enquiries. Oldest open first. */
export async function listCarEnquiries(
  options: ListCarEnquiriesOptions = {},
): Promise<{ rows: CarEnquiryRow[]; total: number }> {
  let query = createAdminClient()
    .from("car_enquiries")
    .select(ENQUIRY_COLUMNS, { count: "exact" })
    .order("created_at", { ascending: false });

  if (options.status) query = query.eq("status", options.status);
  if (options.carListingId) query = query.eq("car_listing_id", options.carListingId);
  // Applied in SQL rather than relying on the owner policy, because this client
  // bypasses RLS. A caller that means "this customer's enquiries" must say so.
  if (options.userId) query = query.eq("user_id", options.userId);

  const limit = options.limit ?? 50;
  const offset = options.offset ?? 0;
  query = query.range(offset, offset + limit - 1);

  const { data, error, count } = await query;
  if (error) throw new Error(`Failed to load the enquiries: ${error.message}`);

  return {
    rows: ((data ?? []) as Record<string, unknown>[]).map(normalizeEnquiry),
    total: count ?? 0,
  };
}

export interface CarEnquiryAnswer {
  status: CarEnquiryStatus;
  admin_response: string | null;
  quoted_pesewas: number | null;
  answered_by: string | null;
}

/**
 * Record the admin's answer.
 *
 * `answered_at` is stamped HERE and never taken from the caller — it is the
 * timestamp a complaint about being ignored is settled against, and
 * `car_enquiries_answered_is_attributed` requires it for any status that is not
 * `open` or `withdrawn`.
 */
export async function answerCarEnquiry(
  id: string,
  answer: CarEnquiryAnswer,
): Promise<CarEnquiryRow | null> {
  const now = new Date().toISOString();
  const { data, error } = await createAdminClient()
    .from("car_enquiries")
    .update({
      status: answer.status,
      admin_response: answer.admin_response,
      quoted_pesewas: answer.quoted_pesewas,
      answered_by: answer.answered_by,
      answered_at: now,
      updated_at: now,
    })
    .eq("id", id)
    .select(ENQUIRY_COLUMNS)
    .maybeSingle();

  if (error) {
    if (error.code === CHECK_VIOLATION) throw new CarInvariantError(error.message);
    throw new Error(`Failed to answer the enquiry: ${error.message}`);
  }
  return data ? normalizeEnquiry(data as Record<string, unknown>) : null;
}

/** Open enquiries waiting on a person. The sidebar badge's number. */
export async function countOpenCarEnquiries(): Promise<number> {
  const { count, error } = await createAdminClient()
    .from("car_enquiries")
    .select("id", { count: "exact", head: true })
    .eq("status", "open");

  if (error) throw new Error(`Failed to count the open enquiries: ${error.message}`);
  return count ?? 0;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Which of 067's (or 068's) guards refused a listing write.
 *
 * Both unique indexes report code 23505 and only the message says which, so the
 * index name is what separates "that link is taken" from "that car is already
 * listed" — two different sentences for the admin.
 */
function translateWriteError(
  error: { code?: string; message: string; details?: string | null },
  slug: string,
  vin: string | null,
): Error {
  const sold = soldListingError(error);
  if (sold) return sold;
  if (error.code === UNIQUE_VIOLATION) {
    if (vin && /uq_car_listings_vin/.test(error.message)) return new CarVinTakenError(vin);
    return new CarSlugTakenError(slug);
  }
  if (error.code === CHECK_VIOLATION) return new CarInvariantError(error.message);
  return new Error(`Failed to save the car listing: ${error.message}`);
}

/**
 * A 23503 raised by `car_orders.car_listing_id`'s RESTRICT (068), or null for
 * anything else.
 *
 * NARROWED TO THAT ONE CONSTRAINT ON PURPOSE. 23503 is the code for every
 * foreign key on these tables, and the others mean something completely
 * different — a `created_by`/`updated_by` naming a profile that no longer
 * exists is a bug in the caller, not a car somebody bought, and telling an
 * admin to unpublish a listing over it would send them chasing the wrong thing.
 * So the referenced table has to be named before the sentence is claimed, which
 * is the same discipline the 23505 branch above uses to tell a taken link from
 * a duplicate VIN.
 *
 * Postgres puts the constraint and the referencing table in the message
 * ("... violates foreign key constraint \"car_orders_car_listing_id_fkey\" on
 * table \"car_orders\"") and the key in `details`; both are read, because which
 * of the two PostgREST forwards has changed between versions and a message this
 * one is worth being right about.
 */
function soldListingError(error: {
  code?: string;
  message: string;
  details?: string | null;
}): CarListingSoldError | null {
  if (error.code !== FOREIGN_KEY_VIOLATION) return null;
  return /car_orders/.test(`${error.message} ${error.details ?? ""}`)
    ? new CarListingSoldError()
    : null;
}

/**
 * Neutralise PostgREST's filter grammar in a user-typed search term.
 *
 * `or()` takes a comma-separated expression list, so a comma, parenthesis or
 * backslash in the search box is read as syntax rather than as text — at best a
 * confusing 400, at worst a filter the caller did not write.
 */
function escapeFilterValue(value: string): string {
  return value.replace(/[\\,()]/g, " ").trim();
}

// ── Row normalisation (PostgREST widens numerics to strings) ────────────────

function normalizeListing(row: Record<string, unknown>): CarListingRow {
  return {
    id: String(row.id),
    slug: String(row.slug),
    make: String(row.make),
    model: String(row.model),
    trim: (row.trim as string | null) ?? null,
    year: Number(row.year),
    mileage: numberOrNull(row.mileage),
    mileage_unit: row.mileage_unit as CarListingRow["mileage_unit"],
    body_type: (row.body_type as CarListingRow["body_type"]) ?? null,
    fuel: row.fuel as CarListingRow["fuel"],
    transmission: row.transmission as CarListingRow["transmission"],
    drivetrain: (row.drivetrain as CarListingRow["drivetrain"]) ?? null,
    exterior_colour: (row.exterior_colour as string | null) ?? null,
    vin: (row.vin as string | null) ?? null,
    origin_country: row.origin_country as CarListingRow["origin_country"],
    vessel_name: (row.vessel_name as string | null) ?? null,
    sailed_on: (row.sailed_on as string | null) ?? null,
    eta_tema: (row.eta_tema as string | null) ?? null,
    description: String(row.description ?? ""),
    price_state: row.price_state as CarListingRow["price_state"],
    price_pesewas: numberOrNull(row.price_pesewas),
    vehicle_price_pesewas: numberOrNull(row.vehicle_price_pesewas),
    freight_insurance_pesewas: numberOrNull(row.freight_insurance_pesewas),
    duty_clearing_pesewas: numberOrNull(row.duty_clearing_pesewas),
    service_fee_pesewas: numberOrNull(row.service_fee_pesewas),
    is_published: row.is_published === true,
    sort_order: Number(row.sort_order ?? 0),
    created_by: (row.created_by as string | null) ?? null,
    updated_by: (row.updated_by as string | null) ?? null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

function normalizePhoto(row: Record<string, unknown>): CarPhotoRow {
  return {
    id: String(row.id),
    car_listing_id: String(row.car_listing_id),
    storage_path: String(row.storage_path),
    content_type: String(row.content_type),
    width: Number(row.width),
    height: Number(row.height),
    byte_size: Number(row.byte_size),
    alt_text: (row.alt_text as string | null) ?? null,
    sort_order: Number(row.sort_order ?? 0),
    is_cover: row.is_cover === true,
    uploaded_by: (row.uploaded_by as string | null) ?? null,
    created_at: String(row.created_at),
  };
}

function normalizeEnquiry(row: Record<string, unknown>): CarEnquiryRow {
  return {
    id: String(row.id),
    car_listing_id: String(row.car_listing_id),
    user_id: String(row.user_id),
    kind: row.kind as CarEnquiryRow["kind"],
    offer_pesewas: numberOrNull(row.offer_pesewas),
    message: (row.message as string | null) ?? null,
    status: row.status as CarEnquiryStatus,
    admin_response: (row.admin_response as string | null) ?? null,
    quoted_pesewas: numberOrNull(row.quoted_pesewas),
    answered_by: (row.answered_by as string | null) ?? null,
    answered_at: (row.answered_at as string | null) ?? null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

/** `Number(null)` is 0, which would turn "no price" into "free". */
function numberOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
