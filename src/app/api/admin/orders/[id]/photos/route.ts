import { NextRequest } from "next/server";
import { z } from "zod";

import { getUserSession } from "@/features/auth/services/auth.service";
import { canAccessAdmin } from "@/lib/auth/admin-access";
import { MAX_UPLOAD_BYTES } from "@/features/media/services/image-upload";
import {
  listOrderPhotosForAdmin,
  uploadOrderPhotos,
} from "@/features/order-photos/services/order-photos.service";
import { APIError, successResponse, errorResponse } from "@/lib/auth/api-helpers";
import { checkRateLimit } from "@/lib/rate-limit";
import { RATE_LIMIT } from "@/config/security";

/**
 * The warehouse photograph an admin takes when a parcel reaches the US hub (054).
 *
 * MULTIPART, like `/api/admin/builder/[key]` — the operator is on a phone with a
 * camera roll, and a base64 body would inflate a 4MB photo to 5.5MB of JSON on a
 * connection that is already the slow part. `file` may repeat: one arrival is
 * usually three pictures (front, label, damage) and the customer is told about
 * them once.
 *
 * NOT BEHIND `isBuilderEnabled()`, deliberately. That flag gates the marketing
 * builder, it is off in production, and this is a production operations
 * feature — an admin photographing a parcel is the normal Tuesday, not a
 * development affordance.
 *
 * `canAccessAdmin` is the only role rule; there is no inline `role === "admin"`
 * anywhere in this file, and there must not be.
 */

/** One parcel arrival is three or four pictures, never a camera roll. */
const MAX_PHOTOS_PER_UPLOAD = 10;

const metaSchema = z.object({
  kind: z.enum(["hub_received", "packed", "damaged", "delivered", "other"]).optional(),
  caption: z.string().trim().max(500).optional(),
  event_id: z.string().uuid().optional(),
  is_customer_visible: z.boolean().optional(),
});

/** Form values arrive as strings; only "false" hides a photo. */
function readBoolean(raw: FormDataEntryValue | null): boolean | undefined {
  if (typeof raw !== "string" || raw.length === 0) return undefined;
  return raw !== "false" && raw !== "0";
}

/** POST — upload one or more photos of this order's parcel. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ip = request.headers.get("x-forwarded-for") ?? "unknown";
    if (!checkRateLimit(`admin-order-photos:${ip}`, RATE_LIMIT.admin).allowed) {
      throw new APIError(429, "Too many requests");
    }

    const { session, user } = await getUserSession();
    if (!canAccessAdmin(session)) throw new APIError(403, "Admin access required");

    const { id } = await params;

    const form = await request.formData().catch(() => {
      throw new APIError(400, "Expected a multipart upload");
    });

    const files = form.getAll("file").filter((entry): entry is File => entry instanceof File);
    if (files.length === 0) throw new APIError(400, "No photo was uploaded.");
    // A ceiling as well as a floor. Each file is buffered whole and pushed
    // through sharp, and the function has about a gigabyte: an operator who
    // picks their entire camera roll sends files that each pass the 12MB guard
    // and together exhaust the process — part-written, some objects and rows
    // already committed. One arrival is three or four pictures; ten is generous.
    if (files.length > MAX_PHOTOS_PER_UPLOAD) {
      throw new APIError(
        400,
        `That is more than ${MAX_PHOTOS_PER_UPLOAD} photos at once. Send them in smaller batches.`,
      );
    }
    for (const file of files) {
      // Cheap guard before buffering the whole thing into memory.
      if (file.size > MAX_UPLOAD_BYTES) {
        throw new APIError(
          413,
          `Image is larger than ${Math.floor(MAX_UPLOAD_BYTES / 1024 / 1024)}MB.`,
        );
      }
    }

    const caption = form.get("caption");
    const eventId = form.get("event_id");
    const kind = form.get("kind");
    const visible = readBoolean(form.get("is_customer_visible"));
    const parsed = metaSchema.safeParse({
      ...(typeof kind === "string" && kind.length > 0 ? { kind } : {}),
      ...(typeof caption === "string" && caption.trim().length > 0 ? { caption } : {}),
      ...(typeof eventId === "string" && eventId.length > 0 ? { event_id: eventId } : {}),
      ...(visible !== undefined ? { is_customer_visible: visible } : {}),
    });
    if (!parsed.success) {
      throw new APIError(400, parsed.error.issues[0]?.message ?? "Invalid input");
    }

    const bytes = await Promise.all(
      files.map(async (file) => Buffer.from(await file.arrayBuffer())),
    );

    const photos = await uploadOrderPhotos(
      { id: user.id, email: user.email ?? null },
      {
        orderId: id,
        files: bytes,
        kind: parsed.data.kind,
        caption: parsed.data.caption ?? null,
        eventId: parsed.data.event_id ?? null,
        isCustomerVisible: parsed.data.is_customer_visible,
      },
    );

    return successResponse({ photos }, 201);
  } catch (error) {
    return errorResponse(error);
  }
}

/** GET — every photo on this order, internal ones included. Admin console. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ip = request.headers.get("x-forwarded-for") ?? "unknown";
    if (!checkRateLimit(`admin-order-photos-read:${ip}`, RATE_LIMIT.admin).allowed) {
      throw new APIError(429, "Too many requests");
    }

    const { session } = await getUserSession();
    if (!canAccessAdmin(session)) throw new APIError(403, "Admin access required");

    const { id } = await params;
    return successResponse({ photos: await listOrderPhotosForAdmin(id) });
  } catch (error) {
    return errorResponse(error);
  }
}
