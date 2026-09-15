import "server-only";

import {
  countCarPhotos,
  deleteCarPhoto,
  getCarListingById,
  getCarPhoto,
  insertCarPhoto,
  listCarPhotos,
  setCarPhotoCover,
  setCarPhotoOrder,
} from "@/db/queries/cars";
import { AUDIT_ACTOR_ROLES, AUDIT_ENTITY_TYPES } from "@/config/constants";
import { logAuditEvent } from "@/features/audit/services/audit.service";
import { MediaValidationError } from "@/features/media/services/image-upload";
import { APIError } from "@/lib/auth/api-helpers";
import { logger } from "@/lib/logger";
import { deleteCarPhotoObject, encodeCarPhoto, putCarPhoto, readCarPhoto } from "./car-photo-storage";
import { carTitle } from "../format";
import { toCarPhotoView, type CarPhotoRow, type CarPhotoView } from "../types";
import type { CarActor } from "./cars.service";

/**
 * Car photographs — the admin writes them, everyone reads them once the listing
 * is published (migration 067).
 *
 * Deliberately modelled line for line on
 * `features/order-photos/services/order-photos.service.ts`, because the risky
 * parts are identical and re-deriving them per feature is how one of them ends
 * up wrong:
 *
 *  - EVERY ADMIN WRITE IS AUDITED. An upload and a deletion are both changes to
 *    what a public page claims a car looks like, and the second one destroys the
 *    only record of it. CLAUDE.md does not permit either without an
 *    `audit_logs` row.
 *
 *  - THE LISTING ID COMES FROM THE SERVER. The storage key is built from the
 *    listing the route authorised, never from anything the browser sent, and
 *    `car_photos_path_matches_listing` CHECKs the same rule from the database's
 *    side.
 *
 *  - THE ORDERING DISCIPLINE. Bytes first, then the row; delete the object if
 *    the row write fails. A row without bytes is a broken image on a customer's
 *    screen; bytes without a row are invisible and cost a few kilobytes.
 *
 * WHAT IS DIFFERENT from parcel photos is only who may look: a parcel photo is
 * re-authorised against its owner on every request, while a car photo is
 * re-checked against its listing's publish state. Both are re-checked; neither
 * mints a signed URL.
 */

/**
 * A ceiling as well as a floor.
 *
 * Each file is buffered whole and pushed through sharp, and the function has
 * about a gigabyte: an admin who selects an entire shoot sends files that each
 * pass the 12MB guard and together exhaust the process — part-written, some
 * objects and rows already committed. Twelve at a time is generous for one
 * upload, and `MAX_PHOTOS_PER_LISTING` is the real limit on a gallery.
 */
export const MAX_PHOTOS_PER_UPLOAD = 12;

/**
 * Forty pictures of one car is a page nobody scrolls and a mobile bundle nobody
 * on a Ghanaian connection waits for. Enforced in the service rather than as a
 * constraint because it counts rows on another table.
 */
export const MAX_PHOTOS_PER_LISTING = 40;

export interface UploadCarPhotosInput {
  carListingId: string;
  /** Re-encoded by the storage service; these are the raw uploaded bytes. */
  files: Buffer[];
  altText?: string | null;
  /** Force the first of this batch to become the cover. */
  makeCover?: boolean;
}

// ── Writes ──────────────────────────────────────────────────────────────────

/**
 * Store a batch of photographs against one listing.
 *
 * EVERY FILE IS VALIDATED BEFORE ANY OF THEM IS STORED. The usual failure is a
 * PDF or a screenshot in the middle of the selection, and refusing the whole
 * request before a single object is written leaves nothing half-uploaded for the
 * admin to clean up. A bad file is their mistake, not a server fault — 422.
 *
 * THE FIRST PHOTO ON AN EMPTY LISTING BECOMES THE COVER automatically. Without
 * that, a listing can be published with a gallery and no cover, and the list
 * page falls back to "the first by sort order" — which is a different picture
 * than the one the admin thought they chose the moment anything is reordered.
 */
export async function uploadCarPhotos(
  actor: CarActor,
  input: UploadCarPhotosInput,
): Promise<CarPhotoView[]> {
  if (input.files.length === 0) throw new APIError(400, "No photo was uploaded.");
  if (input.files.length > MAX_PHOTOS_PER_UPLOAD) {
    throw new APIError(
      400,
      `That is more than ${MAX_PHOTOS_PER_UPLOAD} photos at once. Send them in smaller batches.`,
    );
  }

  // Before a single byte is stored: the listing must exist. The foreign key
  // would catch it a moment later, but only after the object was written into a
  // prefix no row will ever name, and nothing would ever find it again.
  const listing = await getCarListingById(input.carListingId);
  if (!listing) throw new APIError(404, "Car listing not found");

  const existing = await countCarPhotos(listing.id);
  if (existing + input.files.length > MAX_PHOTOS_PER_LISTING) {
    throw new APIError(
      422,
      `A listing holds at most ${MAX_PHOTOS_PER_LISTING} photos, and this one already has ${existing}.`,
    );
  }

  let encoded;
  try {
    encoded = await Promise.all(input.files.map((bytes) => encodeCarPhoto(listing.id, bytes)));
  } catch (error) {
    if (error instanceof MediaValidationError) throw new APIError(422, error.message);
    throw error;
  }

  const fallbackAlt = carTitle(listing);
  const stored: CarPhotoRow[] = [];
  let nextSortOrder = existing;

  for (const [index, image] of encoded.entries()) {
    const object = await putCarPhoto(listing.id, image);

    // The bytes are in the bucket. If the row fails to write, nothing will ever
    // reference them and no code path can find them again, so clean up before
    // surfacing the error rather than leaking a multi-megabyte object.
    let row: CarPhotoRow;
    try {
      row = await insertCarPhoto({
        car_listing_id: listing.id,
        storage_path: object.storagePath,
        width: object.width,
        height: object.height,
        byte_size: object.byteSize,
        alt_text: input.altText ?? null,
        sort_order: nextSortOrder,
        // Only the first of the batch, and only when the listing has nothing
        // yet or the caller asked. `uq_car_photos_cover` would refuse a second.
        is_cover: index === 0 && existing === 0 && input.makeCover !== false,
        uploaded_by: actor.id,
      });
    } catch (error) {
      await deleteCarPhotoObject(object.storagePath);
      throw error;
    }

    nextSortOrder += 1;
    stored.push(row);

    await logAuditEvent({
      actorId: actor.id,
      actorRole: AUDIT_ACTOR_ROLES.ADMIN,
      action: "car_photo_uploaded",
      entityType: AUDIT_ENTITY_TYPES.CAR_PHOTO,
      entityId: row.id,
      metadata: {
        table: "car_photos",
        carListingId: listing.id,
        slug: listing.slug,
        storagePath: row.storage_path,
        width: row.width,
        height: row.height,
        byteSize: row.byte_size,
        isCover: row.is_cover,
        actorEmail: actor.email,
      },
    });
  }

  // An explicit "make this the cover" on a listing that already had photos: done
  // after the rows exist, because moving the flag needs the new row to move it
  // to. Failing here leaves the photos stored and the old cover in place, which
  // is a cosmetic wrong rather than a lost upload.
  if (input.makeCover === true && existing > 0 && stored[0]) {
    try {
      await setCarPhotoCover(listing.id, stored[0].id);
    } catch (error) {
      logger.warn("car photo: stored, but the cover could not be moved", {
        carListingId: listing.id,
        photoId: stored[0].id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return stored.map((row) => toCarPhotoView(row, fallbackAlt));
}

/**
 * Remove one photograph: the row first, then the object it named.
 *
 * `carListingId` is the route's path segment and the photo must belong to it — a
 * photo id alone would let an admin delete a picture from a different listing by
 * typing the wrong URL, and the audit entry would name the wrong car.
 *
 * The row goes first deliberately. A failure between the two leaves an orphaned
 * object nobody can reach, which is recoverable; the other order leaves a row
 * whose picture 404s in a customer's gallery, which is not.
 *
 * DELETING THE COVER PROMOTES THE NEXT PHOTO. A listing that silently loses its
 * cover renders on the storefront as a car with no picture, which is the one
 * thing a car listing may not be.
 */
export async function removeCarPhoto(
  actor: CarActor,
  carListingId: string,
  photoId: string,
): Promise<CarPhotoRow> {
  const existing = await getCarPhoto(photoId);
  if (!existing || existing.car_listing_id !== carListingId) {
    throw new APIError(404, "Photo not found");
  }

  const row = await deleteCarPhoto(photoId);
  if (!row) throw new APIError(404, "Photo not found");

  await deleteCarPhotoObject(row.storage_path);

  if (row.is_cover) {
    try {
      const remaining = await listCarPhotos(carListingId);
      if (remaining[0]) await setCarPhotoCover(carListingId, remaining[0].id);
    } catch (error) {
      logger.warn("car photo: deleted, but the cover could not be promoted", {
        carListingId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  await logAuditEvent({
    actorId: actor.id,
    actorRole: AUDIT_ACTOR_ROLES.ADMIN,
    action: "car_photo_deleted",
    entityType: AUDIT_ENTITY_TYPES.CAR_PHOTO,
    entityId: row.id,
    // `audit_logs` is append-only and is the only remaining trace of a photo
    // that no longer exists, so it keeps a description of what went.
    metadata: {
      table: "car_photos",
      carListingId: row.car_listing_id,
      storagePath: row.storage_path,
      altText: row.alt_text,
      byteSize: row.byte_size,
      wasCover: row.is_cover,
      actorEmail: actor.email,
    },
  });

  return row;
}

/**
 * Rearrange a gallery, and optionally move the cover.
 *
 * THE WHOLE LIST IS SENT, not a pair to swap, so the operation is idempotent:
 * replaying a dropped request produces the same arrangement, whereas a swap
 * replayed twice undoes itself.
 *
 * Ids that do not belong to this listing are rejected rather than ignored — a
 * reorder carrying a foreign id is a broken caller, and silently dropping it
 * would leave the admin looking at an order they did not get.
 */
export async function reorderCarPhotos(
  actor: CarActor,
  carListingId: string,
  photoIds: readonly string[],
  coverPhotoId?: string | null,
): Promise<CarPhotoView[]> {
  const listing = await getCarListingById(carListingId);
  if (!listing) throw new APIError(404, "Car listing not found");

  const current = await listCarPhotos(carListingId);
  const known = new Set(current.map((photo) => photo.id));

  for (const id of photoIds) {
    if (!known.has(id)) throw new APIError(422, "That photo is not on this listing.");
  }
  if (photoIds.length !== current.length) {
    throw new APIError(422, "Send every photo on the listing, in the order you want them.");
  }
  if (coverPhotoId && !known.has(coverPhotoId)) {
    throw new APIError(422, "That photo is not on this listing.");
  }

  for (const [index, id] of photoIds.entries()) {
    await setCarPhotoOrder(carListingId, id, index);
  }
  if (coverPhotoId) await setCarPhotoCover(carListingId, coverPhotoId);

  await logAuditEvent({
    actorId: actor.id,
    actorRole: AUDIT_ACTOR_ROLES.ADMIN,
    action: "car_photos_reordered",
    entityType: AUDIT_ENTITY_TYPES.CAR_LISTING,
    entityId: listing.id,
    metadata: {
      table: "car_photos",
      slug: listing.slug,
      photoOrder: [...photoIds],
      coverPhotoId: coverPhotoId ?? null,
      actorEmail: actor.email,
    },
  });

  const fallbackAlt = carTitle(listing);
  return (await listCarPhotos(carListingId)).map((row) => toCarPhotoView(row, fallbackAlt));
}

// ── Reads ───────────────────────────────────────────────────────────────────

/**
 * The bytes of one photograph, for anyone at all — PROVIDED ITS LISTING IS
 * PUBLISHED, re-checked on this request rather than on the page that embedded
 * the image.
 *
 * That re-check is the whole point of the private bucket. An admin drafting a
 * listing uploads photographs before the price is agreed; if those objects were
 * publicly addressable, the car would effectively be on the internet before
 * anyone decided it should be. Unpublishing has to take the pictures down in the
 * same instant, and it does, because this lookup happens every time.
 *
 * Every refusal is the same 404. Which check failed is not the caller's
 * business, and a 403 would confirm that a draft exists.
 */
export async function readCarPhotoForViewer(
  photoId: string,
  viewer: { isAdmin: boolean } = { isAdmin: false },
): Promise<{
  body: ArrayBuffer;
  contentType: string;
  /** True when this photo is readable by anyone, i.e. its listing is published. */
  isPublic: boolean;
}> {
  const photo = await getCarPhoto(photoId);
  if (!photo) throw new APIError(404, "Photo not found");

  const listing = await getCarListingById(photo.car_listing_id);
  if (!listing) throw new APIError(404, "Photo not found");

  // AN ADMIN MAY SEE A DRAFT'S PHOTOS; NOBODY ELSE MAY. This is the only URL a
  // car photograph is ever served from, so gating it on `is_published` alone
  // meant the person who had just uploaded eight pictures to an unpublished
  // listing saw eight broken images, and had to publish a car to the public in
  // order to look at what they were about to publish. Same shape as
  // `/api/order-photos/[photoId]`, which re-authorises per request rather than
  // trusting that an id is hard to guess.
  if (!listing.is_published && !viewer.isAdmin) throw new APIError(404, "Photo not found");

  const file = await readCarPhoto(photo.storage_path);
  // The row says there is a picture and the object is gone: a real fault, not a
  // "you may not see this". Logged loudly, answered as 404 to the browser.
  if (!file) {
    logger.error("car photo object missing", {
      photoId: photo.id,
      carListingId: photo.car_listing_id,
      storagePath: photo.storage_path,
    });
    throw new APIError(404, "Photo not found");
  }

  return { ...file, isPublic: listing.is_published };
}

/** Every photo on a listing, as views. Admin console. */
export async function listCarPhotosForAdmin(carListingId: string): Promise<CarPhotoView[]> {
  const listing = await getCarListingById(carListingId);
  if (!listing) throw new APIError(404, "Car listing not found");
  const fallbackAlt = carTitle(listing);
  return (await listCarPhotos(carListingId)).map((row) => toCarPhotoView(row, fallbackAlt));
}
