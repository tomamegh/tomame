import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/env", () => ({ env: { app: { url: "https://tomame.test" } } }));
vi.mock("@/db/queries/notifications", () => ({
  getRecipientEmail: vi.fn(async () => null),
  insertNotification: vi.fn(async () => ({ id: "n1" })),
  markNotificationDelivered: vi.fn(),
}));
vi.mock("@/lib/email/notify-preference", () => ({ mayEmailUser: vi.fn(async () => false) }));
vi.mock("@/lib/email/transport", () => ({ sendEmail: vi.fn() }));
vi.mock("@/features/notifications/services/whatsapp.service", () => ({ queueWhatsApp: vi.fn(async () => "queued") }));
vi.mock("@/db/queries/order-whatsapp", () => ({ getOrderNotifyFacts: vi.fn() }));

import { getOrderNotifyFacts } from "@/db/queries/order-whatsapp";
import { queueWhatsApp } from "@/features/notifications/services/whatsapp.service";
import { notifyShipmentUpdate, type ShipmentNotifyInput } from "../shipment-notify.service";

const base: ShipmentNotifyInput = {
  kind: "stage",
  userId: "u1",
  stageKey: "out_for_delivery",
  stageTitle: "Out for delivery",
  description: "With our rider and on the way to you.",
  message: null,
  expectedOn: null,
  orders: [{ id: "o1", orderNo: "TM-00042", productName: "Shoes" }],
  contact: null,
};

beforeEach(() => vi.clearAllMocks());

describe("notifyShipmentUpdate — WhatsApp", () => {
  it("names the checkout area on Out for delivery, once per order and stage", async () => {
    vi.mocked(getOrderNotifyFacts).mockResolvedValue({
      delivery: { kind: "door", area: "East Legon", zone_name: "Greater Accra" },
      eta_to: null,
      estimated_delivery_date: null,
    });
    await notifyShipmentUpdate(base);
    const call = vi.mocked(queueWhatsApp).mock.calls[0]![0];
    expect(call.message).toMatchObject({ template: "stage_out_for_delivery", params: ["TM-00042", "East Legon"] });
    expect(call.dedupeKey).toBe("whatsapp_stage:o1:stage_out_for_delivery");
    expect(call.orderIds).toEqual(["o1"]);
  });

  it("falls back to the zone, and never sends 'your address'", async () => {
    vi.mocked(getOrderNotifyFacts).mockResolvedValue({ delivery: { kind: "pickup", zone_name: "Weija hub" }, eta_to: null, estimated_delivery_date: null });
    await notifyShipmentUpdate(base);
    expect(vi.mocked(queueWhatsApp).mock.calls[0]![0].message).toMatchObject({ params: ["TM-00042", "Weija hub"] });

    vi.mocked(getOrderNotifyFacts).mockResolvedValue({ delivery: null, eta_to: null, estimated_delivery_date: null });
    await notifyShipmentUpdate(base);
    const generic = vi.mocked(queueWhatsApp).mock.calls[1]![0].message;
    expect(generic?.template).toBe("shipment_update");
    expect(JSON.stringify(generic)).not.toContain("your address");
  });

  it("puts the order's window into 'Expected in Accra'", async () => {
    vi.mocked(getOrderNotifyFacts).mockResolvedValue({ delivery: null, eta_to: "2026-11-27", estimated_delivery_date: null });
    await notifyShipmentUpdate({ ...base, stageKey: "departed", orderStatus: "in_transit" });
    expect(vi.mocked(queueWhatsApp).mock.calls[0]![0].message).toMatchObject({ template: "stage_in_flight", params: ["TM-00042", "Fri 27 Nov"] });
  });
});
