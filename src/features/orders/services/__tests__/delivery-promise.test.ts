import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
const loadDeliveryWindow = vi.fn();
vi.mock("@/features/quotes/services/delivery-eta.service", () => ({ loadDeliveryWindow: (...a: unknown[]) => loadDeliveryWindow(...a) }));
const stampOrderPromise = vi.fn();
vi.mock("@/db/queries/order-promise", () => ({ stampOrderPromise: (...a: unknown[]) => stampOrderPromise(...a) }));

import { orderEta } from "@/features/journeys/order-facts";
import { orderPaidTemplate, promiseWindowText } from "@/lib/email/templates/order-status";
import { stampDeliveryPromise } from "../delivery-promise.service";

const NOW = new Date("2026-11-23T12:00:00Z");
const admin = {} as never;
const order = { id: "o1", origin_country: "USA" as const, promised_at: null };

beforeEach(() => {
  vi.clearAllMocks();
  loadDeliveryWindow.mockResolvedValue({ from: "2026-11-28", to: "2026-11-30" });
  stampOrderPromise.mockResolvedValue({ promised_from: "2026-11-28", promised_to: "2026-11-30", promised_at: NOW.toISOString() });
});

describe("stampDeliveryPromise", () => {
  it("promises the region's window counted from the paid day, and hands the stamped order on", async () => {
    const out = await stampDeliveryPromise(admin, order, NOW);
    expect(loadDeliveryWindow).toHaveBeenCalledWith("USA", NOW);
    expect(stampOrderPromise).toHaveBeenCalledWith(admin, "o1", { from: "2026-11-28", to: "2026-11-30" }, NOW);
    expect(out).toMatchObject({ id: "o1", promised_from: "2026-11-28", promised_to: "2026-11-30" });
  });

  it("never moves a promise already made", async () => {
    const stamped = { ...order, promised_at: "2026-11-20T10:00:00Z" };
    await expect(stampDeliveryPromise(admin, stamped, NOW)).resolves.toBe(stamped);
    expect(stampOrderPromise).not.toHaveBeenCalled();
  });

  it("promises nothing for a region with no transit days", async () => {
    loadDeliveryWindow.mockResolvedValue(null);
    await expect(stampDeliveryPromise(admin, order, NOW)).resolves.toBe(order);
    expect(stampOrderPromise).not.toHaveBeenCalled();
  });

  it("never throws: a failed stamp leaves the payment to settle", async () => {
    stampOrderPromise.mockRejectedValue(new Error("db down"));
    await expect(stampDeliveryPromise(admin, order, NOW)).resolves.toBe(order);
  });
});

describe("orderEta with a payment-time promise", () => {
  const base = { estimated_delivery_date: null, pricing: { delivery_eta_from: "2026-11-27", delivery_eta_to: "2026-11-29" } as never };

  it("prefers the window promised at payment over the quote's", () => {
    expect(orderEta({ ...base, promised_from: "2026-11-28", promised_to: "2026-11-30" })).toEqual({ from: "2026-11-28", to: "2026-11-30", source: "estimated" });
  });

  it("still yields to a window an operator confirmed", () => {
    expect(orderEta({ ...base, eta_from: "2026-12-01", eta_to: "2026-12-02", promised_from: "2026-11-28", promised_to: "2026-11-30" })?.source).toBe("confirmed");
  });
});

describe("the payment confirmation email", () => {
  it("states the promised window and that a firm date follows the store's tracking", () => {
    const mail = orderPaidTemplate({ productName: "Air Max 90", orderId: "o1", trackingNumber: "TM-00042", promise: { from: "2026-11-28", to: "2026-11-30" } });
    expect(mail.text).toContain("Estimated delivery: Sat 28 Nov – Mon 30 Nov");
    expect(mail.text).toContain("firm date");
  });

  it("says nothing about delivery when no promise was made", () => {
    expect(orderPaidTemplate({ productName: "Air Max 90", orderId: "o1" }).text).not.toContain("Estimated delivery");
  });

  it("prints a one-day window as one day", () => {
    expect(promiseWindowText({ from: "2026-11-28", to: "2026-11-28" })).toBe("Sat 28 Nov");
  });
});
