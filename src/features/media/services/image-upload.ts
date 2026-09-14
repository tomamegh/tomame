import "server-only";

import sharp from "sharp";

import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";

/**
 * The upload pipeline every image in the platform goes through, whatever it is
 * a picture OF.
 *
 * This was the whole of `media.service.ts` until migration 054 gave us a second
 * kind of upload — a warehouse photograph of a customer's parcel — whose only
 * differences from a marketing image are the bucket it lands in and the name the
 * object is given. Those two are parameters; everything else is a security
 * property that must not be re-implemented per caller, so the validation lives
 * here once and `media.service.ts` (marketing) and
 * `parcel-photos.service.ts` (054) are thin faces over it.
 *
 * The single most important defence is unchanged: we never store what was sent.
 * Every upload is re-encoded through sharp, which fails on anything that is not
 * really an image, drops EXIF (including the GPS tag a warehouse phone writes),
 * and destroys any polyglot payload hiding behind image magic bytes. The width,
 * height and byte size the caller records are sharp's own measurements of the
 * bytes we wrote, never numbers taken from the upload.
 */

/** Refuse before decoding. Sharp is memory-hungry on pathological input. */
export const MAX_UPLOAD_BYTES = 12 * 1024 * 1024;

/** Refuse a decompression bomb: a tiny file that expands to a huge raster. */
const MAX_PIXELS = 40_000_000;

/** Smaller than this is a mistake, not a photo — it would look terrible. */
const MIN_EDGE = 200;

/** Longest edge we keep. Every smaller size is derived from this. */
const MAX_EDGE = 2400;

const ALLOWED_INPUT_FORMATS = new Set(["jpeg", "png", "webp", "avif", "tiff"]);

/** A refusal the caller should surface as 4xx, not as a server fault. */
export class MediaValidationError extends Error {}

/** What a stored object turned out to be, measured after the re-encode. */
export interface StoredImage {
  storagePath: string;
  width: number;
  height: number;
  byteSize: number;
  contentType: "image/webp";
}

/** The re-encoded bytes, before anyone has decided where to put them. */
export interface EncodedImage {
  data: Buffer;
  width: number;
  height: number;
  byteSize: number;
  contentType: "image/webp";
}

/**
 * Validate and re-encode an upload. Storage is the caller's business.
 *
 * `label` only ever reaches the log line — it is not part of any object name,
 * so it cannot carry a path.
 */
export async function encodeImageUpload(
  bytes: Buffer,
  label: string,
): Promise<EncodedImage> {
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
    logger.warn("Upload: image could not be decoded", { label, reason });
    if (/pixel|limitInputPixels|exceeds/i.test(reason)) {
      throw new MediaValidationError(
        "That image is too large to process. Try one under 40 megapixels.",
      );
    }
    throw new MediaValidationError(
      "That image could not be read. It may be corrupt or incomplete.",
    );
  }

  return {
    data: output.data,
    width: output.info.width,
    height: output.info.height,
    byteSize: output.data.byteLength,
    contentType: "image/webp",
  };
}

/**
 * A random object name. NEVER the uploaded filename, which is
 * attacker-controlled and a path-traversal risk; the randomness also means a
 * replacement gets a fresh URL, so no cache can serve the previous photo.
 */
export function randomObjectName(): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 16);
}

/** Write re-encoded bytes into a private bucket. Throws if storage refuses. */
export async function putImageObject(
  bucket: string,
  storagePath: string,
  data: Buffer,
  options: { cacheControl?: string } = {},
): Promise<void> {
  const client = createAdminClient();
  const { error } = await client.storage.from(bucket).upload(storagePath, data, {
    contentType: "image/webp",
    cacheControl: options.cacheControl ?? "public, max-age=31536000, immutable",
    upsert: false,
  });

  if (error) {
    logger.error("Upload: storage write failed", {
      bucket,
      storagePath,
      error: error.message,
    });
    throw new Error(`Could not store the image: ${error.message}`);
  }
}

/** Stream an object back out of a private bucket. Null when it is not there. */
export async function getImageObject(
  bucket: string,
  storagePath: string,
): Promise<{ body: ArrayBuffer; contentType: string } | null> {
  const client = createAdminClient();
  const { data, error } = await client.storage.from(bucket).download(storagePath);
  if (error || !data) return null;
  return { body: await data.arrayBuffer(), contentType: "image/webp" };
}

/** Best-effort cleanup of a replaced or deleted object. Never throws. */
export async function removeImageObject(
  bucket: string,
  storagePath: string,
): Promise<void> {
  try {
    const client = createAdminClient();
    await client.storage.from(bucket).remove([storagePath]);
  } catch (error) {
    logger.warn("Upload: could not remove object", {
      bucket,
      storagePath,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
