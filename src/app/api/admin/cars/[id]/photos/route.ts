import { NextRequest } from "next/server";

import { getAuthenticatedUser } from "@/features/auth/services/auth.service";
import { requireAuth, requireAdmin } from "@/lib/auth/guards";
import { APIError, successResponse, errorResponse } from "@/lib/auth/api-helpers";
import { checkRateLimit } from "@/lib/rate-limit";
import { RATE_LIMIT } from "@/config/security";
import { MAX_UPLOAD_BYTES } from "@/features/media/services/image-upload";
import { carIdSchema, carPhotoUploadSchema, reorderCarPhotosSchema } from "@/features/cars/schema";
import {
  MAX_PHOTOS_PER_UPLOAD,
  listCarPhotosForAdmin,
  removeCarPhoto,
  reorderCarPhotos,
  uploadCarPhotos,
} from "@/features/cars/services/car-photos.service";

/**
 * The photographs on one car listing (migration 067).
 *
 * MULTIPART, like `/api/admin/orders/[id]/photos` and
 * `/api/admin/builder/[key]` — a car shoot is a dozen 4MB frames off a phone,
 * and base64 in a JSON body would inflate each of them by a third on a
 * connection that is already the slow part. `file` may repeat: a listing is
 * photographed in one sitting and the admin should not have to send them one at
 * a time.
 *
 * WHAT THIS ROUTE DOES NOT DO: decide anything about the image. The type, the
 * dimensions and the byte size are measured by sharp after a full re-encode
 * inside `features/media/services/image-upload`, and nothing the browser claims
 * about the file is believed — not its `Content-Type`, not its filename (the
 * object name is random), not its reported size beyond the cheap pre-check
 * below. That pipeline is shared with the other two upload paths in the platform
 * precisely so there is one of it to get right.
 *
 * Auth, rate limit, validation and status codes only.
 */

function carId(raw: string): string {
  const parsed = carIdSchema.safeParse(raw);
  if (!parsed.success) throw new APIError(404, "Car listing not found");
  return parsed.data;
}

/** Form values arrive as strings; only an explicit "false" opts out. */
function readBoolean(raw: FormDataEntryValue | null): boolean | undefined {
  if (typeof raw !== "string" || raw.length === 0) return undefined;
  return raw !== "false" && raw !== "0";
}

/** GET — every photo on this listing, in gallery order. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ip = request.headers.get("x-forwarded-for") ?? "unknown";
    if (!checkRateLimit(`admin-car-photos-read:${ip}`, RATE_LIMIT.admin).allowed) {
      throw new APIError(429, "Too many requests");
    }

    const user = await getAuthenticatedUser();
    const auth = requireAuth(user);
    requireAdmin(auth);

    const { id } = await params;
    return successResponse({ photos: await listCarPhotosForAdmin(carId(id)) });
  } catch (error) {
    return errorResponse(error);
  }
}

/** POST — upload one or more photographs of this car. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ip = request.headers.get("x-forwarded-for") ?? "unknown";
    if (!checkRateLimit(`admin-car-photos:${ip}`, RATE_LIMIT.admin).allowed) {
      throw new APIError(429, "Too many requests");
    }

    const user = await getAuthenticatedUser();
    const auth = requireAuth(user);
    const admin = requireAdmin(auth);

    const { id } = await params;

    const form = await request.formData().catch(() => {
      throw new APIError(400, "Expected a multipart upload");
    });

    const files = form.getAll("file").filter((entry): entry is File => entry instanceof File);
    if (files.length === 0) throw new APIError(400, "No photo was uploaded.");
    // A ceiling as well as a floor, for the reason the parcel-photo route gives:
    // each file is buffered whole and pushed through sharp, and an admin who
    // selects an entire shoot sends files that each pass the 12MB guard and
    // together exhaust a function with about a gigabyte — part-written, some
    // objects and rows already committed.
    if (files.length > MAX_PHOTOS_PER_UPLOAD) {
      throw new APIError(
        400,
        `That is more than ${MAX_PHOTOS_PER_UPLOAD} photos at once. Send them in smaller batches.`,
      );
    }
    for (const file of files) {
      // Cheap guard BEFORE buffering the whole thing into memory. `file.size` is
      // the browser's claim and is not trusted downstream — `encodeImageUpload`
      // checks the real byte length again — but a claim of 400MB is enough to
      // refuse without reading it.
      if (file.size > MAX_UPLOAD_BYTES) {
        throw new APIError(
          413,
          `Image is larger than ${Math.floor(MAX_UPLOAD_BYTES / 1024 / 1024)}MB.`,
        );
      }
    }

    const altText = form.get("alt_text");
    const cover = readBoolean(form.get("is_cover"));
    const parsed = carPhotoUploadSchema.safeParse({
      ...(typeof altText === "string" && altText.trim().length > 0 ? { alt_text: altText } : {}),
      ...(cover !== undefined ? { is_cover: cover } : {}),
    });
    if (!parsed.success) {
      throw new APIError(400, parsed.error.issues[0]?.message ?? "Invalid input");
    }

    const bytes = await Promise.all(
      files.map(async (file) => Buffer.from(await file.arrayBuffer())),
    );

    const photos = await uploadCarPhotos(
      { id: admin.id, email: admin.email ?? null },
      {
        carListingId: carId(id),
        files: bytes,
        altText: parsed.data.alt_text ?? null,
        makeCover: parsed.data.is_cover,
      },
    );

    return successResponse({ photos }, 201);
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * PUT — rearrange the gallery, and optionally move the cover.
 *
 * The whole list in its new order, not a swap: replaying a dropped request then
 * produces the same arrangement rather than undoing itself.
 */
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ip = request.headers.get("x-forwarded-for") ?? "unknown";
    if (!checkRateLimit(`admin-car-photos:${ip}`, RATE_LIMIT.admin).allowed) {
      throw new APIError(429, "Too many requests");
    }

    const user = await getAuthenticatedUser();
    const auth = requireAuth(user);
    const admin = requireAdmin(auth);

    const { id } = await params;

    const body: unknown = await request.json().catch(() => {
      throw new APIError(400, "Invalid JSON");
    });

    const parsed = reorderCarPhotosSchema.safeParse(body);
    if (!parsed.success) {
      throw new APIError(400, parsed.error.issues[0]?.message ?? "Invalid input");
    }

    const photos = await reorderCarPhotos(
      { id: admin.id, email: admin.email ?? null },
      carId(id),
      parsed.data.photo_ids,
      parsed.data.cover_photo_id ?? null,
    );

    return successResponse({ photos });
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * DELETE — remove one photograph. `?photo_id=` names it.
 *
 * A query parameter rather than another path segment because this is the only
 * thing that is ever deleted here and a `[photoId]` directory would be a file
 * containing one handler. The photo must belong to the listing in the path; the
 * service checks that, so a mistyped URL cannot delete a picture from another
 * car and audit it against the wrong one.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ip = request.headers.get("x-forwarded-for") ?? "unknown";
    if (!checkRateLimit(`admin-car-photos:${ip}`, RATE_LIMIT.admin).allowed) {
      throw new APIError(429, "Too many requests");
    }

    const user = await getAuthenticatedUser();
    const auth = requireAuth(user);
    const admin = requireAdmin(auth);

    const { id } = await params;
    const photoId = request.nextUrl.searchParams.get("photo_id");
    if (!photoId) throw new APIError(400, "Which photo?");

    await removeCarPhoto({ id: admin.id, email: admin.email ?? null }, carId(id), photoId);

    return successResponse({ id: photoId });
  } catch (error) {
    return errorResponse(error);
  }
}
