import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/env", () => ({ env: { app: { url: "https://tomame.test" } } }));
vi.mock("@/db/queries/order-courier", () => ({ getCourierOrder: vi.fn(), getOwnedOrderCourier: vi.fn(), setCourierRebook: vi.fn(async () => true) }));
vi.mock("@/features/order-delivery/services/delivery-change.service", async () => {
  const { DEFAULT_WINDOW_SLOTS } = await import("../delivery-windows");
  return { loadWindowSlots: vi.fn(async () => [...DEFAULT_WINDOW_SLOTS]) };
});
vi.mock("@/features/audit/services/audit.service", () => ({ logAuditEvent: vi.fn(async () => undefined) }));
vi.mock("@/features/notifications/services/customer-notify.service", () => ({ notifyCustomer: vi.fn(async () => undefined) }));
vi.mock("@/features/orders/services/order-events.service", () => ({ recordOrderEvent: vi.fn(async () => undefined) }));
vi.mock("@/features/staff-alerts/notify", () => ({ notifyStaff: vi.fn() }));

import { getCourierOrder, getOwnedOrderCourier, setCourierRebook } from "@/db/queries/order-courier";
import { notifyCustomer } from "@/features/notifications/services/customer-notify.service";
import { recordOrderEvent } from "@/features/orders/services/order-events.service";
import { notifyStaff } from "@/features/staff-alerts/notify";
import type { PlatformUser } from "@/features/users/types";

import { getRebookView, rebookDelivery } from "../services/rider-rebook.service";

const NOW = new Date("2026-11-24T10:30:00Z");
const user = { id: "u1" } as PlatformUser;
const courier = {
  orderId: "o1", name: "Kofi", phone: "+233244123456", trackingUrl: null, provider: null, dispatchedAt: "2026-11-24T08:00:00Z",
  dispatchedBy: "w1", lastNotifiedAt: null, window: { start: "2026-11-24T09:00:00Z", end: "2026-11-24T11:00:00Z" }, rebook: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getCourierOrder).mockResolvedValue({ id: "o1", order_no: "TM-1", user_id: "u1", status: "in_transit", product_name: "Kettle", quantity: 1, order_group_id: "g1" });
  vi.mocked(getOwnedOrderCourier).mockResolvedValue(courier);
});

describe("rebookDelivery", () => {
  it("books an offered window, tells staff and confirms once", async () => {
    const out = await rebookDelivery(user, "o1", { start: "2026-11-24T15:00:00.000Z" }, NOW);
    expect(setCourierRebook).toHaveBeenCalledWith("u1", "o1", { start: "2026-11-24T15:00:00.000Z", end: "2026-11-24T18:00:00.000Z" }, NOW.toISOString());
    expect(out.rebooked).toMatchObject({ label: "today, 3–6pm" });
    expect(notifyStaff).toHaveBeenCalledWith(expect.objectContaining({ kind: "delivery_rebooked", orderId: "o1", window: "today, 3–6pm" }));
    expect(vi.mocked(recordOrderEvent).mock.calls[0]![0]).toMatchObject({ title: "Delivery rebooked" });
    expect(notifyCustomer).toHaveBeenCalledTimes(1);
    expect(vi.mocked(notifyCustomer).mock.calls[0]![0].event).toBe("delivery_rebooked");
  });

  it("refuses a window it does not offer", async () => {
    await expect(rebookDelivery(user, "o1", { start: "2026-11-24T03:00:00Z" }, NOW)).rejects.toMatchObject({ statusCode: 400 });
    expect(setCourierRebook).not.toHaveBeenCalled();
  });

  it("refuses someone else's order, and one with no rider yet", async () => {
    vi.mocked(getCourierOrder).mockResolvedValueOnce({ id: "o1", order_no: "TM-1", user_id: "u2", status: "in_transit", product_name: "Kettle", quantity: 1, order_group_id: null });
    await expect(rebookDelivery(user, "o1", { start: "2026-11-24T15:00:00Z" }, NOW)).rejects.toMatchObject({ statusCode: 404 });
    vi.mocked(getOwnedOrderCourier).mockResolvedValueOnce(null);
    await expect(rebookDelivery(user, "o1", { start: "2026-11-24T15:00:00Z" }, NOW)).rejects.toMatchObject({ statusCode: 409 });
  });
});

describe("getRebookView", () => {
  it("is null until the order is out for delivery with a rider", async () => {
    expect(await getRebookView("u1", "o1", "processing", NOW)).toBeNull();
    vi.mocked(getOwnedOrderCourier).mockResolvedValueOnce(null);
    expect(await getRebookView("u1", "o1", "in_transit", NOW)).toBeNull();
  });

  it("offers the next windows and shows a standing rebook", async () => {
    vi.mocked(getOwnedOrderCourier).mockResolvedValueOnce({ ...courier, rebook: { requestedAt: "x", start: "2026-11-25T09:00:00Z", end: "2026-11-25T12:00:00Z" } });
    const view = await getRebookView("u1", "o1", "in_transit", NOW);
    expect(view?.options[0]?.label).toBe("today, 12–3pm");
    expect(view?.rebooked?.label).toBe("tomorrow, 9am–12pm");
  });
});
