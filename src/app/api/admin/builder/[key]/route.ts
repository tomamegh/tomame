import { NextRequest } from "next/server";
import { z } from "zod";

import { getAuthenticatedUser } from "@/features/auth/services/auth.service";
import { requireAuth, requireAdmin } from "@/lib/auth/guards";
import { APIError, successResponse, errorResponse } from "@/lib/auth/api-helpers";
import { checkRateLimit } from "@/lib/rate-limit";
import { RATE_LIMIT } from "@/config/security";
import { logAuditEvent } from "@/features/audit/services/audit.service";
import { isBuilderEnabled } from "@/config/builder";
import {
  MediaValidationError,
  deleteStoredImage,
  isMarketingImageKey,
  normalisePosition,
  storeUploadedImage,
  MAX_UPLOAD_BYTES,
} from "@/features/media/services/media.service";
import {
  deleteMediaOverride,
  getMediaOverride,
  upsertMediaOverride,
} from "@/db/queries/media-overrides";

/**
 * Builder write endpoints: replace an image, re-crop it, or reset it.
 *
 * Guarded three ways on every verb, in this order:
 *   1. isBuilderEnabled() — off in production unless deliberately switched on.
 *      Returns 404, not 403, so a disabled deployment does not advertise that
 *      the route exists.
 *   2. admin role — the flag is a deployment switch, never authentication.
 *   3. rate limit — upload decodes images, which is expensive.
 * Every mutation is written to audit_logs, as CLAUDE.md requires.
 */

async function authorise(request: NextRequest, key: string, bucket: string) {
  if (!isBuilderEnabled()) throw new APIError(404, "Not found");

  if (!isMarketingImageKey(key)) {
    throw new APIError(404, "Unknown image key");
  }
  // Narrowed here so callers get MarketingImageKey, not string.
  const imageKey = key;

  const ip = request.headers.get("x-forwarded-for") ?? "unknown";
  if (!checkRateLimit(`${bucket}:${ip}`, RATE_LIMIT.admin).allowed) {
    throw new APIError(429, "Too many requests");
  }

  const user = await getAuthenticatedUser();
  const auth = requireAuth(user);
  requireAdmin(auth);
  return { user: auth, key: imageKey };
}

/** POST — upload a replacement image for this slot. */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ key: string }> },
) {
  try {
    const { key } = await params;
    const { user, key: imageKey } = await authorise(request, key, "builder-upload");

    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      throw new APIError(400, "No file was uploaded.");
    }
    // Cheap guard before buffering the whole thing into memory.
    if (file.size > MAX_UPLOAD_BYTES) {
      throw new APIError(
        413,
        `Image is larger than ${Math.floor(MAX_UPLOAD_BYTES / 1024 / 1024)}MB.`,
      );
    }

    const bytes = Buffer.from(await file.arrayBuffer());

    let stored;
    try {
      stored = await storeUploadedImage(imageKey, bytes);
    } catch (error) {
      if (error instanceof MediaValidationError) {
        throw new APIError(422, error.message);
      }
      throw error;
    }

    const previous = await getMediaOverride(imageKey);

    // The bytes are already in the bucket. If the row fails to write, nothing
    // will ever reference them and no code path can find them again, so clean
    // up before surfacing the error rather than leaking a multi-megabyte object.
    let row;
    try {
      row = await upsertMediaOverride({
        key: imageKey,
        storage_path: stored.storagePath,
        width: stored.width,
        height: stored.height,
        content_type: stored.contentType,
        byte_size: stored.byteSize,
        updated_by: user.id,
      });
    } catch (error) {
      await deleteStoredImage(stored.storagePath);
      throw error;
    }

    // Only after the row points at the new object — otherwise a failure here
    // would leave the page referencing bytes we already deleted.
    if (previous?.storage_path && previous.storage_path !== stored.storagePath) {
      await deleteStoredImage(previous.storage_path);
    }

    await logAuditEvent({
      actorId: user.id,
      actorRole: "admin",
      action: "media.image_replaced",
      entityType: "store",
      // entity_id is a UUID column and an image key is not a UUID. Passing one
      // made every insert fail with 22P02, and logAuditEvent swallows failures
      // by design, so the mutation succeeded while nothing was recorded. The
      // key travels in metadata instead, queryable as metadata->>'image_key'.
      entityId: null,
      metadata: {
        image_key: imageKey,
        storage_path: stored.storagePath,
        width: stored.width,
        height: stored.height,
        byte_size: stored.byteSize,
        replaced: previous?.storage_path ?? null,
      },
    });

    return successResponse({ override: row });
  } catch (error) {
    return errorResponse(error);
  }
}

const patchSchema = z.object({
  position: z.string().min(1).max(40),
  alt: z.string().max(300).optional(),
});

/** PATCH — save the crop (and optionally the alt text) for this slot. */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ key: string }> },
) {
  try {
    const { key } = await params;
    const { user, key: imageKey } = await authorise(request, key, "builder-crop");

    const parsed = patchSchema.safeParse(await request.json());
    if (!parsed.success) {
      throw new APIError(400, parsed.error.issues[0]?.message ?? "Invalid input");
    }

    let position: string;
    try {
      position = normalisePosition(parsed.data.position);
    } catch (error) {
      throw new APIError(
        422,
        error instanceof MediaValidationError ? error.message : "Invalid crop",
      );
    }

    const row = await upsertMediaOverride({
      key: imageKey,
      position,
      ...(parsed.data.alt !== undefined ? { alt: parsed.data.alt } : {}),
      updated_by: user.id,
    });

    await logAuditEvent({
      actorId: user.id,
      actorRole: "admin",
      action: "media.crop_updated",
      entityType: "store",
      entityId: null,
      metadata: { image_key: imageKey, position, alt: parsed.data.alt ?? null },
    });

    return successResponse({ override: row });
  } catch (error) {
    return errorResponse(error);
  }
}

/** DELETE — drop the override, restoring the built-in manifest default. */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ key: string }> },
) {
  try {
    const { key } = await params;
    const { user, key: imageKey } = await authorise(request, key, "builder-reset");

    const previous = await getMediaOverride(imageKey);
    await deleteMediaOverride(imageKey);
    if (previous?.storage_path) {
      await deleteStoredImage(previous.storage_path);
    }

    await logAuditEvent({
      actorId: user.id,
      actorRole: "admin",
      action: "media.override_reset",
      entityType: "store",
      entityId: null,
      metadata: { image_key: imageKey, removed: previous?.storage_path ?? null },
    });

    return successResponse({ reset: true });
  } catch (error) {
    return errorResponse(error);
  }
}
