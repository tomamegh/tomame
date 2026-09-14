import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("@/db/queries/order-holds", () => ({
  getOrderHoldState: vi.fn(),
  setOrderHold: vi.fn(),
  clearOrderHold: vi.fn(),
}));
vi.mock("@/features/audit/services/audit.service", () => ({
  logAuditEvent: vi.fn(async () => undefined),
}));
vi.mock("../order-events.service", () => ({ recordOrderEvent: vi.fn(async () => null) }));

import { clearOrderHold, getOrderHoldState, setOrderHold } from "@/db/queries/order-holds";
import { logAuditEvent } from "@/features/audit/services/audit.service";
import { recordOrderEvent } from "../order-events.service";
import { holdOrder, releaseOrderHold } from "../order-hold.service";

const ORDER_ID = "11111111-1111-4111-8111-111111111111";

const admin = (over: Record<string, unknown> = {}) =>
  ({
    id: "admin-1",
    app_metadata: { role: "admin" },
    profile: { id: "admin-1", role: "admin" },
    ...over,
  }) as never;

const order = (over: Record<string, unknown> = {}) =>
  ({
    id: ORDER_ID,
    user_id: "u1",
    status: "processing",
    order_no: "TM-00042",
    held_at: null,
    hold_reason: null,
    held_by: null,
    ...over,
  }) as never;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getOrderHoldState).mockResolvedValue(order());
  vi.mocked(setOrderHold).mockResolvedValue(
    order({ held_at: "2026-09-14T12:00:00Z", hold_reason: "Wrong colour", held_by: "admin-1" }),
  );
  vi.mocked(clearOrderHold).mockResolvedValue(order());
});

describe("holdOrder", () => {
  it("refuses a hold with no reason", async () => {
    // The column CHECK refuses it too; this is so the admin reads a sentence
    // instead of a 23514 from inside Postgres.
    await expect(holdOrder(admin(), ORDER_ID, { reason: "" })).rejects.toMatchObject({
      statusCode: 400,
    });
    expect(setOrderHold).not.toHaveBeenCalled();
  });

  it("refuses a reason that is only whitespace", async () => {
    await expect(holdOrder(admin(), ORDER_ID, { reason: "   " })).rejects.toMatchObject({
      statusCode: 400,
    });
    expect(setOrderHold).not.toHaveBeenCalled();
  });

  it("refuses a caller who is not an admin", async () => {
    await expect(
      holdOrder(
        admin({ app_metadata: {}, profile: { id: "u1", role: "user" } }),
        ORDER_ID,
        { reason: "I would like my parcel stopped" },
      ),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(setOrderHold).not.toHaveBeenCalled();
  });

  it("refuses an order that is already held, naming the standing reason", async () => {
    vi.mocked(getOrderHoldState).mockResolvedValue(
      order({ held_at: "2026-09-14T09:00:00Z", hold_reason: "Customer says wrong item" }),
    );

    await expect(
      holdOrder(admin(), ORDER_ID, { reason: "Something else" }),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(setOrderHold).not.toHaveBeenCalled();
  });

  it("409s when another admin won the race between the read and the write", async () => {
    vi.mocked(setOrderHold).mockResolvedValue(null);

    await expect(holdOrder(admin(), ORDER_ID, { reason: "Wrong colour" })).rejects.toMatchObject({
      statusCode: 409,
    });
    expect(logAuditEvent).not.toHaveBeenCalled();
  });

  it("writes the hold with its trimmed reason and audits it", async () => {
    await holdOrder(admin(), ORDER_ID, { reason: "  Wrong colour  ", feedback_id: "fb-1" });

    expect(setOrderHold).toHaveBeenCalledWith({
      orderId: ORDER_ID,
      reason: "Wrong colour",
      heldBy: "admin-1",
    });
    expect(logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: "admin-1",
        actorRole: "admin",
        action: "order_held",
        entityType: "order_hold",
        entityId: ORDER_ID,
        metadata: expect.objectContaining({ reason: "Wrong colour", feedback_id: "fb-1" }),
      }),
    );
  });

  it("records the hold as an INTERNAL note, not a customer-facing one", async () => {
    await holdOrder(admin(), ORDER_ID, { reason: "Wrong colour" });

    expect(recordOrderEvent).toHaveBeenCalledWith(
      expect.objectContaining({ order_id: ORDER_ID, is_customer_visible: false }),
    );
  });
});

describe("releaseOrderHold", () => {
  it("refuses an order that is not on hold", async () => {
    await expect(releaseOrderHold(admin(), ORDER_ID)).rejects.toMatchObject({ statusCode: 409 });
    expect(clearOrderHold).not.toHaveBeenCalled();
  });

  it("refuses a caller who is not an admin", async () => {
    await expect(
      releaseOrderHold(admin({ app_metadata: {}, profile: { id: "u1", role: "user" } }), ORDER_ID),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it("clears the hold and audits it with the reason it was held for", async () => {
    vi.mocked(getOrderHoldState).mockResolvedValue(
      order({ held_at: "2026-09-14T09:00:00Z", hold_reason: "Customer says wrong item" }),
    );

    await releaseOrderHold(admin(), ORDER_ID, "Photo re-checked, it is the right one");

    expect(clearOrderHold).toHaveBeenCalledWith(ORDER_ID);
    expect(logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: "admin-1",
        actorRole: "admin",
        action: "order_hold_released",
        entityType: "order_hold",
        entityId: ORDER_ID,
        metadata: expect.objectContaining({ held_reason: "Customer says wrong item" }),
      }),
    );
  });

  it("409s when someone else released it first", async () => {
    vi.mocked(getOrderHoldState).mockResolvedValue(
      order({ held_at: "2026-09-14T09:00:00Z", hold_reason: "Wrong item" }),
    );
    vi.mocked(clearOrderHold).mockResolvedValue(null);

    await expect(releaseOrderHold(admin(), ORDER_ID)).rejects.toMatchObject({ statusCode: 409 });
    expect(logAuditEvent).not.toHaveBeenCalled();
  });
});
