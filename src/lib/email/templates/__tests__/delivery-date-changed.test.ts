import { describe, expect, it } from "vitest";
import { deliveryDateChangedTemplate } from "../delivery-date-changed";

describe("deliveryDateChangedTemplate", () => {
  it("lists each order with its new door date and says why", () => {
    const t = deliveryDateChangedTemplate({
      change: "moved",
      flight: "Delta Cargo JFK → Accra, Thu 26 Nov",
      items: [
        { orderNo: "TM-00003", productName: "Anker 737 Power Bank", deliveryOn: "Sun 29 Nov" },
        { orderNo: "TM-00004", productName: "Stanley Quencher 40 oz", deliveryOn: "Sun 29 Nov" },
      ],
      journeyUrl: "https://tomame.test/app/orders/x",
    });
    expect(t.subject).toBe("New delivery date: 2 of your orders");
    expect(t.html).toContain("The flight your orders are booked on has moved. They now fly on Delta Cargo JFK → Accra, Thu 26 Nov.");
    expect(t.html).toContain("TM-00004 · Stanley Quencher 40 oz");
    expect(t.html).toContain("By Sun 29 Nov");
  });

  it("words a cancelled flight for one order", () => {
    const t = deliveryDateChangedTemplate({
      change: "cancelled",
      flight: "Delta Cargo JFK → Accra, Wed 2 Dec",
      items: [{ orderNo: "TM-1", productName: "Kettle", deliveryOn: "Sat 5 Dec" }],
      journeyUrl: "https://tomame.test/app/orders/x",
    });
    expect(t.subject).toBe("New delivery date: Kettle");
    expect(t.html).toContain("The flight your order was booked on was cancelled. It now flies on Delta Cargo JFK → Accra, Wed 2 Dec.");
  });
});
