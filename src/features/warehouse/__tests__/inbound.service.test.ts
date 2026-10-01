import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/features/audit/services/audit.service", () => ({ logAuditEvent: vi.fn() }));
vi.mock("@/db/queries/warehouse", () => ({ getProfileNames: vi.fn(async () => new Map()) }));
vi.mock("@/features/warehouse/services/warehouse.service", () => ({
  listWarehouseItemsByIds: vi.fn(),
  receiveWarehouseItem: vi.fn(),
}));
vi.mock("@/db/queries/inbound-parcels", () => ({
  countInboundByStatus: vi.fn(),
  deleteExpectedInboundParcel: vi.fn(),
  deleteInboundLink: vi.fn(),
  findInboundParcelByKeys: vi.fn(),
  getInboundParcel: vi.fn(),
  insertInboundLink: vi.fn(async () => ({ created: true })),
  insertInboundParcel: vi.fn(),
  listInboundLinks: vi.fn(async () => []),
  listInboundParcels: vi.fn(async () => []),
  updateInboundParcel: vi.fn(),
}));

import * as q from "@/db/queries/inbound-parcels";
import { logAuditEvent } from "@/features/audit/services/audit.service";
import type { PlatformUser } from "@/features/users/types";
import { listWarehouseItemsByIds, receiveWarehouseItem } from "@/features/warehouse/services/warehouse.service";

import {
  firstName,
  linkInboundOrder,
  logUnmatchedParcel,
  receiveInboundParcel,
  registerInboundTracking,
  unlinkInboundOrder,
} from "../services/inbound.service";

const operator = { id: "op-1", email: "op@tomame.local", app_metadata: { role: "warehouse" } } as unknown as PlatformUser;
const customer = { id: "c-1", email: "c@x.test", app_metadata: { role: "user" } } as unknown as PlatformUser;
const ORDER = "11111111-1111-4111-8111-111111111111";

function parcel(over: Record<string, unknown> = {}) {
  return {
    id: "ip-1",
    tracking_number: "1Z 999 AA1 01 2345 6784",
    tracking_key: "1Z999AA10123456784",
    carrier: "ups",
    status: "expected",
    source: "registered",
    store_order_ref: null,
    note: null,
    registered_by: "op-1",
    arrived_at: null,
    arrived_by: null,
    created_at: "2026-09-20T00:00:00Z",
    updated_at: "2026-09-20T00:00:00Z",
    ...over,
  };
}

function item(over: Record<string, unknown> = {}) {
  return {
    order_id: ORDER,
    order_no: "TM-00003",
    title: "Headphones",
    image_url: null,
    store: "Amazon",
    order_status: "processing",
    stage: "awaiting",
    held: null,
    received: null,
    recipient: { name: "Kwame Mensah", phone: "0245550192" },
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(listWarehouseItemsByIds).mockResolvedValue([item()] as never);
  vi.mocked(q.getInboundParcel).mockResolvedValue(parcel() as never);
  vi.mocked(q.listInboundParcels).mockResolvedValue([parcel()] as never);
  vi.mocked(q.listInboundLinks).mockResolvedValue([{ parcel_id: "ip-1", order_id: ORDER }] as never);
});

const actions = () => vi.mocked(logAuditEvent).mock.calls.map((c) => c[0].action);

describe("registerInboundTracking", () => {
  it("creates an expected parcel, links the order and audits it", async () => {
    vi.mocked(q.findInboundParcelByKeys).mockResolvedValue(null);
    vi.mocked(q.insertInboundParcel).mockResolvedValue({ row: parcel() as never, conflict: false });
    const view = await registerInboundTracking(operator, { order_id: ORDER, tracking_number: "1z 999 aa1 0123 4567 84" });

    expect(q.insertInboundParcel).toHaveBeenCalledWith(
      expect.objectContaining({ tracking_key: "1Z999AA10123456784", status: "expected", source: "registered", carrier: "ups" }),
    );
    expect(q.insertInboundLink).toHaveBeenCalledWith({ parcel_id: "ip-1", order_id: ORDER, linked_by: "op-1" });
    expect(logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ action: "warehouse_inbound_registered", entityType: "inbound_parcel", entityId: "ip-1", actorRole: "warehouse" }),
    );
    expect(view.orders[0]).toMatchObject({ order_no: "TM-00003", first_name: "Kwame" });
    // The hub sees a first name, never the phone.
    expect(JSON.stringify(view)).not.toContain("0245550192");
  });

  it("links a second order to a number already known instead of duplicating it", async () => {
    vi.mocked(q.findInboundParcelByKeys).mockResolvedValue(parcel() as never);
    await registerInboundTracking(operator, { order_id: ORDER, tracking_number: "1Z999AA10123456784" });
    expect(q.insertInboundParcel).not.toHaveBeenCalled();
    expect(actions()).toEqual(["warehouse_inbound_linked"]);
  });

  it("joins the other operator's parcel when two register at once", async () => {
    vi.mocked(q.findInboundParcelByKeys).mockResolvedValueOnce(null).mockResolvedValueOnce(parcel() as never);
    vi.mocked(q.insertInboundParcel).mockResolvedValue({ row: null, conflict: true });
    await registerInboundTracking(operator, { order_id: ORDER, tracking_number: "1Z999AA10123456784" });
    expect(actions()).toEqual(["warehouse_inbound_linked"]);
  });

  it("rejects an order the hub is not waiting for", async () => {
    vi.mocked(listWarehouseItemsByIds).mockResolvedValue([item({ order_status: "delivered" })] as never);
    await expect(
      registerInboundTracking(operator, { order_id: ORDER, tracking_number: "1Z999AA10123456784" }),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it("rejects something that is not a tracking number", async () => {
    await expect(registerInboundTracking(operator, { order_id: ORDER, tracking_number: "abc" })).rejects.toMatchObject({
      statusCode: 400,
    });
  });

  it("is closed to customers", async () => {
    await expect(
      registerInboundTracking(customer, { order_id: ORDER, tracking_number: "1Z999AA10123456784" }),
    ).rejects.toMatchObject({ statusCode: 403 });
  });
});

describe("unmatched parcels", () => {
  it("logs an arrived parcel with no order, and audits it", async () => {
    vi.mocked(q.findInboundParcelByKeys).mockResolvedValue(null);
    vi.mocked(q.insertInboundParcel).mockResolvedValue({
      row: parcel({ status: "unmatched", source: "scanned", arrived_at: "2026-10-01T00:00:00Z" }) as never,
      conflict: false,
    });
    vi.mocked(q.listInboundLinks).mockResolvedValue([]);
    await logUnmatchedParcel(operator, { tracking_number: "TBA123456789012", note: "Blue jiffy bag" });
    expect(q.insertInboundParcel).toHaveBeenCalledWith(
      expect.objectContaining({ status: "unmatched", source: "scanned", arrived_by: "op-1", tracking_key: "TBA123456789012" }),
    );
    expect(actions()).toEqual(["warehouse_inbound_unmatched_logged"]);
  });

  it("becomes arrived once someone links it to an order", async () => {
    vi.mocked(q.getInboundParcel).mockResolvedValue(parcel({ status: "unmatched", arrived_at: "2026-10-01T00:00:00Z" }) as never);
    await linkInboundOrder(operator, "ip-1", ORDER);
    expect(q.updateInboundParcel).toHaveBeenCalledWith("ip-1", "unmatched", { status: "arrived" });
    expect(logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ action: "warehouse_inbound_linked", metadata: expect.objectContaining({ order_no: "TM-00003", was: "unmatched" }) }),
    );
  });
});

describe("unlinkInboundOrder", () => {
  it("removes a parcel that never arrived once its last order is unlinked", async () => {
    vi.mocked(q.deleteInboundLink).mockResolvedValue(true);
    vi.mocked(q.listInboundLinks).mockResolvedValue([]);
    vi.mocked(q.deleteExpectedInboundParcel).mockResolvedValue(parcel() as never);
    expect(await unlinkInboundOrder(operator, "ip-1", ORDER)).toBeNull();
    expect(logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ action: "warehouse_inbound_unlinked", metadata: expect.objectContaining({ outcome: "deleted" }) }),
    );
  });

  it("keeps a parcel that is physically here, as unmatched", async () => {
    vi.mocked(q.getInboundParcel).mockResolvedValue(parcel({ status: "arrived", arrived_at: "2026-10-01T00:00:00Z" }) as never);
    vi.mocked(q.deleteInboundLink).mockResolvedValue(true);
    vi.mocked(q.listInboundLinks).mockResolvedValue([]);
    vi.mocked(q.updateInboundParcel).mockResolvedValue(parcel({ status: "unmatched" }) as never);
    await unlinkInboundOrder(operator, "ip-1", ORDER);
    expect(q.updateInboundParcel).toHaveBeenCalledWith("ip-1", "arrived", { status: "unmatched" });
    expect(q.deleteExpectedInboundParcel).not.toHaveBeenCalled();
  });
});

describe("receiveInboundParcel", () => {
  it("marks the parcel arrived and logs its one order in with the scale's weight", async () => {
    vi.mocked(q.updateInboundParcel).mockResolvedValue(parcel({ status: "arrived" }) as never);
    const res = await receiveInboundParcel(operator, "ip-1", { weight_lbs: 1.4, location: "US hub" });
    expect(q.updateInboundParcel).toHaveBeenCalledWith("ip-1", "expected", expect.objectContaining({ status: "arrived", arrived_by: "op-1" }));
    expect(receiveWarehouseItem).toHaveBeenCalledWith(operator, ORDER, { weight_lbs: 1.4, location: "US hub", note: null });
    expect(actions()).toContain("warehouse_inbound_arrived");
    expect(res.received).toEqual(["TM-00003"]);
  });

  it("does not put one box's weight on each of several orders", async () => {
    const second = "22222222-2222-4222-8222-222222222222";
    vi.mocked(q.listInboundLinks).mockResolvedValue([
      { parcel_id: "ip-1", order_id: ORDER },
      { parcel_id: "ip-1", order_id: second },
    ] as never);
    vi.mocked(listWarehouseItemsByIds).mockResolvedValue([item(), item({ order_id: second, order_no: "TM-00004" })] as never);
    vi.mocked(q.updateInboundParcel).mockResolvedValue(parcel({ status: "arrived" }) as never);
    await receiveInboundParcel(operator, "ip-1", { weight_lbs: 3 });
    for (const call of vi.mocked(receiveWarehouseItem).mock.calls) expect(call[2].weight_lbs).toBeNull();
  });

  it("refuses a parcel nobody has linked", async () => {
    vi.mocked(q.listInboundLinks).mockResolvedValue([]);
    await expect(receiveInboundParcel(operator, "ip-1", {})).rejects.toMatchObject({ statusCode: 409 });
    expect(receiveWarehouseItem).not.toHaveBeenCalled();
  });
});

describe("firstName", () => {
  it("keeps only the first word", () => {
    expect(firstName(" Ama  Serwaa Boateng ")).toBe("Ama");
    expect(firstName(null)).toBeNull();
  });
});
