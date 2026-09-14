import "server-only";

import {
  deleteOrderPhoto,
  getOrderPhoto,
  getOrderPhotoContext,
  insertOrderPhoto,
  listOrderPhotos,
  type OrderPhotoKind,
  type OrderPhotoRow,
} from "@/db/queries/order-photos";
import { getOrderOwner } from "@/db/queries/orders";
import { AUDIT_ACTOR_ROLES, AUDIT_ENTITY_TYPES } from "@/config/constants";
import { logAuditEvent } from "@/features/audit/services/audit.service";
import { notifyParcelPhotoAdded } from "@/features/journeys/services/parcel-photo-notify.service";
import { MediaValidationError } from "@/features/media/services/image-upload";
import {
  deleteParcelPhoto,
  encodeParcelPhoto,
  putParcelPhoto,
  readParcelPhoto,
} from "@/features/media/services/parcel-photos.service";
import { APIError } from "@/lib/auth/api-helpers";
import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";
import { toOrderPhotoView, type OrderPhotoView } from "../types";

/**
 * Parcel photographs — the admin writes them, the customer reads them (054).
 *
 * This is the first point in the product where a customer sees what was actually
 * BOUGHT rather than what they asked for, so two things below are load-bearing
 * rather than tidy:
 *
 *  - EVERY ADMIN WRITE IS AUDITED. An upload and a deletion are both state
 *    changes on someone's order — the second one destroys evidence in a dispute
 *    — and CLAUDE.md does not permit either without an `audit_logs` row.
 *
 *  - THE ORDER ID COMES FROM THE SERVER. The storage key is built from the order
 *    the route authorised, never from anything the browser sent, and the
 *    database CHECKs the same rule from its side. See
 *    `features/media/services/parcel-photos.service.ts`.
 *
 * Layering: routes authenticate, rate-limit and shape responses; the reads and
 * writes are `db/queries/order-photos`; nothing here touches an HTTP object.
 */

/** Who did it. Resolved by the route from the admin session. */
export interface PhotoActor {
  id: string;
  email: string | null;
}

/** Who is looking. `isAdmin` is the route's `canAccessAdmin` answer. */
export interface PhotoViewer {
  id: string;
  isAdmin: boolean;
}

export interface UploadOrderPhotosInput {
  orderId: string;
  /** Re-encoded by the storage service; these are the raw uploaded bytes. */
  files: Buffer[];
  kind?: OrderPhotoKind;
  caption?: string | null;
  eventId?: string | null;
  /** False files the picture internally without showing the customer. */
  isCustomerVisible?: boolean;
}

// ── Admin writes ────────────────────────────────────────────────────────────

/**
 * Store one arrival's photographs and record them against the order.
 *
 * SEVERAL AT ONCE, on purpose: an operator photographing a parcel takes the
 * front, the label and the damaged corner within the same minute, and the
 * customer should be told once rather than three times — `notifyParcelPhotoAdded`
 * is written for exactly that batch.
 *
 * EVERY FILE IS VALIDATED BEFORE ANY OF THEM IS STORED (see below). A failure
 * after that point — storage, or the insert — keeps the photos that already
 * landed, because they are real photographs of a real parcel; each row is
 * written and audited individually, so the audit log says precisely how far the
 * batch got.
 */
export async function uploadOrderPhotos(
  actor: PhotoActor,
  input: UploadOrderPhotosInput,
): Promise<OrderPhotoView[]> {
  if (input.files.length === 0) {
    throw new APIError(400, "No photo was uploaded.");
  }

  // Before a single byte is stored: the order must exist. The foreign key would
  // catch it a moment later, but only after the object was written into a
  // prefix no row will ever name, and nothing would ever find it again.
  const order = await getOrderPhotoContext(input.orderId);
  if (!order) throw new APIError(404, "Order not found");

  // Validate and re-encode EVERYTHING first. The usual failure is a PDF or a
  // screenshot in the middle of the selection, and refusing the whole request
  // before a single object is written leaves nothing half-uploaded for the
  // operator to clean up. A bad file is their mistake, not a server fault.
  let encoded;
  try {
    encoded = await Promise.all(input.files.map((bytes) => encodeParcelPhoto(order.id, bytes)));
  } catch (error) {
    if (error instanceof MediaValidationError) throw new APIError(422, error.message);
    throw error;
  }

  const stored: OrderPhotoRow[] = [];
  for (const image of encoded) {
    const object = await putParcelPhoto(order.id, image);

    // The bytes are in the bucket. If the row fails to write, nothing will ever
    // reference them and no code path can find them again, so clean up before
    // surfacing the error rather than leaking a multi-megabyte object.
    let row: OrderPhotoRow;
    try {
      row = await insertOrderPhoto({
        order_id: order.id,
        storage_path: object.storagePath,
        width: object.width,
        height: object.height,
        byte_size: object.byteSize,
        kind: input.kind ?? "hub_received",
        caption: input.caption ?? null,
        event_id: input.eventId ?? null,
        is_customer_visible: input.isCustomerVisible ?? true,
        uploaded_by: actor.id,
      });
    } catch (error) {
      await deleteParcelPhoto(object.storagePath);
      throw error;
    }

    stored.push(row);

    await logAuditEvent({
      actorId: actor.id,
      actorRole: AUDIT_ACTOR_ROLES.ADMIN,
      action: "order_photo_uploaded",
      entityType: AUDIT_ENTITY_TYPES.ORDER_PHOTO,
      entityId: row.id,
      metadata: {
        table: "order_photos",
        orderId: order.id,
        orderNo: order.order_no,
        storagePath: row.storage_path,
        kind: row.kind,
        width: row.width,
        height: row.height,
        byteSize: row.byte_size,
        isCustomerVisible: row.is_customer_visible,
        actorEmail: actor.email,
      },
    });
  }

  // One message for the batch, and only for pictures the customer can actually
  // open. The notifier swallows its own failures — the photos are already
  // stored and must not be undone by an email that would not send.
  //
  // WHY THE EXTRA CATCH. `notifyParcelPhotoAdded` deliberately RETHROWS one
  // class of error — a missing relation, meaning a deploy ran ahead of its
  // migrations — so that case is loud rather than silent. That is right at its
  // other call site, where the throw lands on a job row that is retried
  // harmlessly. It is wrong HERE: by this line the objects are in the bucket and
  // the rows are committed, so letting it out turns a successful upload into a
  // 500, and the operator's reasonable response — upload the photos again —
  // duplicates every picture on the customer's journey with no way to tell the
  // copies apart. The deploy-order problem still surfaces, one line earlier and
  // far more clearly, when `insertOrderPhoto` cannot find `order_photos`.
  try {
    await notifyParcelPhotoAdded({
      orderId: order.id,
      userId: order.user_id,
      orderNo: order.order_no ?? "",
      productName: order.product_name,
      photoCount: stored.filter((row) => row.is_customer_visible).length,
    });
  } catch (error) {
    logger.error("parcel photo: stored, but the customer could not be told", {
      orderId: order.id,
      photoCount: stored.length,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  return stored.map(toOrderPhotoView);
}

/**
 * Remove one photograph: the row first, then the object it named.
 *
 * `orderId` is the route's path segment and the photo must belong to it — a
 * photo id alone would let an admin delete a picture from a different order by
 * typing the wrong URL, and the audit entry would name the wrong parcel.
 *
 * The row goes first deliberately. A failure between the two leaves an orphaned
 * object nobody can reach, which is recoverable; the other order leaves a row
 * whose picture 404s on the customer's screen, which is not.
 */
export async function removeOrderPhoto(
  actor: PhotoActor,
  orderId: string,
  photoId: string,
): Promise<OrderPhotoView> {
  const existing = await getOrderPhoto(photoId);
  if (!existing || existing.order_id !== orderId) {
    throw new APIError(404, "Photo not found");
  }

  const row = await deleteOrderPhoto(photoId);
  if (!row) throw new APIError(404, "Photo not found");

  await deleteParcelPhoto(row.storage_path);

  await logAuditEvent({
    actorId: actor.id,
    actorRole: AUDIT_ACTOR_ROLES.ADMIN,
    action: "order_photo_deleted",
    entityType: AUDIT_ENTITY_TYPES.ORDER_PHOTO,
    entityId: row.id,
    // `audit_logs` is append-only and is the only remaining trace of a photo
    // that no longer exists, so it keeps a description of what went.
    metadata: {
      table: "order_photos",
      orderId: row.order_id,
      storagePath: row.storage_path,
      kind: row.kind,
      caption: row.caption,
      byteSize: row.byte_size,
      takenAt: row.taken_at,
      wasCustomerVisible: row.is_customer_visible,
      actorEmail: actor.email,
    },
  });

  return toOrderPhotoView(row);
}

// ── Reads ───────────────────────────────────────────────────────────────────

/** Every photo on an order, internal ones included. Admin console only. */
export async function listOrderPhotosForAdmin(orderId: string): Promise<OrderPhotoView[]> {
  return (await listOrderPhotos(orderId)).map(toOrderPhotoView);
}

/**
 * The customer-visible photos of an order.
 *
 * TRUSTS THE ORDER ID IT IS GIVEN — the journey detail screen has already
 * established ownership through `getOrder`, exactly as `mapCustomerOrderEvents`
 * is trusted by the journeys list, which is why this one is not exposed through
 * a route of its own. Anything reached by URL goes through
 * `readOrderPhotoForViewer` below, which re-checks the caller itself.
 *
 * NEVER THROWS. A photograph is an addition to the journey screen; failing the
 * whole page because the attachment store hiccuped would be a worse outcome
 * than a screen with no pictures on it.
 */
export async function listVisibleOrderPhotos(orderId: string): Promise<OrderPhotoView[]> {
  try {
    const rows = await listOrderPhotos(orderId, { customerVisibleOnly: true });
    return rows.map(toOrderPhotoView);
  } catch (error) {
    logger.warn("parcel photos unavailable", {
      orderId,
      error: error instanceof Error ? error.message : String(error),
    });
    return [];
  }
}

/**
 * The bytes of one photograph, for a caller who has proved they may see it.
 *
 * THE WHOLE POINT OF THE PRIVATE BUCKET. The row is found first, the order it
 * belongs to is checked against the caller, and an internal-only photo is
 * refused to anyone who is not an admin — so a URL that leaks is not a photo
 * that leaks. Every refusal is the same 404: which of the three checks failed is
 * not the caller's business.
 */
export async function readOrderPhotoForViewer(
  viewer: PhotoViewer,
  photoId: string,
): Promise<{ body: ArrayBuffer; contentType: string }> {
  const photo = await getOrderPhoto(photoId);
  if (!photo) throw new APIError(404, "Photo not found");

  if (!viewer.isAdmin) {
    if (!photo.is_customer_visible) throw new APIError(404, "Photo not found");

    const order = await getOrderOwner(createAdminClient(), photo.order_id);
    if (!order || order.user_id !== viewer.id) throw new APIError(404, "Photo not found");
  }

  const file = await readParcelPhoto(photo.storage_path);
  // The row says there is a picture and the object is gone: a real fault, not a
  // "you may not see this". Logged loudly, answered as 404 to the browser.
  if (!file) {
    logger.error("parcel photo object missing", {
      photoId: photo.id,
      orderId: photo.order_id,
      storagePath: photo.storage_path,
    });
    throw new APIError(404, "Photo not found");
  }

  return file;
}
