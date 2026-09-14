import { NextRequest } from "next/server";

import { getUserSession } from "@/features/auth/services/auth.service";
import { canAccessAdmin } from "@/lib/auth/admin-access";
import { readOrderPhotoForViewer } from "@/features/order-photos/services/order-photos.service";
import { APIError, errorResponse } from "@/lib/auth/api-helpers";
import { checkRateLimit } from "@/lib/rate-limit";
import { RATE_LIMIT } from "@/config/security";

/**
 * GET /api/order-photos/:photoId — the bytes of one parcel photograph.
 *
 * The `parcel-photos` bucket is private and stays private: this is the only
 * door its objects have. Modelled on `/api/media/[key]`, which streams from
 * storage with the service role — with the difference that makes this route
 * worth writing rather than reusing that one:
 *
 *   EVERY REQUEST IS RE-AUTHORISED. Not the page that embedded the image, not a
 *   signed URL minted once — this request, against this photo. The service
 *   finds the row, checks the order against the caller, and refuses an
 *   internal-only picture to anyone who is not an admin. A leaked URL is
 *   therefore not a leaked photo, which is the promise migration 054 makes.
 *
 * Every refusal is a 404. Which of the checks failed is not the caller's
 * business, and a 403 would confirm that the photo exists.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ photoId: string }> },
) {
  try {
    const ip = request.headers.get("x-forwarded-for") ?? "unknown";
    if (!checkRateLimit(`order-photo:${ip}`, RATE_LIMIT.parcelPhotos).allowed) {
      throw new APIError(429, "Too many requests");
    }

    const { session, user } = await getUserSession();
    const { photoId } = await params;

    const file = await readOrderPhotoForViewer(
      { id: user.id, isAdmin: canAccessAdmin(session) },
      photoId,
    );

    return new Response(file.body, {
      status: 200,
      headers: {
        "Content-Type": file.contentType,
        // A photograph of one named customer's property. `no-store` keeps it
        // out of shared caches and out of the disk cache of a shared machine,
        // and means a photo an operator later hides stops being readable at
        // once rather than when a cache entry happens to expire.
        "Cache-Control": "private, no-store, max-age=0",
        "Content-Security-Policy": "default-src 'none'; sandbox",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
