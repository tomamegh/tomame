import "server-only";

import {
  encodeImageUpload,
  getImageObject,
  putImageObject,
  randomObjectName,
  removeImageObject,
  type EncodedImage,
  type StoredImage,
} from "./image-upload";

/**
 * Object storage for warehouse photographs of a customer's parcel (054).
 *
 * A sibling of `media.service.ts`, not a copy of it: the validation, the
 * re-encode and the bucket I/O are `image-upload.ts`, shared by both. What is
 * different here is only what a parcel photo IS — a picture of one named
 * customer's property rather than a company asset — and that shows up in two
 * places:
 *
 *  1. THE BUCKET. `parcel-photos`, never `marketing-media`. Migration 054
 *     explains the separation: blast radius and a retention rule marketing
 *     images must not inherit.
 *
 *  2. THE KEY. `orders/<order_id>/<random>.webp`, and the order id comes from
 *     the caller's already-authorised order — NEVER from anything the browser
 *     sent. The database enforces the same rule from the other side
 *     (`order_photos_path_matches_order` CHECKs the path against the row's own
 *     `order_id`), so a bug here becomes a failed insert rather than a photo of
 *     customer B filed under customer A.
 */

export const PARCEL_PHOTO_BUCKET = "parcel-photos";

/** The object key for a photo of this order. The only place it is constructed. */
export function parcelPhotoStoragePath(orderId: string): string {
  return `orders/${orderId}/${randomObjectName()}.webp`;
}

/**
 * Validate and re-encode one uploaded photograph. Nothing is stored yet.
 *
 * Separate from the write because an operator uploads a whole arrival at once:
 * every file is checked before any of them lands, so a PDF in the middle of the
 * selection refuses the batch instead of leaving half of it in the bucket.
 */
export async function encodeParcelPhoto(
  orderId: string,
  bytes: Buffer,
): Promise<EncodedImage> {
  return encodeImageUpload(bytes, `parcel:${orderId}`);
}

/**
 * Write re-encoded bytes under this order's own prefix.
 *
 * Returns what was actually written — sharp's own measurements — which is what
 * the `order_photos` row records.
 */
export async function putParcelPhoto(
  orderId: string,
  encoded: EncodedImage,
): Promise<StoredImage> {
  const storagePath = parcelPhotoStoragePath(orderId);

  // `private` rather than the marketing bucket's public immutable header: the
  // bytes reach a browser only through a route that re-checks ownership per
  // request, and no shared cache should ever hold a copy.
  await putImageObject(PARCEL_PHOTO_BUCKET, storagePath, encoded.data, {
    cacheControl: "private, max-age=0, no-store",
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
export async function readParcelPhoto(
  storagePath: string,
): Promise<{ body: ArrayBuffer; contentType: string } | null> {
  return getImageObject(PARCEL_PHOTO_BUCKET, storagePath);
}

/**
 * Remove the object. Best effort, and deliberately so: the row is deleted
 * first, so a storage failure leaves an orphaned object nobody can reach rather
 * than a row pointing at bytes that are already gone.
 */
export async function deleteParcelPhoto(storagePath: string): Promise<void> {
  await removeImageObject(PARCEL_PHOTO_BUCKET, storagePath);
}
