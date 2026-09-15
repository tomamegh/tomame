import { NextRequest } from "next/server";

import { readCarPhotoForViewer } from "@/features/cars/services/car-photos.service";
import { getUserSession } from "@/features/auth/services/auth.service";
import { canAccessAdmin } from "@/lib/auth/admin-access";
import { logger } from "@/lib/logger";

/**
 * GET /api/cars/photos/:photoId — the bytes of one car photograph.
 *
 * The `car-photos` bucket is private and stays private: this is the only door
 * its objects have. Modelled on `/api/media/[key]` (marketing images) and
 * `/api/order-photos/[photoId]` (parcel photographs), and sitting between them
 * in how much it trusts the caller:
 *
 *   * Like the marketing route, it is PUBLIC. A car listing is a page a buyer
 *     sends to somebody who has never signed in, and the picture has to load.
 *     The long immutable cache is right for the same reason it is there: the URL
 *     carries an id whose object is never rewritten (a replacement gets a fresh
 *     random storage key and a fresh row), so a given URL's bytes never change.
 *
 *   * Like the parcel route, IT RE-CHECKS ON EVERY REQUEST. The check here is
 *     the listing's publish state, not ownership. An admin uploads photographs
 *     of a car while its price is still being agreed, and those must not be
 *     readable by anyone who guesses a URL; unpublishing has to take the
 *     pictures down in the same instant. The check therefore cannot be done once
 *     by the page that embedded the image — it is done here, per request, by
 *     `readCarPhotoForViewer`.
 *
 * THE CACHE HEADER AND THE PUBLISH CHECK ARE IN TENSION, and the resolution is
 * deliberate: a browser or CDN that already holds a copy will keep showing it
 * after an unpublish, for as long as its cache entry lives. That is acceptable
 * for a photograph of a vehicle in a shipping yard — it is not customer data,
 * and the listing page itself is gone — and it is the same trade
 * `/api/media/[key]` makes. If a car's photographs ever needed to be
 * *retractable*, this header is the line to change, not the check.
 *
 * Every refusal is a 404. Which of the checks failed is not the caller's
 * business, and a 403 would confirm that an unpublished listing exists.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ photoId: string }> },
) {
  const { photoId } = await params;

  try {
    const { session } = await getUserSession();
    const file = await readCarPhotoForViewer(photoId, { isAdmin: canAccessAdmin(session) });

    return new Response(file.body, {
      status: 200,
      headers: {
        "Content-Type": file.contentType,
        /*
          NOT `immutable`, and not a year. Whether this route answers at all
          depends on `listing.is_published`, which an admin flips — and a cached
          copy is never asked again, so `immutable` would mean unpublishing a
          car retracts nothing for up to twelve months from any browser or
          shared cache that already has it. `/api/media/[key]` may cache for a
          year because those objects are unconditionally public; this one is
          not. A draft's bytes, which only an admin can be reading, are never
          stored by a shared cache at all.
        */
        "Cache-Control": file.isPublic
          ? "public, max-age=300, must-revalidate"
          : "private, no-store",
        // The bytes are an image and nothing else may be made of them: no
        // scripts, no frames, no subresources. Both existing image routes set
        // the same pair, and they are what make serving user-supplied bytes
        // same-origin safe.
        "Content-Security-Policy": "default-src 'none'; sandbox",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    // Deliberately NOT `errorResponse`: this route answers with image bytes or
    // with nothing, and a JSON error body served as a 500 under an <img> is
    // noise in the console rather than information. A real fault is logged
    // server-side — `readCarPhotoForViewer` already logs a missing object
    // loudly — and the browser is told the same "not found" either way.
    logger.warn("car photo route failed", {
      photoId,
      error: error instanceof Error ? error.message : String(error),
    });
    return new Response("Not found", { status: 404 });
  }
}
