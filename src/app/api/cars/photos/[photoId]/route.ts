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
 *     sends to somebody who has never signed in, and the picture has to load
 *     for them. Reading the session is therefore not a gate — see the body.
 *
 *   * Like the parcel route, IT RE-CHECKS ON EVERY REQUEST. The check here is
 *     the listing's publish state, not ownership. An admin uploads photographs
 *     of a car while its price is still being agreed, and those must not be
 *     readable by anyone who guesses a URL; unpublishing has to take the
 *     pictures down in the same instant. The check therefore cannot be done once
 *     by the page that embedded the image — it is done here, per request, by
 *     `readCarPhotoForViewer`.
 *
 * THE CACHE HEADER IS SHORT FOR THAT REASON. `/api/media/[key]` may cache for a
 * year because its objects are unconditionally public; this route's answer
 * changes the moment an admin unpublishes, and a cached copy is never asked
 * again. A year with `immutable` would have meant unpublishing retracted
 * nothing for twelve months from any cache that already held the bytes. Five
 * minutes with `must-revalidate` keeps it cheap and keeps unpublish meaningful;
 * a draft's bytes are `private, no-store` and never enter a shared cache.
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
    /*
      SIGNED OUT IS THE NORMAL CASE HERE, NOT AN ERROR. `getUserSession()`
      THROWS a 401 when there is no session, and this handler answers every
      throw with a 404 — so reading the session eagerly turned the public route
      its own doc comment describes into one that refused every anonymous
      caller, and every car photograph on the site went blank.

      It broke signed-in viewers too, which is what makes it worth this many
      lines: `/_next/image` re-fetches the source server-side WITHOUT the
      browser's cookies, so the optimizer's own request was anonymous even when
      the person looking at the page was not. Only the admin photo manager
      escaped it, because that one renders a plain `<img>`.

      The session is a privilege check and nothing more: whether the bytes may
      be served at all is decided from the row, by `readCarPhotoForViewer`.
      Absence of a session means "not an admin", never "no".
    */
    const session = await getUserSession()
      .then((resolved) => resolved.session)
      .catch(() => null);

    const file = await readCarPhotoForViewer(photoId, {
      isAdmin: session != null && canAccessAdmin(session),
    });

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
