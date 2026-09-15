import "server-only";

import {
  encodeImageUpload,
  getImageObject,
  putImageObject,
  randomObjectName,
  removeImageObject,
  type EncodedImage,
  type StoredImage,
} from "@/features/media/services/image-upload";

/**
 * Object storage for car photographs (migration 067).
 *
 * A sibling of `features/media/services/parcel-photos.service.ts`, not a copy of
 * it: the validation, the re-encode and the bucket I/O are `image-upload.ts`,
 * shared by all three kinds of upload in the platform. Re-implementing any of
 * that here is how one of the three would end up with a weaker rule than the
 * others — `encodeImageUpload` is the security boundary (sharp re-encodes every
 * byte, which proves the file is an image, strips EXIF including the GPS tag a
 * phone writes, and destroys any polyglot payload), and there must be exactly
 * one of it.
 *
 * What is different here is only what a car photo IS, and that shows up twice:
 *
 *  1. THE BUCKET. `car-photos`, private. Not `marketing-media` and not
 *     `parcel-photos` — 067 explains the separation the way 054 did: lifecycle
 *     and blast radius. A sold car's twenty photographs will one day be cleared
 *     out, and that sweep must not be able to reach a customer's parcel
 *     evidence.
 *
 *  2. THE KEY. `cars/<listing_id>/<random>.webp`, and the listing id comes from
 *     the row the route already authorised — NEVER from anything the browser
 *     sent. The database enforces the same rule from the other side
 *     (`car_photos_path_matches_listing` CHECKs the path against the row's own
 *     `car_listing_id`), so a bug here becomes a failed insert rather than a
 *     published listing serving a draft's photographs.
 *
 * The object name is `randomObjectName()` and never the uploaded filename, which
 * is attacker-controlled; the randomness also means a replaced photo gets a
 * fresh URL, so no cache can serve the previous one.
 */

export const CAR_PHOTO_BUCKET = "car-photos";

/** The object key for a photo of this listing. The only place it is constructed. */
export function carPhotoStoragePath(carListingId: string): string {
  return `cars/${carListingId}/${randomObjectName()}.webp`;
}

/**
 * Validate and re-encode one uploaded photograph. Nothing is stored yet.
 *
 * Separate from the write because an admin uploads a whole gallery at once:
 * every file is checked before any of them lands, so a PDF in the middle of the
 * selection refuses the batch instead of leaving half of it in the bucket.
 */
export async function encodeCarPhoto(
  carListingId: string,
  bytes: Buffer,
): Promise<EncodedImage> {
  return encodeImageUpload(bytes, `car:${carListingId}`);
}

/**
 * Write re-encoded bytes under this listing's own prefix.
 *
 * `immutable` and a year, unlike the parcel bucket's `no-store`: the key is
 * random, so a given object's bytes never change, and these photographs are
 * marketing material on a page anybody may open rather than a picture of one
 * named customer's property. The objects are still private — this header
 * governs the storage layer's own response, and the only door to the bucket is
 * `/api/cars/photos/[photoId]`, which re-checks the listing's publish state on
 * every request.
 */
export async function putCarPhoto(
  carListingId: string,
  encoded: EncodedImage,
): Promise<StoredImage> {
  const storagePath = carPhotoStoragePath(carListingId);

  await putImageObject(CAR_PHOTO_BUCKET, storagePath, encoded.data, {
    cacheControl: "public, max-age=31536000, immutable",
  });

  return {
    storagePath,
    width: encoded.width,
    height: encoded.height,
    byteSize: encoded.byteSize,
    contentType: encoded.contentType,
  };
}

/** The bytes of one stored photo, or null when the object is gone. */
export async function readCarPhoto(
  storagePath: string,
): Promise<{ body: ArrayBuffer; contentType: string } | null> {
  return getImageObject(CAR_PHOTO_BUCKET, storagePath);
}

/**
 * Remove the object. Best effort, and deliberately so: the row is deleted
 * first, so a storage failure leaves an orphaned object nobody can reach rather
 * than a row pointing at bytes that are already gone — a gallery with a broken
 * image in it is the worse of the two outcomes.
 */
export async function deleteCarPhotoObject(storagePath: string): Promise<void> {
  await removeImageObject(CAR_PHOTO_BUCKET, storagePath);
}
