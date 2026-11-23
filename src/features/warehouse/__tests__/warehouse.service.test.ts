import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/db/queries/pricing-constants", () => ({ getPricingConstantsMap: vi.fn(async () => ({ box_capacity_lbs: 9 })) }));
vi.mock("@/features/shipments/shipment-notify.service", () => ({ notifyShipmentUpdate: vi.fn() }));
vi.mock("@/features/shipments/stage-settings.service", async () => {
  const { DEFAULT_STAGE_SETTINGS } = await import("@/features/shipments/stages");
  return { loadStageSettings: vi.fn(async () => DEFAULT_STAGE_SETTINGS) };
});
vi.mock("@/db/queries/flight-departures", () => ({
  findShipDeparture: vi.fn(async () => ({ id: "dep-1", region_code: "USA", carrier: "Delta Cargo", origin: "JFK", destination: "ACC", departs_on: "2099-01-07", departs_at: "2099-01-07T00:00:00Z", cutoff_at: "2099-01-06T00:00:00Z", status: "scheduled", awb: null })),
  setDepartureAwbIfEmpty: vi.fn(async () => undefined),
}));
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
import { notifyShipmentUpdate } from "@/features/shipments/shipment-notify.service";
import type { PlatformUser } from "@/features/users/types";
import { APIError } from "@/lib/auth/api-helpers";

import {
  addWarehousePackageItems,
  createWarehousePackage,
  holdWarehousePackage,
  lookupWarehouseCode,
  normaliseCode,
  receiveWarehouseItem,
  sealWarehousePackage,
  shipWarehousePackage,
  toRecipient,
  voidWarehousePackage,
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

    const result = await shipWarehousePackage(operator, "p-1", { tracking_number: "006 1234 5675" });

    expect(result.failed).toEqual([]);
    const calls = vi.mocked(advanceOrderFromWarehouse).mock.calls.map((c) => [c[1], c[2]]);
    expect(calls).toEqual([
      ["o-1", "processing"],
      ["o-1", "in_transit"],
      ["o-2", "in_transit"],
    ]);
    // 086: the waybill stays on the package; the customer's order never carries it.
    expect(vi.mocked(advanceOrderFromWarehouse).mock.calls[1]?.[3]).toBeUndefined();
    expect(q.updatePackage).toHaveBeenLastCalledWith("p-1", "sealed", expect.objectContaining({ tracking_number: "006-12345675", carrier: "Delta Cargo", departure_id: "dep-1" }));
    expect(q.updatePackage).toHaveBeenCalledWith("p-1", "sealed", expect.objectContaining({ status: "shipped" }));
    expect(logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ action: "warehouse_package_shipped", actorRole: "warehouse" }),
    );
  });

  it("emails each customer once for the box, never once per order (098)", async () => {
    sealedWith([
      order({ id: "o-1", user_id: "u-1" }),
      order({ id: "o-2", order_no: "TM-00002", user_id: "u-1" }),
      order({ id: "o-3", order_no: "TM-00003", user_id: "u-2" }),
    ]);
    vi.mocked(q.updatePackage).mockResolvedValue(pkgRow({ status: "shipped", shipped_at: "now" }) as never);

    await shipWarehousePackage(operator, "p-1", { tracking_number: "00612345675" });

    for (const call of vi.mocked(advanceOrderFromWarehouse).mock.calls) {
      expect(call[4]).toMatchObject({ notifyCustomer: false });
    }
    const sent = vi.mocked(notifyShipmentUpdate).mock.calls.map(([input]) => [input.userId, input.orders.map((o) => o.orderNo), input.orderStatus]);
    expect(sent).toEqual([
      ["u-1", ["TM-00001", "TM-00002"], "in_transit"],
      ["u-2", ["TM-00003"], "in_transit"],
    ]);
  });

  it("emails nobody when an order inside would not move", async () => {
    sealedWith([order({ id: "o-1" }), order({ id: "o-2", order_no: "TM-00002" })]);
    vi.mocked(advanceOrderFromWarehouse).mockResolvedValueOnce({} as never).mockRejectedValueOnce(new APIError(409, "held"));
    await shipWarehousePackage(operator, "p-1", { tracking_number: "00612345675" });
    expect(notifyShipmentUpdate).not.toHaveBeenCalled();
  });

  it("keeps the package sealed and reports the order that would not move", async () => {
    sealedWith([order({ id: "o-1" }), order({ id: "o-2", order_no: "TM-00002" })]);
    vi.mocked(advanceOrderFromWarehouse)
      .mockResolvedValueOnce({} as never)
      .mockRejectedValueOnce(new APIError(409, "This order is on hold"));

    const result = await shipWarehousePackage(operator, "p-1", { tracking_number: "00612345675" });

    expect(result.failed).toEqual([{ order_no: "TM-00002", reason: "This order is on hold" }]);
    expect(q.updatePackage).not.toHaveBeenCalled();
  });

  it("will not ship a package that is still open", async () => {
    vi.mocked(q.getPackageById).mockResolvedValue(pkgRow() as never);
    await expect(shipWarehousePackage(operator, "p-1", { tracking_number: "00612345675" })).rejects.toMatchObject({ statusCode: 409 });
  });
});

describe("receiving", () => {
  it("writes the hub arrival with the weight and moves a paid order to processing", async () => {
    vi.mocked(q.listWarehouseOrders).mockResolvedValue([order({ status: "paid" })] as never);
    await receiveWarehouseItem(operator, "o-1", { weight_lbs: 1.4 });
    expect(recordOrderEvent).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "hub_received", weight_lbs: 1.4, is_customer_visible: true }),
    );
    // 098: no "we're buying it" email for a parcel already at the hub.
    expect(advanceOrderFromWarehouse).toHaveBeenCalledWith(operator, "o-1", "processing", undefined, { notifyCustomer: false });
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

describe("stuck packages (112)", () => {
  const admin = { id: "ad-1", email: "ad@tomame.local", app_metadata: { role: "admin" } } as unknown as PlatformUser;
  function withOrders(status: string, orders: ReturnType<typeof order>[], extra: Record<string, unknown> = {}) {
    vi.mocked(q.getPackageById).mockResolvedValue(pkgRow({ status, sealed_at: status === "packing" ? null : "2026-10-31", ...extra }) as never);
    vi.mocked(q.listPackageItems).mockResolvedValue(orders.map((o) => line(o.id)) as never);
    vi.mocked(q.listItemsForOrders).mockResolvedValue(orders.map((o) => line(o.id)) as never);
    vi.mocked(q.listWarehouseOrders).mockResolvedValue(orders as never);
  }

  it("will not seal a package holding a delivered order without a reason, and records the reason when given", async () => {
    withOrders("packing", [order({ order_no: "TM-00022", status: "completed" })], { weight_lbs: 0.7 });
    await expect(sealWarehousePackage(operator, "p-1")).rejects.toMatchObject({ statusCode: 409, message: expect.stringMatching(/TM-00022/) });
    expect(q.updatePackage).not.toHaveBeenCalled();

    vi.mocked(q.updatePackage).mockResolvedValue(pkgRow({ status: "sealed", sealed_at: "now" }) as never);
    await sealWarehousePackage(operator, "p-1", "Customer asked us to re-send a replacement");
    expect(q.updatePackage).toHaveBeenCalledWith("p-1", "packing", expect.objectContaining({ status: "sealed", seal_override_reason: "Customer asked us to re-send a replacement" }));
    expect(logAuditEvent).toHaveBeenCalledWith(expect.objectContaining({ action: "warehouse_package_sealed", metadata: expect.objectContaining({ override_reason: expect.any(String) }) }));
  });

  it("refuses to ship a package whose order is already delivered, naming the ways out, before touching any order", async () => {
    withOrders("sealed", [order({ order_no: "TM-00022", status: "completed" })]);
    await expect(shipWarehousePackage(operator, "p-1", { tracking_number: "00612345675" })).rejects.toMatchObject({ statusCode: 409, message: expect.stringMatching(/record error/) });
    expect(advanceOrderFromWarehouse).not.toHaveBeenCalled();
  });

  it("refuses to ship a held package", async () => {
    withOrders("sealed", [order()], { hold_reason: "Box damaged, repacking" });
    await expect(shipWarehousePackage(operator, "p-1", { tracking_number: "00612345675" })).rejects.toMatchObject({ message: expect.stringMatching(/held/) });
  });

  it("holds a sealed package with a reason", async () => {
    vi.mocked(q.updatePackage).mockResolvedValue(pkgRow({ status: "sealed", sealed_at: "x", hold_reason: "Waiting on the customer" }) as never);
    withOrders("sealed", [order()], { hold_reason: "Waiting on the customer" });
    await holdWarehousePackage(operator, "p-1", "Waiting on the customer");
    expect(q.updatePackage).toHaveBeenCalledWith("p-1", "sealed", expect.objectContaining({ hold_reason: "Waiting on the customer" }));
    await expect(holdWarehousePackage(operator, "p-1", "  ")).rejects.toMatchObject({ statusCode: 400 });
  });

  it("only a manager resolves a package as a record error, with a note, and only when its orders are finished", async () => {
    withOrders("sealed", [order({ order_no: "TM-00022", status: "completed" })]);
    await expect(voidWarehousePackage(operator, "p-1", { reason: "record_error", note: "Delivered on 27 Oct" })).rejects.toMatchObject({ statusCode: 403 });
    await expect(voidWarehousePackage(admin, "p-1", { reason: "record_error", note: " " })).rejects.toMatchObject({ statusCode: 400 });

    vi.mocked(q.updatePackage).mockResolvedValue(pkgRow({ status: "voided", sealed_at: "x", void_reason: "record_error", void_note: "Delivered on 27 Oct" }) as never);
    await voidWarehousePackage(admin, "p-1", { reason: "record_error", note: "Delivered on 27 Oct" });
    expect(q.updatePackage).toHaveBeenCalledWith("p-1", ["sealed", "packing"], expect.objectContaining({ status: "voided", void_reason: "record_error", voided_by: "ad-1" }));
    expect(logAuditEvent).toHaveBeenCalledWith(expect.objectContaining({ action: "warehouse_package_voided" }));

    withOrders("sealed", [order({ status: "processing" })]);
    await expect(voidWarehousePackage(admin, "p-1", { reason: "record_error", note: "x" })).rejects.toMatchObject({ statusCode: 409 });
  });
});

describe("the Accra leg (113, Fix 12)", () => {
  function sealedWith(orders: ReturnType<typeof order>[]) {
    vi.mocked(q.getPackageById).mockResolvedValue(pkgRow({ status: "sealed", sealed_at: "2026-09-02" }) as never);
    vi.mocked(q.listPackageItems).mockResolvedValue(orders.map((o) => line(o.id)) as never);
    vi.mocked(q.listItemsForOrders).mockResolvedValue(orders.map((o) => line(o.id)) as never);
    vi.mocked(q.listWarehouseOrders).mockResolvedValue(orders as never);
  }

  it("will not ship without an air waybill or a reason", async () => {
    sealedWith([order()]);
    await expect(shipWarehousePackage(operator, "p-1", {})).rejects.toMatchObject({ statusCode: 400, message: expect.stringMatching(/air waybill/) });
    expect(advanceOrderFromWarehouse).not.toHaveBeenCalled();
  });

  it("refuses a pasted link, a doubled number and a bad check digit", async () => {
    sealedWith([order()]);
    for (const bad of ["https://a.co/d/0iXDFAe", "0061234567500612345675", "006-12345676"]) {
      await expect(shipWarehousePackage(operator, "p-1", { tracking_number: bad })).rejects.toMatchObject({ statusCode: 400 });
    }
  });

  it("ships without one when a reason is recorded, and keeps the reason", async () => {
    sealedWith([order()]);
    vi.mocked(q.updatePackage).mockResolvedValue(pkgRow({ status: "shipped", shipped_at: "now" }) as never);
    await shipWarehousePackage(operator, "p-1", { no_tracking_reason: "Hand-carried by Kofi" });
    expect(q.updatePackage).toHaveBeenLastCalledWith("p-1", "sealed", expect.objectContaining({ status: "shipped", no_tracking_reason: "Hand-carried by Kofi" }));
  });
});

describe("weights and capacity (114, Fix 11)", () => {
  function packing(orders: ReturnType<typeof order>[], extra: Record<string, unknown> = {}) {
    vi.mocked(q.getPackageById).mockResolvedValue(pkgRow({ status: "packing", sealed_at: null, ...extra }) as never);
    vi.mocked(q.listPackageItems).mockResolvedValue(orders.map((o) => line(o.id)) as never);
    vi.mocked(q.listItemsForOrders).mockResolvedValue([] as never);
    vi.mocked(q.listWarehouseOrders).mockResolvedValue(orders as never);
    vi.mocked(q.updatePackage).mockResolvedValue(pkgRow({ status: "sealed", sealed_at: "now" }) as never);
  }

  it("blocks a seal with no confirmed weight and no override, and records the estimate reason", async () => {
    vi.mocked(q.listHubArrivals).mockResolvedValue(new Map());
    packing([order({ id: "o-est" })]);
    await expect(sealWarehousePackage(operator, "p-1")).rejects.toMatchObject({ statusCode: 409, message: expect.stringMatching(/Weigh the package/) });
    expect(q.updatePackage).not.toHaveBeenCalled();

    await sealWarehousePackage(operator, "p-1", null, { estimateReason: "Scale is being repaired" });
    expect(q.updatePackage).toHaveBeenCalledWith(
      "p-1",
      "packing",
      expect.objectContaining({ status: "sealed", weight_estimate_reason: "Scale is being repaired", capacity_override_reason: null }),
    );
  });

  it("will not seal with a 0 lb item, reason or not", async () => {
    packing([order({ id: "o-51", order_no: "TM-00051", pricing: { total_ghs: 1 } })], { weight_lbs: 2 });
    await expect(sealWarehousePackage(operator, "p-1", null, { estimateReason: "x", capacityReason: "y" })).rejects.toMatchObject({
      message: expect.stringMatching(/TM-00051 has no weight/),
    });
  });

  it("will not put a 141.2 lb TV in a package with other items without a reason", async () => {
    const small = order({ id: "o-1", order_no: "TM-00001" });
    const tv = order({ id: "o-tv", order_no: "TM-00040", pricing: { weight_lbs: 141.2, total_ghs: 1 } });
    vi.mocked(q.getPackageById).mockResolvedValue(pkgRow() as never);
    vi.mocked(q.listPackageItems).mockResolvedValue([line("o-1")] as never);
    vi.mocked(q.listItemsForOrders).mockResolvedValue([] as never);
    vi.mocked(q.listWarehouseOrders).mockImplementation((async (f: { ids?: string[] }) =>
      [small, tv].filter((o) => f.ids?.includes(o.id))) as never);

    await expect(addWarehousePackageItems(operator, "p-1", { order_ids: ["o-tv"] })).rejects.toMatchObject({
      statusCode: 409,
      message: expect.stringMatching(/TM-00040 is over a 9 lb box/),
    });
    expect(q.insertPackageItems).not.toHaveBeenCalled();
  });
});
