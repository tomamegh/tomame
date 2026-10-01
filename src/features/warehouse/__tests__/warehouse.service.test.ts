import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("@/features/audit/services/audit.service", () => ({ logAuditEvent: vi.fn() }));
vi.mock("@/features/orders/services/order-events.service", () => ({ recordOrderEvent: vi.fn() }));
vi.mock("@/features/orders/services/orders.service", () => ({ advanceOrderFromWarehouse: vi.fn() }));
vi.mock("@/db/queries/order-feedback", () => ({ listOrderFeedback: vi.fn(async () => []) }));
vi.mock("@/db/queries/inbound-parcels", () => ({ findInboundParcelByKeys: vi.fn(async () => null) }));
vi.mock("@/features/warehouse/services/activity.service", () => ({ recordWarehouseActivity: vi.fn() }));
vi.mock("@/db/queries/warehouse", () => ({
  countPackagesByStatus: vi.fn(),
  deletePackageItem: vi.fn(),
  deletePackingPackage: vi.fn(),
  getPackageById: vi.fn(),
  getPackageByReference: vi.fn(),
  getProfileNames: vi.fn(async () => new Map()),
  getWarehouseAddress: vi.fn(),
  getWarehouseOrderByNo: vi.fn(),
  insertPackage: vi.fn(),
  insertPackageItems: vi.fn(async () => ({ items: [], conflict: false })),
  listBoxRefs: vi.fn(async () => new Map()),
  listGroupDeliverySnapshots: vi.fn(async () => new Map()),
  listHubArrivals: vi.fn(async () => new Map()),
  listItemsForOrders: vi.fn(async () => []),
  listOpenFeedbackOrderIds: vi.fn(async () => new Set()),
  listPackageItems: vi.fn(async () => []),
  listPackages: vi.fn(async () => []),
  listPhotoIdsByOrder: vi.fn(async () => new Map()),
  listRecipientProfiles: vi.fn(async () => []),
  listWarehouseOrders: vi.fn(async () => []),
  updatePackage: vi.fn(),
}));

import * as q from "@/db/queries/warehouse";
import { findInboundParcelByKeys } from "@/db/queries/inbound-parcels";
import { recordWarehouseActivity } from "@/features/warehouse/services/activity.service";
import { logAuditEvent } from "@/features/audit/services/audit.service";
import { recordOrderEvent } from "@/features/orders/services/order-events.service";
import { advanceOrderFromWarehouse } from "@/features/orders/services/orders.service";
import type { PlatformUser } from "@/features/users/types";
import { APIError } from "@/lib/auth/api-helpers";

import {
  createWarehousePackage,
  lookupWarehouseCode,
  normaliseCode,
  receiveWarehouseItem,
  sealWarehousePackage,
  shipWarehousePackage,
  toRecipient,
} from "../services/warehouse.service";

const operator = { id: "op-1", email: "op@tomame.local", app_metadata: { role: "warehouse" } } as unknown as PlatformUser;
const customer = { id: "c-1", email: "c@x.test", app_metadata: { role: "user" } } as unknown as PlatformUser;

function order(over: Record<string, unknown> = {}) {
  return {
    id: "o-1",
    order_no: "TM-00001",
    user_id: "u-1",
    status: "processing",
    product_name: "Headphones",
    product_url: "https://www.amazon.com/dp/X",
    product_image_url: "https://img.test/a.jpg",
    quantity: 1,
    special_instructions: null,
    pricing: { weight_lbs: 0.6, total_ghs: 999 },
    extraction_metadata: null,
    held_at: null,
    hold_reason: null,
    order_group_id: null,
    consolidation_box_id: null,
    created_at: "2026-09-01T00:00:00Z",
    updated_at: "2026-09-01T00:00:00Z",
    ...over,
  };
}

function pkgRow(over: Record<string, unknown> = {}) {
  return {
    id: "p-1",
    package_no: 10001,
    reference: "PKG-10001",
    status: "packing",
    service: "air",
    origin: "New York, USA",
    destination: "Accra, Ghana",
    weight_lbs: null,
    length_in: null,
    width_in: null,
    height_in: null,
    carrier: null,
    tracking_number: null,
    fragile: false,
    this_way_up: true,
    keep_dry: false,
    notes: null,
    created_by: "op-1",
    sealed_at: null,
    sealed_by: null,
    shipped_at: null,
    shipped_by: null,
    label_printed_at: null,
    label_print_count: 0,
    created_at: "2026-09-01T00:00:00Z",
    updated_at: "2026-09-01T00:00:00Z",
    ...over,
  };
}

const line = (orderId: string) => ({
  id: `l-${orderId}`,
  package_id: "p-1",
  order_id: orderId,
  description: null,
  quantity: 1,
  added_by: "op-1",
  created_at: "2026-09-01T00:00:00Z",
});

beforeEach(() => vi.clearAllMocks());

describe("normaliseCode", () => {
  it("reads references, order numbers and the label's URL", () => {
    expect(normaliseCode(" pkg-10042 ")).toBe("PKG-10042");
    expect(normaliseCode("PKG10042")).toBe("PKG-10042");
    expect(normaliseCode("https://tomame.ca/warehouse/p/PKG-10042")).toBe("PKG-10042");
    expect(normaliseCode("tm-42")).toBe("TM-00042");
    expect(normaliseCode("10042")).toBe("PKG-10042");
    expect(normaliseCode("   ")).toBeNull();
  });

  it("does not mistake a long all-digit carrier number for a package (086)", () => {
    expect(normaliseCode("12345678")).toBe("PKG-12345678");
    expect(normaliseCode("9400 1118 9922 3197 4284 90")).toBe("9400111899223197428490");
  });
});

describe("toRecipient", () => {
  it("prefers the checkout snapshot and fills gaps from the profile", () => {
    const r = toRecipient(
      { kind: "door", recipient_name: "Ama M", city: "Accra", fee_ghs: 40, id: "addr" },
      { first_name: "Ama", last_name: "Mensah", phone: "+233200000000" },
    );
    expect(r.name).toBe("Ama M");
    expect(r.phone).toBe("+233200000000");
    expect(r.city).toBe("Accra");
    expect(Object.keys(r)).not.toContain("fee_ghs");
  });
});

describe("the role gate", () => {
  it("refuses a customer on every entry point", async () => {
    await expect(createWarehousePackage(customer, {})).rejects.toMatchObject({ statusCode: 403 });
    await expect(sealWarehousePackage(customer, "p-1")).rejects.toMatchObject({ statusCode: 403 });
  });
});

describe("items leave no price behind", () => {
  it("never forwards pricing to the DTO", async () => {
    vi.mocked(q.listWarehouseOrders).mockResolvedValue([order()] as never);
    vi.mocked(q.listHubArrivals).mockResolvedValue(new Map());
    const { getWarehouseItem } = await import("../services/warehouse.service");
    const item = await getWarehouseItem(operator, "o-1");
    expect(JSON.stringify(item)).not.toMatch(/total_ghs|pricing|999/);
    expect(item.listed_weight_lbs).toBe(0.6);
  });
});

describe("packing", () => {
  it("will not pack a held order", async () => {
    vi.mocked(q.listWarehouseOrders).mockResolvedValue([order({ held_at: "2026-09-02", hold_reason: "Wrong colour" })] as never);
    await expect(createWarehousePackage(operator, { order_ids: ["o-1"] })).rejects.toMatchObject({
      statusCode: 409,
      message: expect.stringMatching(/on hold: Wrong colour/),
    });
    expect(q.insertPackage).not.toHaveBeenCalled();
  });

  it("will not pack an order that is already in a package", async () => {
    vi.mocked(q.listWarehouseOrders).mockResolvedValue([order()] as never);
    vi.mocked(q.listItemsForOrders).mockResolvedValue([line("o-1")] as never);
    vi.mocked(q.getPackageById).mockResolvedValue(pkgRow({ reference: "PKG-10009" }) as never);
    await expect(createWarehousePackage(operator, { order_ids: ["o-1"] })).rejects.toMatchObject({
      statusCode: 409,
      message: expect.stringMatching(/already in PKG-10009/),
    });
  });

  it("refuses to seal while an item inside is held", async () => {
    vi.mocked(q.getPackageById).mockResolvedValue(pkgRow() as never);
    vi.mocked(q.listPackageItems).mockResolvedValue([line("o-1")] as never);
    vi.mocked(q.listItemsForOrders).mockResolvedValue([line("o-1")] as never);
    vi.mocked(q.listWarehouseOrders).mockResolvedValue([order({ held_at: "x", hold_reason: "Damaged" })] as never);
    await expect(sealWarehousePackage(operator, "p-1")).rejects.toBeInstanceOf(APIError);
    expect(q.updatePackage).not.toHaveBeenCalled();
  });
});

describe("shipping", () => {
  function sealedWith(orders: ReturnType<typeof order>[]) {
    vi.mocked(q.getPackageById).mockResolvedValue(pkgRow({ status: "sealed", sealed_at: "2026-09-02" }) as never);
    vi.mocked(q.listPackageItems).mockResolvedValue(orders.map((o) => line(o.id)) as never);
    vi.mocked(q.listItemsForOrders).mockResolvedValue(orders.map((o) => line(o.id)) as never);
    vi.mocked(q.listWarehouseOrders).mockResolvedValue(orders as never);
  }

  it("moves every order to in transit, a paid one via processing, then marks it shipped", async () => {
    sealedWith([order({ id: "o-1", status: "paid" }), order({ id: "o-2", order_no: "TM-00002" }), order({ id: "o-3", status: "in_transit" })]);
    vi.mocked(q.updatePackage).mockResolvedValue(pkgRow({ status: "shipped", shipped_at: "now" }) as never);

    const result = await shipWarehousePackage(operator, "p-1", { tracking_number: "AWB-1" });

    expect(result.failed).toEqual([]);
    const calls = vi.mocked(advanceOrderFromWarehouse).mock.calls.map((c) => [c[1], c[2]]);
    expect(calls).toEqual([
      ["o-1", "processing"],
      ["o-1", "in_transit"],
      ["o-2", "in_transit"],
    ]);
    // 086: the waybill stays on the package; the customer's order never carries it.
    expect(vi.mocked(advanceOrderFromWarehouse).mock.calls[1]?.[3]).toBeUndefined();
    expect(q.updatePackage).toHaveBeenLastCalledWith("p-1", "sealed", expect.objectContaining({ tracking_number: "AWB-1" }));
    expect(q.updatePackage).toHaveBeenCalledWith("p-1", "sealed", expect.objectContaining({ status: "shipped" }));
    expect(logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ action: "warehouse_package_shipped", actorRole: "warehouse" }),
    );
  });

  it("keeps the package sealed and reports the order that would not move", async () => {
    sealedWith([order({ id: "o-1" }), order({ id: "o-2", order_no: "TM-00002" })]);
    vi.mocked(advanceOrderFromWarehouse)
      .mockResolvedValueOnce({} as never)
      .mockRejectedValueOnce(new APIError(409, "This order is on hold"));

    const result = await shipWarehousePackage(operator, "p-1", {});

    expect(result.failed).toEqual([{ order_no: "TM-00002", reason: "This order is on hold" }]);
    expect(q.updatePackage).not.toHaveBeenCalled();
  });

  it("will not ship a package that is still open", async () => {
    vi.mocked(q.getPackageById).mockResolvedValue(pkgRow() as never);
    await expect(shipWarehousePackage(operator, "p-1", {})).rejects.toMatchObject({ statusCode: 409 });
  });
});

describe("receiving", () => {
  it("writes the hub arrival with the weight and moves a paid order to processing", async () => {
    vi.mocked(q.listWarehouseOrders).mockResolvedValue([order({ status: "paid" })] as never);
    await receiveWarehouseItem(operator, "o-1", { weight_lbs: 1.4 });
    expect(recordOrderEvent).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "hub_received", weight_lbs: 1.4, is_customer_visible: true }),
    );
    expect(advanceOrderFromWarehouse).toHaveBeenCalledWith(operator, "o-1", "processing");
  });

  it("does not write a second arrival for the same weight", async () => {
    vi.mocked(q.listWarehouseOrders).mockResolvedValue([order()] as never);
    vi.mocked(q.listHubArrivals).mockResolvedValue(
      new Map([["o-1", { order_id: "o-1", occurred_at: "x", weight_lbs: 1.4, location: null }]]),
    );
    await receiveWarehouseItem(operator, "o-1", { weight_lbs: 1.4 });
    expect(recordOrderEvent).not.toHaveBeenCalled();
  });

  it("refuses an order that is not expected at the hub", async () => {
    vi.mocked(q.listWarehouseOrders).mockResolvedValue([order({ status: "delivered" })] as never);
    await expect(receiveWarehouseItem(operator, "o-1", {})).rejects.toMatchObject({ statusCode: 409 });
  });
});

describe("lookupWarehouseCode: store parcels (086)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("opens a registered parcel from its carrier barcode, USPS routing prefix and all", async () => {
    vi.mocked(findInboundParcelByKeys).mockResolvedValueOnce({ id: "ip-1", tracking_key: "9400111899223197428490" } as never);
    const result = await lookupWarehouseCode(operator, "42010001" + "9400111899223197428490");
    expect(result).toEqual({ kind: "inbound", id: "ip-1", tracking_key: "9400111899223197428490" });
    expect(vi.mocked(findInboundParcelByKeys).mock.calls[0]![0]).toContain("9400111899223197428490");
    expect(recordWarehouseActivity).toHaveBeenCalledWith(operator, expect.objectContaining({ kind: "scan", metadata: expect.objectContaining({ inbound_parcel_id: "ip-1" }) }));
  });

  it("answers an unregistered barcode with the code to link, and logs a failed lookup", async () => {
    const result = await lookupWarehouseCode(operator, "1z999aa10123456784");
    expect(result).toEqual({ kind: "inbound_unmatched", code: "1Z999AA10123456784" });
    expect(recordWarehouseActivity).toHaveBeenCalledWith(operator, expect.objectContaining({ kind: "lookup_failed", metadata: expect.objectContaining({ inbound: true }) }));
  });

  it("still 404s a code too short to be anything", async () => {
    await expect(lookupWarehouseCode(operator, "abc")).rejects.toMatchObject({ statusCode: 404 });
  });

  it("refuses a customer", async () => {
    await expect(lookupWarehouseCode(customer, "1Z999AA10123456784")).rejects.toBeInstanceOf(APIError);
  });
});
