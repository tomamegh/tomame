import "server-only";

import sharp from "sharp";

import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";
import {
  MARKETING_IMAGES,
  type MarketingImageKey,
} from "@/config/marketing-images";

/**
 * Uploads and crops for the /builder screen.
 *
 * Everything here treats the uploaded bytes as hostile. The single most
 * important defence is that we never store what was sent: every upload is
 * re-encoded through sharp, which fails on anything that is not really an
 * image, drops EXIF (including GPS), and destroys any polyglot payload hiding
 * in a file that merely starts with image magic bytes.
 */

const BUCKET = "marketing-media";

/** Refuse before decoding. Sharp is memory-hungry on pathological input. */
export const MAX_UPLOAD_BYTES = 12 * 1024 * 1024;

/** Refuse a decompression bomb: a tiny file that expands to a huge raster. */
const MAX_PIXELS = 40_000_000;

/** Smaller than this is a mistake, not a photo — it would look terrible. */
const MIN_EDGE = 200;

/** Longest edge we keep. next/image derives every smaller size from this. */
const MAX_EDGE = 2400;

const ALLOWED_INPUT_FORMATS = new Set(["jpeg", "png", "webp", "avif", "tiff"]);

export class MediaValidationError extends Error {}

export interface StoredImage {
  storagePath: string;
  width: number;
  height: number;
  byteSize: number;
  contentType: "image/webp";
}

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
 * Validate, normalise and store an uploaded image.
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
  if (bytes.byteLength === 0) {
    throw new MediaValidationError("The uploaded file is empty.");
  }
  if (bytes.byteLength > MAX_UPLOAD_BYTES) {
    throw new MediaValidationError(
      `Image is larger than ${Math.floor(MAX_UPLOAD_BYTES / 1024 / 1024)}MB.`,
    );
  }

  let pipeline = sharp(bytes, { limitInputPixels: MAX_PIXELS });

  let meta;
  try {
    meta = await pipeline.metadata();
  } catch {
    // Sharp could not parse it. Whatever it is, it is not an image we accept.
    throw new MediaValidationError("That file is not a readable image.");
  }

  if (!meta.format || !ALLOWED_INPUT_FORMATS.has(meta.format)) {
    throw new MediaValidationError(
      `Unsupported image format${meta.format ? ` (${meta.format})` : ""}. Use JPEG, PNG, WebP, AVIF or TIFF.`,
    );
  }
  if (!meta.width || !meta.height) {
    throw new MediaValidationError("Could not read the image dimensions.");
  }
  if (meta.width < MIN_EDGE || meta.height < MIN_EDGE) {
    throw new MediaValidationError(
      `Image is too small (${meta.width}x${meta.height}). Both sides must be at least ${MIN_EDGE}px.`,
    );
  }
  if (meta.pages && meta.pages > 1) {
    // Animated source: keep the first frame only, so we never store a video-ish payload.
    pipeline = sharp(bytes, { limitInputPixels: MAX_PIXELS, pages: 1 });
  }

  // Re-encode. This is the security boundary: output bytes are produced by
  // sharp, not copied from the upload. `rotate()` bakes in EXIF orientation
  // before the metadata is dropped, so portrait photos do not end up sideways.
  // metadata() only reads the header — the decode happens here, so this is
  // where a truncated file or a decompression bomb actually fails. Without this
  // guard those surface as a 500 rather than a readable 422, including the
  // limitInputPixels case this whole function exists to catch.
  let output;
  try {
    output = await pipeline
      .rotate()
      .resize({
        width: MAX_EDGE,
        height: MAX_EDGE,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: 90 })
      .toBuffer({ resolveWithObject: true });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    logger.warn("Builder: image could not be decoded", { key, reason });
    if (/pixel|limitInputPixels|exceeds/i.test(reason)) {
      throw new MediaValidationError(
        "That image is too large to process. Try one under 40 megapixels.",
      );
    }
    throw new MediaValidationError(
      "That image could not be read — it may be corrupt or incomplete.",
    );
  }

  const storagePath = `marketing/${key}-${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}.webp`;

  const client = createAdminClient();
  const { error } = await client.storage
    .from(BUCKET)
    .upload(storagePath, output.data, {
      contentType: "image/webp",
      cacheControl: "public, max-age=31536000, immutable",
      upsert: false,
    });

  if (error) {
    logger.error("Builder: storage upload failed", {
      key,
      error: error.message,
    });
    throw new Error(`Could not store the image: ${error.message}`);
  }

  return {
    storagePath,
    width: output.info.width,
    height: output.info.height,
    byteSize: output.data.byteLength,
    contentType: "image/webp",
  };
}

/** Stream an object back out of the private bucket. */
export async function readStoredImage(
  storagePath: string,
): Promise<{ body: ArrayBuffer; contentType: string } | null> {
  const client = createAdminClient();
  const { data, error } = await client.storage.from(BUCKET).download(storagePath);
  if (error || !data) return null;
  return { body: await data.arrayBuffer(), contentType: "image/webp" };
}

/** Best-effort cleanup of a replaced object. Never fails the caller's request. */
export async function deleteStoredImage(storagePath: string): Promise<void> {
  try {
    const client = createAdminClient();
    await client.storage.from(BUCKET).remove([storagePath]);
  } catch (error) {
    logger.warn("Builder: could not remove replaced image", {
      storagePath,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
