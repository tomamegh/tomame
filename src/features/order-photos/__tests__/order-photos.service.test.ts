import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ kind: "admin" }) }));
vi.mock("@/features/audit/services/audit.service", () => ({
  logAuditEvent: vi.fn(async () => undefined),
}));
vi.mock("@/features/journeys/services/parcel-photo-notify.service", () => ({
  notifyParcelPhotoAdded: vi.fn(async () => "notified"),
}));
vi.mock("@/db/queries/orders", () => ({ getOrderOwner: vi.fn() }));
vi.mock("@/db/queries/order-photos", () => ({
  insertOrderPhoto: vi.fn(),
  listOrderPhotos: vi.fn(),
  getOrderPhoto: vi.fn(),
  deleteOrderPhoto: vi.fn(),
  getOrderPhotoContext: vi.fn(),
}));
vi.mock("@/features/media/services/image-upload", async () => {
  class MediaValidationError extends Error {}
  return { MediaValidationError };
});
vi.mock("@/features/media/services/parcel-photos.service", () => ({
  encodeParcelPhoto: vi.fn(),
  putParcelPhoto: vi.fn(),
  readParcelPhoto: vi.fn(),
  deleteParcelPhoto: vi.fn(async () => undefined),
}));

import * as q from "@/db/queries/order-photos";
import { getOrderOwner } from "@/db/queries/orders";
import { logAuditEvent } from "@/features/audit/services/audit.service";
import { notifyParcelPhotoAdded } from "@/features/journeys/services/parcel-photo-notify.service";
import { MediaValidationError } from "@/features/media/services/image-upload";
import {
  deleteParcelPhoto,
  encodeParcelPhoto,
  putParcelPhoto,
  readParcelPhoto,
} from "@/features/media/services/parcel-photos.service";
import {
  listVisibleOrderPhotos,
  readOrderPhotoForViewer,
  removeOrderPhoto,
  uploadOrderPhotos,
} from "../services/order-photos.service";

const ORDER = "7d0a9c6e-0e7a-4c2b-9c5d-1d2e3f4a5b6c";
const OTHER_ORDER = "11111111-2222-3333-4444-555555555555";
const ACTOR = { id: "admin-1", email: "ops@tomame.test" };

const encoded = {
  data: Buffer.from("webp"),
  width: 1200,
  height: 900,
  byteSize: 4,
  contentType: "image/webp" as const,
};

const photo = (over: Partial<q.OrderPhotoRow> = {}): q.OrderPhotoRow => ({
  id: "photo-1",
  order_id: ORDER,
  event_id: null,
  kind: "hub_received",
  storage_path: `orders/${ORDER}/aaaabbbbccccdddd.webp`,
  content_type: "image/webp",
  width: 1200,
  height: 900,
  byte_size: 4,
  caption: "Front of box, seal intact",
  is_customer_visible: true,
  taken_at: "2026-09-12T10:00:00Z",
  uploaded_by: "admin-1",
  created_at: "2026-09-12T10:00:00Z",
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(q.getOrderPhotoContext).mockResolvedValue({
    id: ORDER,
    user_id: "u1",
    order_no: "TM-00042",
    product_name: "Nike Air Max",
  });
  vi.mocked(encodeParcelPhoto).mockResolvedValue(encoded);
  vi.mocked(putParcelPhoto).mockImplementation(async (orderId) => ({
    storagePath: `orders/${orderId}/aaaabbbbccccdddd.webp`,
    width: 1200,
    height: 900,
    byteSize: 4,
    contentType: "image/webp",
  }));
  vi.mocked(q.insertOrderPhoto).mockImplementation(async (input) =>
    photo({ order_id: input.order_id, storage_path: input.storage_path }),
  );
  vi.mocked(q.listOrderPhotos).mockResolvedValue([photo()]);
  vi.mocked(q.getOrderPhoto).mockResolvedValue(photo());
  vi.mocked(q.deleteOrderPhoto).mockResolvedValue(photo());
  vi.mocked(readParcelPhoto).mockResolvedValue({
    body: new ArrayBuffer(4),
    contentType: "image/webp",
  });
});

describe("uploadOrderPhotos", () => {
  // The storage key must come from the server's own order id — never from
  // anything the browser sent — because the serving route authorises by order.
  it("builds the key under the given order's prefix and records what was written", async () => {
    const views = await uploadOrderPhotos(ACTOR, {
      orderId: ORDER,
      files: [Buffer.from("raw")],
    });

    expect(putParcelPhoto).toHaveBeenCalledWith(ORDER, encoded);
    expect(q.insertOrderPhoto).toHaveBeenCalledWith(
      expect.objectContaining({
        order_id: ORDER,
        storage_path: `orders/${ORDER}/aaaabbbbccccdddd.webp`,
        width: 1200,
        height: 900,
        byte_size: 4,
        kind: "hub_received",
        is_customer_visible: true,
        uploaded_by: "admin-1",
      }),
    );
    expect(views[0]?.url).toBe("/api/order-photos/photo-1");
  });

  // CLAUDE.md: every state change on someone's order writes to audit_logs.
  it("audits every photo it stores", async () => {
    await uploadOrderPhotos(ACTOR, {
      orderId: ORDER,
      files: [Buffer.from("a"), Buffer.from("b")],
    });

    expect(logAuditEvent).toHaveBeenCalledTimes(2);
    expect(logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: "admin-1",
        actorRole: "admin",
        action: "order_photo_uploaded",
        entityType: "order_photo",
        entityId: "photo-1",
        metadata: expect.objectContaining({
          orderId: ORDER,
          storagePath: `orders/${ORDER}/aaaabbbbccccdddd.webp`,
          isCustomerVisible: true,
          actorEmail: "ops@tomame.test",
        }),
      }),
    );
  });

  // Three pictures of one arrival is one piece of news, not three.
  it("tells the customer once per batch, counting only visible photos", async () => {
    await uploadOrderPhotos(ACTOR, {
      orderId: ORDER,
      files: [Buffer.from("a"), Buffer.from("b")],
    });

    expect(notifyParcelPhotoAdded).toHaveBeenCalledTimes(1);
    expect(notifyParcelPhotoAdded).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId: ORDER,
        userId: "u1",
        orderNo: "TM-00042",
        productName: "Nike Air Max",
        photoCount: 2,
      }),
    );
  });

  it("does not mail about an internal-only picture", async () => {
    vi.mocked(q.insertOrderPhoto).mockResolvedValue(photo({ is_customer_visible: false }));

    await uploadOrderPhotos(ACTOR, {
      orderId: ORDER,
      files: [Buffer.from("a")],
      isCustomerVisible: false,
    });

    expect(notifyParcelPhotoAdded).toHaveBeenCalledWith(
      expect.objectContaining({ photoCount: 0 }),
    );
  });

  it("refuses the whole batch on a bad file, storing nothing and auditing nothing", async () => {
    vi.mocked(encodeParcelPhoto).mockRejectedValue(
      new MediaValidationError("That file is not a readable image."),
    );

    await expect(
      uploadOrderPhotos(ACTOR, { orderId: ORDER, files: [Buffer.from("not-an-image")] }),
    ).rejects.toMatchObject({ statusCode: 422 });
    expect(putParcelPhoto).not.toHaveBeenCalled();
    expect(q.insertOrderPhoto).not.toHaveBeenCalled();
    expect(logAuditEvent).not.toHaveBeenCalled();
  });

  it("404s an order that does not exist before any byte is stored", async () => {
    vi.mocked(q.getOrderPhotoContext).mockResolvedValue(null);

    await expect(
      uploadOrderPhotos(ACTOR, { orderId: ORDER, files: [Buffer.from("a")] }),
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(encodeParcelPhoto).not.toHaveBeenCalled();
  });

  // A stored object no row points at is unreachable and unbillable-to-nobody.
  it("removes the object when the row fails to write", async () => {
    vi.mocked(q.insertOrderPhoto).mockRejectedValue(new Error("insert failed"));

    await expect(
      uploadOrderPhotos(ACTOR, { orderId: ORDER, files: [Buffer.from("a")] }),
    ).rejects.toThrow("insert failed");
    expect(deleteParcelPhoto).toHaveBeenCalledWith(`orders/${ORDER}/aaaabbbbccccdddd.webp`);
    expect(logAuditEvent).not.toHaveBeenCalled();
  });
});

describe("removeOrderPhoto", () => {
  it("deletes the row, removes the object and audits what went", async () => {
    await removeOrderPhoto(ACTOR, ORDER, "photo-1");

    expect(q.deleteOrderPhoto).toHaveBeenCalledWith("photo-1");
    expect(deleteParcelPhoto).toHaveBeenCalledWith(`orders/${ORDER}/aaaabbbbccccdddd.webp`);
    expect(logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        actorRole: "admin",
        action: "order_photo_deleted",
        entityType: "order_photo",
        entityId: "photo-1",
        metadata: expect.objectContaining({
          orderId: ORDER,
          caption: "Front of box, seal intact",
          wasCustomerVisible: true,
        }),
      }),
    );
  });

  // A mistyped URL must not delete a picture from a different parcel.
  it("refuses a photo that belongs to another order", async () => {
    vi.mocked(q.getOrderPhoto).mockResolvedValue(photo({ order_id: OTHER_ORDER }));

    await expect(removeOrderPhoto(ACTOR, ORDER, "photo-1")).rejects.toMatchObject({
      statusCode: 404,
    });
    expect(q.deleteOrderPhoto).not.toHaveBeenCalled();
    expect(logAuditEvent).not.toHaveBeenCalled();
  });
});

describe("readOrderPhotoForViewer — a leaked URL is not a leaked photo", () => {
  it("serves the owner their own photo", async () => {
    vi.mocked(getOrderOwner).mockResolvedValue({ id: ORDER, user_id: "u1" });

    await expect(
      readOrderPhotoForViewer({ id: "u1", isAdmin: false }, "photo-1"),
    ).resolves.toMatchObject({ contentType: "image/webp" });
  });

  it("refuses a photo the caller does not own, and never reads the bytes", async () => {
    vi.mocked(getOrderOwner).mockResolvedValue({ id: ORDER, user_id: "u1" });

    await expect(
      readOrderPhotoForViewer({ id: "someone-else", isAdmin: false }, "photo-1"),
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(readParcelPhoto).not.toHaveBeenCalled();
  });

  it("refuses an internal-only photo to the customer who owns the order", async () => {
    vi.mocked(q.getOrderPhoto).mockResolvedValue(photo({ is_customer_visible: false }));
    vi.mocked(getOrderOwner).mockResolvedValue({ id: ORDER, user_id: "u1" });

    await expect(
      readOrderPhotoForViewer({ id: "u1", isAdmin: false }, "photo-1"),
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(readParcelPhoto).not.toHaveBeenCalled();
  });

  it("serves an internal-only photo to an admin without an ownership lookup", async () => {
    vi.mocked(q.getOrderPhoto).mockResolvedValue(photo({ is_customer_visible: false }));

    await expect(
      readOrderPhotoForViewer({ id: "admin-1", isAdmin: true }, "photo-1"),
    ).resolves.toMatchObject({ contentType: "image/webp" });
    expect(getOrderOwner).not.toHaveBeenCalled();
  });

  it("404s an unknown photo id", async () => {
    vi.mocked(q.getOrderPhoto).mockResolvedValue(null);

    await expect(
      readOrderPhotoForViewer({ id: "u1", isAdmin: false }, "ghost"),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  // The row says there is a picture; the object is gone. A fault, not a refusal.
  it("404s when the object behind a real row is missing", async () => {
    vi.mocked(getOrderOwner).mockResolvedValue({ id: ORDER, user_id: "u1" });
    vi.mocked(readParcelPhoto).mockResolvedValue(null);

    await expect(
      readOrderPhotoForViewer({ id: "u1", isAdmin: false }, "photo-1"),
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe("listVisibleOrderPhotos", () => {
  it("asks for customer-visible rows only", async () => {
    const views = await listVisibleOrderPhotos(ORDER);

    expect(q.listOrderPhotos).toHaveBeenCalledWith(ORDER, { customerVisibleOnly: true });
    expect(views).toHaveLength(1);
    expect(views[0]?.url).toBe("/api/order-photos/photo-1");
  });

  // Nothing static: an order with no photograph says so with an empty list.
  it("says plainly that there are none", async () => {
    vi.mocked(q.listOrderPhotos).mockResolvedValue([]);
    await expect(listVisibleOrderPhotos(ORDER)).resolves.toEqual([]);
  });

  it("costs the pictures and not the page when the store is down", async () => {
    vi.mocked(q.listOrderPhotos).mockRejectedValue(new Error("storage down"));
    await expect(listVisibleOrderPhotos(ORDER)).resolves.toEqual([]);
  });
});
