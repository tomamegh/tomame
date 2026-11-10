import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/db/queries/driver-deliveries", () => ({
  countDeliveryPhotosSince: vi.fn(),
  listAssignedDeliveryRows: vi.fn(async () => []),
  listDeliveredBy: vi.fn(async () => []),
  listDeliveryRows: vi.fn(),
  listDriverProfiles: vi.fn(async () => []),
  markDeliveredBy: vi.fn(),
  setCodeFailures: vi.fn(),
}));
vi.mock("@/db/queries/warehouse", () => ({ getProfileNames: vi.fn(async () => new Map()), listWarehouseOrders: vi.fn() }));
vi.mock("@/features/audit/services/audit.service", () => ({ logAuditEvent: vi.fn() }));
vi.mock("@/features/order-photos/services/order-photos.service", () => ({ uploadOrderPhotos: vi.fn(async () => [{}]) }));
vi.mock("@/features/orders/services/orders.service", () => ({ deliverOrderAsDriver: vi.fn() }));
vi.mock("@/features/shipments/shipment-notify.service", () => ({ notifyShipmentUpdate: vi.fn() }));
vi.mock("@/features/shipments/stage-settings.service", async () => {
  const { DEFAULT_STAGE_SETTINGS } = await import("@/features/shipments/stages");
  return { loadStageSettings: vi.fn(async () => DEFAULT_STAGE_SETTINGS) };
});
vi.mock("@/features/warehouse/services/warehouse.service", () => ({ hydrateItems: vi.fn(async () => []) }));

import * as q from "@/db/queries/driver-deliveries";
import { listWarehouseOrders } from "@/db/queries/warehouse";
import { uploadOrderPhotos } from "@/features/order-photos/services/order-photos.service";
import { deliverOrderAsDriver } from "@/features/orders/services/orders.service";
import { notifyShipmentUpdate } from "@/features/shipments/shipment-notify.service";
import type { PlatformUser } from "@/features/users/types";

import { completeDelivery, uploadDeliveryPhotos } from "../services/driver.service";

const driver = { id: "d-1", email: "d@tomame.local", app_metadata: { role: "driver" } } as unknown as PlatformUser;
const otherDriver = { id: "d-2", email: "e@tomame.local", app_metadata: { role: "driver" } } as unknown as PlatformUser;
const customer = { id: "c-1", app_metadata: { role: "user" } } as unknown as PlatformUser;

const row = (orderId: string, over: Record<string, unknown> = {}) => ({
  order_id: orderId,
  user_id: "u-1",
  driver_id: "d-1",
  driver_assigned_at: "2026-11-10T08:00:00Z",
  delivery_code: "482913",
  delivery_code_failures: 0,
  ...over,
});
const order = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  order_no: `TM-${id}`,
  user_id: "u-1",
  status: "in_transit",
  product_name: "Thing",
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(q.listDeliveryRows).mockResolvedValue([row("a"), row("b")] as never);
  vi.mocked(listWarehouseOrders).mockResolvedValue([order("a"), order("b")] as never);
  vi.mocked(q.countDeliveryPhotosSince).mockResolvedValue(new Map([["a", 1]]));
});

describe("completing a delivery (102)", () => {
  it("delivers every parcel at the stop with the right code, and tells the customer once", async () => {
    const result = await completeDelivery(driver, { order_ids: ["a", "b"], code: "482 913" });
    expect(result.delivered).toBe(2);
    expect(vi.mocked(deliverOrderAsDriver).mock.calls.map((c) => [c[1], c[2]])).toEqual([
      ["a", { notifyCustomer: false }],
      ["b", { notifyCustomer: false }],
    ]);
    expect(q.markDeliveredBy).toHaveBeenCalledWith(["a", "b"], "d-1", true);
    expect(notifyShipmentUpdate).toHaveBeenCalledTimes(1);
    expect(vi.mocked(notifyShipmentUpdate).mock.calls[0]?.[0]).toMatchObject({ userId: "u-1", orderStatus: "delivered" });
  });

  it("counts a wrong code against the stop and delivers nothing", async () => {
    await expect(completeDelivery(driver, { order_ids: ["a", "b"], code: "111111" })).rejects.toMatchObject({
      statusCode: 400,
      message: expect.stringContaining("4 tries left"),
    });
    expect(q.setCodeFailures).toHaveBeenCalledWith("a", 1);
    expect(q.setCodeFailures).toHaveBeenCalledWith("b", 1);
    expect(deliverOrderAsDriver).not.toHaveBeenCalled();
  });

  it("locks after five wrong codes, even for the right one", async () => {
    vi.mocked(q.listDeliveryRows).mockResolvedValue([row("a", { delivery_code_failures: 5 }), row("b")] as never);
    await expect(completeDelivery(driver, { order_ids: ["a", "b"], code: "482913" })).rejects.toMatchObject({ statusCode: 423 });
    expect(deliverOrderAsDriver).not.toHaveBeenCalled();
  });

  it("needs a hand-over photo first", async () => {
    vi.mocked(q.countDeliveryPhotosSince).mockResolvedValue(new Map());
    await expect(completeDelivery(driver, { order_ids: ["a", "b"], code: "482913" })).rejects.toMatchObject({ statusCode: 409 });
  });

  it("refuses another driver's stop, and a customer outright", async () => {
    await expect(completeDelivery(otherDriver, { order_ids: ["a"], code: "482913" })).rejects.toMatchObject({ statusCode: 404 });
    await expect(completeDelivery(customer, { order_ids: ["a"], code: "482913" })).rejects.toMatchObject({ statusCode: 403 });
  });

  it("will not mix two customers in one confirmation", async () => {
    vi.mocked(listWarehouseOrders).mockResolvedValue([order("a"), order("b", { user_id: "u-2" })] as never);
    await expect(completeDelivery(driver, { order_ids: ["a", "b"], code: "482913" })).rejects.toMatchObject({ statusCode: 400 });
  });
});

describe("the hand-over photo", () => {
  it("is filed as a delivery photo without the hub email", async () => {
    vi.mocked(q.listDeliveryRows).mockResolvedValue([row("a")] as never);
    await uploadDeliveryPhotos(driver, "a", [Buffer.from("x")]);
    expect(uploadOrderPhotos).toHaveBeenCalledWith(
      expect.objectContaining({ id: "d-1", role: "driver" }),
      expect.objectContaining({ orderId: "a", kind: "delivered", notify: false }),
    );
  });
});
