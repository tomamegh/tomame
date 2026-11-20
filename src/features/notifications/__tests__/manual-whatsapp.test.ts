import { describe, expect, it } from "vitest";

import { deliveryArea, manualWhatsAppEntries } from "../manual-whatsapp";

const ev = (kind: string, at: string) => ({ kind, title: kind, detail: null, location: null, occurred_at: `${at}T10:00:00.000Z` });
const order = { id: "o1", order_no: "TM-00042", status: "in_transit", product_name: "Oraimo BoomPop N" };

describe("manualWhatsAppEntries", () => {
  it("offers one filled-in message per stage reached, in the brief's words", () => {
    const entries = manualWhatsAppEntries({
      order,
      customer: { firstName: "Ama Serwaa", phone: "024 412 3456" },
      events: [ev("payment_received", "2026-11-01"), ev("purchased", "2026-11-02"), ev("hub_received", "2026-11-06"), ev("departed", "2026-11-07")],
      sends: [{ stage: "paid", sent_at: "2026-11-01T11:00:00.000Z", sender_name: "Kelvin" }],
      area: "East Legon",
    });
    expect(entries.map((e) => e.stageName)).toEqual([
      "Paid — order confirmed",
      "Purchased from the store",
      "Arrived at our US hub",
      "In flight to Accra",
    ]);
    expect(entries[0]?.sent).toEqual({ at: "2026-11-01T11:00:00.000Z", by: "Kelvin" });
    expect(entries[3]?.text).toBe(
      "Hi Ama, In flight to Accra: Oraimo BoomPop N (order TM-00042) left our US hub on Sat 7 Nov. We'll message you when it lands.",
    );
    expect(entries[3]?.href).toMatch(/^https:\/\/wa\.me\/233244123456\?text=Hi%20Ama%2C%20In%20flight/);
  });

  it("fills the area into Out for delivery and offers nothing before payment", () => {
    const door = manualWhatsAppEntries({
      order: { ...order, status: "delivered" },
      customer: { firstName: null, phone: null },
      events: [ev("out_for_delivery", "2026-11-12")],
      sends: [],
      area: "East Legon",
    });
    expect(door.find((e) => e.stage === "out_for_delivery")?.text).toContain("on the way to East Legon today");
    expect(door.at(-1)?.stageName).toBe("Delivered");
    expect(door[0]?.href).toBeNull();
    expect(manualWhatsAppEntries({ order: { ...order, status: "pending" }, customer: { firstName: null, phone: null }, events: [], sends: [], area: null })).toEqual([]);
  });

  it("reads the area off a door snapshot, falling back to the zone", () => {
    expect(deliveryArea({ kind: "door", area: "East Legon", city: "Accra" })).toBe("East Legon");
    expect(deliveryArea({ kind: "pickup", zone_name: "Weija hub" })).toBe("Weija hub");
    expect(deliveryArea(null)).toBeNull();
  });
});
