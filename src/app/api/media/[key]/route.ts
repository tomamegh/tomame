import { NextRequest } from "next/server";

import { isMarketingImageKey, readStoredImage } from "@/features/media/services/media.service";
import { getMediaOverride } from "@/db/queries/media-overrides";
import { logger } from "@/lib/logger";

/**
 * Serve an admin-uploaded marketing image.
 *
 * The `marketing-media` bucket is private and has no public URL; this is the
 * only way its bytes reach a browser. Keeping it same-origin means the
 * database never stores a third-party URL, so an override cannot be turned into
 * a tracking beacon or a defacement.
 *
 * Public by design — these are marketing photos on a signed-out page. The route
 * reads only the storage path recorded for a known image key, so it cannot be
 * used to enumerate the bucket.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ key: string }> },
) {
  const { key } = await params;

  // Only keys that exist in the manifest. Prevents this route from being used
  // as a generic reader for arbitrary rows or objects.
  if (!isMarketingImageKey(key)) {
    return new Response("Not found", { status: 404 });
  }

  try {
    const override = await getMediaOverride(key);
    if (!override?.storage_path) {
      return new Response("Not found", { status: 404 });
    }

    const file = await readStoredImage(override.storage_path);
    if (!file) {
      return new Response("Not found", { status: 404 });
    }

    return new Response(file.body, {
      status: 200,
      headers: {
        "Content-Type": file.contentType,
        // The URL carries the storage object name as a cache buster, so a given
        // URL's bytes never change and can be cached hard.
        "Cache-Control": "public, max-age=31536000, immutable",
        "Content-Security-Policy": "default-src 'none'; sandbox",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    logger.error("Media route failed", {
      key,
      error: error instanceof Error ? error.message : String(error),
    });
    return new Response("Not found", { status: 404 });
  }
}
