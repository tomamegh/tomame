import "server-only";

import {
  encodeImageUpload,
  getImageObject,
  putImageObject,
  randomObjectName,
  removeImageObject,
  MediaValidationError,
  MAX_UPLOAD_BYTES,
  type StoredImage,
} from "./image-upload";
import {
  MARKETING_IMAGES,
  type MarketingImageKey,
} from "@/config/marketing-images";

/**
 * Uploads and crops for the /builder screen.
 *
 * The validation, the re-encode and the bucket I/O now live in
 * `image-upload.ts`, shared with the parcel photographs of migration 054. This
 * file is what is specific to MARKETING images: which keys exist, where their
 * objects are named, and the crop position the builder saves next to them.
 * Nothing about the security posture changed — see that module's header.
 */

const BUCKET = "marketing-media";

export { MediaValidationError, MAX_UPLOAD_BYTES };
export type { StoredImage };

export function isMarketingImageKey(key: string): key is MarketingImageKey {
  return Object.prototype.hasOwnProperty.call(MARKETING_IMAGES, key);
}

/**
 * CSS object-position, restricted to the two forms the builder produces.
 *
 * This lands in a style attribute, so it is validated rather than trusted.
 * React assigns it as a property value so it cannot introduce new declarations,
 * but a strict allowlist keeps junk out of the database and keeps the rendered
 * CSS predictable.
 */
const POSITION_KEYWORDS = new Set([
  "center",
  "top",
  "bottom",
  "left",
  "right",
]);

export function normalisePosition(raw: string): string {
  const value = raw.trim().toLowerCase();
  if (POSITION_KEYWORDS.has(value)) return value;

  const match = /^(\d{1,3}(?:\.\d+)?)%\s+(\d{1,3}(?:\.\d+)?)%$/.exec(value);
  if (!match) {
    throw new MediaValidationError(
      `Invalid crop position "${raw}". Use "50% 30%" or a keyword like "center".`,
    );
  }
  const x = Number(match[1]);
  const y = Number(match[2]);
  if (x > 100 || y > 100) {
    throw new MediaValidationError("Crop percentages must be between 0 and 100.");
  }
  return `${x}% ${y}%`;
}

/**
 * Validate, normalise and store an uploaded marketing image.
 *
 * The object name is derived from the slot key plus random bytes — never from
 * the uploaded filename, which is attacker-controlled and a path-traversal
 * risk. The random suffix also means a replacement gets a fresh URL, so
 * browsers and CDNs cannot serve the previous photo from cache.
 */
export async function storeUploadedImage(
  key: MarketingImageKey,
  bytes: Buffer,
): Promise<StoredImage> {
  const encoded = await encodeImageUpload(bytes, `marketing:${key}`);
  const storagePath = `marketing/${key}-${randomObjectName()}.webp`;

  await putImageObject(BUCKET, storagePath, encoded.data);

  return {
    storagePath,
    width: encoded.width,
    height: encoded.height,
    byteSize: encoded.byteSize,
    contentType: encoded.contentType,
  };
}

/** Stream an object back out of the private bucket. */
export async function readStoredImage(
  storagePath: string,
): Promise<{ body: ArrayBuffer; contentType: string } | null> {
  return getImageObject(BUCKET, storagePath);
}

/** Best-effort cleanup of a replaced object. Never fails the caller's request. */
export async function deleteStoredImage(storagePath: string): Promise<void> {
  await removeImageObject(BUCKET, storagePath);
}
