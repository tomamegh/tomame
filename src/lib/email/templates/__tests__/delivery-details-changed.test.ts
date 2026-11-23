import { describe, expect, it } from "vitest";

import { deliveryDetailsChangedTemplate } from "../delivery-details-changed";

describe("deliveryDetailsChangedTemplate", () => {
  it("names the new destination, the rider's number and the deadline", () => {
    const t = deliveryDetailsChangedTemplate({
      deliverTo: { label: "Office · Osu", kind: "door", lines: ["Ama", "5 Ring Rd", "Accra"] },
      phone: "+233 20 777 8888",
      items: [{ orderNo: "TM-1", productName: "Kettle" }],
      until: "2026-11-26T00:00:00Z",
      journeyUrl: "https://tomame.test/app/orders/o1",
    });
    expect(t.subject).toBe("Delivery changed: Kettle");
    expect(t.html).toContain("It now goes to <strong>Office · Osu</strong>");
    expect(t.html).toContain("Rider calls");
    expect(t.html).toContain("until Thu 26 Nov, 00:00 (Accra time)");
  });

  it("says the deadline comes later when no flight is booked", () => {
    const t = deliveryDetailsChangedTemplate({
      deliverTo: { label: "Pickup · Weija hub", kind: "pickup", lines: [] },
      phone: null,
      items: [{ orderNo: "TM-1", productName: "Kettle" }, { orderNo: "TM-2", productName: "Lamp" }],
      until: null,
      journeyUrl: "https://tomame.test/app/orders/o1",
    });
    expect(t.subject).toBe("Delivery changed: 2 of your orders");
    expect(t.html).toContain("until its flight is booked");
    expect(t.html).not.toContain("Rider calls");
  });
});
