import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/env", () => ({ env: { app: { url: "https://tomame.test" } } }));
vi.mock("@/db/queries/order-courier", () => ({
  getCourierOrder: vi.fn(),
  getOrderCourier: vi.fn(),
  getOwnedOrderCourier: vi.fn(),
  getProfileDisplayName: vi.fn(),
  listOwnedOrderCouriers: vi.fn(),
  stampCourierNotified: vi.fn(),
  upsertOrderCourier: vi.fn(),
}));
vi.mock("@/db/queries/notifications", () => ({
  getRecipientEmail: vi.fn(),
  insertNotification: vi.fn(),
  markNotificationDelivered: vi.fn(),
}));
vi.mock("@/features/audit/services/audit.service", () => ({ logAuditEvent: vi.fn() }));
vi.mock("@/features/orders/services/order-events.service", () => ({ recordOrderEvent: vi.fn() }));
vi.mock("@/lib/email/notify-preference", () => ({ mayEmailUser: vi.fn() }));
vi.mock("@/lib/email/transport", () => ({ sendEmail: vi.fn() }));

import {
  getCourierOrder,
  getOrderCourier,
  getOwnedOrderCourier,
  stampCourierNotified,
  upsertOrderCourier,
} from "@/db/queries/order-courier";
import { getRecipientEmail, insertNotification, markNotificationDelivered } from "@/db/queries/notifications";
import { logAuditEvent } from "@/features/audit/services/audit.service";
import { recordOrderEvent } from "@/features/orders/services/order-events.service";
import type { PlatformUser } from "@/features/users/types";
import { mayEmailUser } from "@/lib/email/notify-preference";
import { sendEmail } from "@/lib/email/transport";
import { courierHandoffSchema } from "../schema";
import { dispatchOrderCourier, getCourierForViewer } from "../services/courier.service";
import type { OrderCourier } from "../types";

const admin = { id: "admin-1", app_metadata: { role: "admin" } } as unknown as PlatformUser;
const notAdmin = { id: "u-2", app_metadata: {}, profile: { role: "admin" } } as unknown as PlatformUser;
const NOW = new Date("2026-09-30T12:00:00Z");

const order = {
  id: "o1",
  order_no: "TM-00042",
  user_id: "cust-1",
  status: "in_transit",
  product_name: "Nike Air Max 90",
  quantity: 1,
  order_group_id: null,
};

const input = courierHandoffSchema.parse({
  courier_name: "Kofi",
  courier_phone: "024 412 3456",
  tracking_url: "https://yango.com/t/abc",
});

function stored(overrides: Partial<OrderCourier> = {}): OrderCourier {
  return {
    orderId: "o1",
    name: "Kofi",
    phone: "+233244123456",
    trackingUrl: "https://yango.com/t/abc",
    provider: "yango",
    dispatchedAt: "2026-09-30T11:00:00.000Z",
    dispatchedBy: "admin-1",
    lastNotifiedAt: "2026-09-30T11:00:00.000Z",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getCourierOrder).mockResolvedValue(order);
  vi.mocked(getOrderCourier).mockResolvedValue(null);
  vi.mocked(upsertOrderCourier).mockImplementation(async (w) => ({
    orderId: w.orderId,
    name: w.name,
    phone: w.phone,
    trackingUrl: w.trackingUrl,
    provider: w.provider,
    dispatchedAt: w.dispatchedAt,
    dispatchedBy: w.dispatchedBy,
    lastNotifiedAt: null,
  }));
  vi.mocked(insertNotification).mockResolvedValue({ id: "n1" } as never);
  vi.mocked(mayEmailUser).mockResolvedValue(true);
  vi.mocked(getRecipientEmail).mockResolvedValue("ama@example.com");
  vi.mocked(sendEmail).mockResolvedValue(undefined as never);
});

describe("dispatchOrderCourier — guards", () => {
  it("refuses a caller without the admin claim, even with profiles.role admin", async () => {
    await expect(dispatchOrderCourier(notAdmin, "o1", input, NOW)).rejects.toMatchObject({ statusCode: 403 });
    expect(upsertOrderCourier).not.toHaveBeenCalled();
  });

  it("404s an unknown order", async () => {
    vi.mocked(getCourierOrder).mockResolvedValue(null);
    await expect(dispatchOrderCourier(admin, "nope", input, NOW)).rejects.toMatchObject({ statusCode: 404 });
  });

  it.each(["paid", "processing", "delivered", "cancelled"])("refuses an order that is %s", async (status) => {
    vi.mocked(getCourierOrder).mockResolvedValue({ ...order, status });
    await expect(dispatchOrderCourier(admin, "o1", input, NOW)).rejects.toMatchObject({ statusCode: 409 });
    expect(upsertOrderCourier).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
  });
});

describe("dispatchOrderCourier — first hand-off", () => {
  it("saves, audits with a masked phone, writes a timeline event and notifies", async () => {
    const result = await dispatchOrderCourier(admin, "o1", input, NOW);

    expect(result.action).toBe("order_courier_dispatched");
    expect(result.notification).toBe("notified");
    expect(result.courier.lastNotifiedAt).toBe(NOW.toISOString());

    expect(upsertOrderCourier).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId: "o1",
        userId: "cust-1",
        phone: "+233244123456",
        provider: "yango",
        dispatchedAt: NOW.toISOString(),
        dispatchedBy: "admin-1",
      }),
    );

    const audit = vi.mocked(logAuditEvent).mock.calls[0]![0];
    expect(audit).toMatchObject({ action: "order_courier_dispatched", entityType: "order", entityId: "o1" });
    expect(JSON.stringify(audit.metadata)).not.toContain("244123456");
    expect(audit.metadata).toMatchObject({ courier_phone: "+233 24 *** 3456", tracking_host: "yango.com" });

    expect(recordOrderEvent).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "out_for_delivery", title: "A rider has your package" }),
    );

    const notification = vi.mocked(insertNotification).mock.calls[0]![0];
    expect(notification).toMatchObject({ user_id: "cust-1", channel: "email", event: "courier_dispatched" });
    expect(notification.payload).toMatchObject({ href: "/app/orders/o1", is_update: false });
    expect(JSON.stringify(notification.payload)).not.toContain("244123456");

    const email = vi.mocked(sendEmail).mock.calls[0]![0];
    expect(email.to).toBe("ama@example.com");
    expect(email.html).toContain('href="tel:+233244123456"');
    expect(email.html).toContain("Track your rider on Yango");
    expect(markNotificationDelivered).toHaveBeenCalledWith("n1", expect.objectContaining({ status: "sent" }));
    expect(stampCourierNotified).toHaveBeenCalledWith("o1", NOW.toISOString());
  });

  it("does not email a customer who switched email off, but still rings the bell", async () => {
    vi.mocked(mayEmailUser).mockResolvedValue(false);
    const result = await dispatchOrderCourier(admin, "o1", input, NOW);
    expect(sendEmail).not.toHaveBeenCalled();
    expect(insertNotification).toHaveBeenCalled();
    expect(result.notification).toBe("notified");
  });

  it("keeps the save when the email transport fails, and says so", async () => {
    vi.mocked(sendEmail).mockRejectedValue(new Error("Resend 401"));
    const result = await dispatchOrderCourier(admin, "o1", input, NOW);
    expect(result.notification).toBe("email_failed");
    expect(upsertOrderCourier).toHaveBeenCalled();
    expect(logAuditEvent).toHaveBeenCalled();
    expect(markNotificationDelivered).toHaveBeenCalledWith("n1", expect.objectContaining({ status: "failed" }));
  });
});

describe("dispatchOrderCourier — re-sending", () => {
  it("sends changed details as an update, keeping the first dispatch time", async () => {
    vi.mocked(getOrderCourier).mockResolvedValue(stored({ trackingUrl: "https://yango.com/t/old" }));
    const result = await dispatchOrderCourier(admin, "o1", input, NOW);

    expect(result.action).toBe("order_courier_updated");
    expect(upsertOrderCourier).toHaveBeenCalledWith(
      expect.objectContaining({ dispatchedAt: "2026-09-30T11:00:00.000Z" }),
    );
    expect(vi.mocked(logAuditEvent).mock.calls[0]![0].action).toBe("order_courier_updated");
    expect(vi.mocked(sendEmail).mock.calls[0]![0].subject).toMatch(/Updated rider details/);
  });

  it("treats identical details sent moments ago as a double submit", async () => {
    vi.mocked(getOrderCourier).mockResolvedValue(stored({ lastNotifiedAt: "2026-09-30T11:59:30.000Z" }));
    const result = await dispatchOrderCourier(admin, "o1", input, NOW);

    expect(result).toMatchObject({ action: "duplicate", notification: "skipped" });
    expect(upsertOrderCourier).not.toHaveBeenCalled();
    expect(logAuditEvent).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("re-sends identical details once the double-submit window has passed", async () => {
    vi.mocked(getOrderCourier).mockResolvedValue(stored({ lastNotifiedAt: "2026-09-30T11:00:00.000Z" }));
    const result = await dispatchOrderCourier(admin, "o1", input, NOW);
    expect(result.action).toBe("order_courier_updated");
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });
});

describe("getCourierForViewer", () => {
  it("answers null for a signed-out viewer without querying", async () => {
    expect(await getCourierForViewer(null, "o1")).toBeNull();
    expect(getOwnedOrderCourier).not.toHaveBeenCalled();
  });

  it("scopes the read to the viewer and swallows failures", async () => {
    vi.mocked(getOwnedOrderCourier).mockResolvedValue(stored());
    expect(await getCourierForViewer("cust-1", "o1")).toMatchObject({ name: "Kofi" });
    expect(getOwnedOrderCourier).toHaveBeenCalledWith("cust-1", "o1");

    vi.mocked(getOwnedOrderCourier).mockRejectedValue(new Error("boom"));
    expect(await getCourierForViewer("cust-1", "o1")).toBeNull();
  });
});
