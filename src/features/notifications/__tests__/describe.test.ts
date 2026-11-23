import { describe, expect, it } from "vitest";

import { describeNotification } from "../describe";

describe("describeNotification", () => {
  it("names the order or product on every event seen on prod, never a machine slug", () => {
    expect(describeNotification("order_placed", { orderId: "o1", productName: "Sony WH-1000XM5", totalGhs: 2382.34 })).toEqual({
      title: "Order confirmed",
      detail: "Sony WH-1000XM5 · GH₵2,382.34 paid",
      href: "/app/orders/o1",
    });
    expect(describeNotification("order_placed_admin", { orderId: "o1", productName: "Kettle", totalGhs: 500 })).toMatchObject({ title: "New order (staff copy)", href: "/admin/orders/o1" });
    expect(describeNotification("parcel_photo_added", { order_no: "TM-00011", product_name: "Stroller", photo_count: 2, weight_lbs: 10.4, href: "/app/orders/x" })).toEqual({
      title: "Your Stroller is at our US hub",
      detail: "TM-00011 · 2 photos to check · weighed 10.4 lb",
      href: "/app/orders/x",
    });
    expect(describeNotification("sourcing_available", { product_name: "PS5 Pro", note: null })).toMatchObject({ title: "We found PS5 Pro", href: "/app/watches" });
    expect(describeNotification("sourcing_unavailable", { product_name: "PS5 Pro" }).title).toBe("We couldn't find PS5 Pro");
    expect(describeNotification("price_drop", { product_name: "Kettle", current_total_ghs: "513.32", drop_pct: 0.16 }).detail).toBe("Now GH₵513.32 landed · down 16%");
    expect(describeNotification("payment_expired", { amount_ghs: 100 }).detail).toContain("You were not charged");
    expect(describeNotification("paste_priced", { store_host: "amazon.com", product_name: "Crocs" })).toMatchObject({ title: "Your amazon.com link is priced", detail: "Crocs" });
  });

  it("shows an announcement's own words, and never follows a link off the site", () => {
    expect(describeNotification("announcement", { title: "New: MoMo in one tap", body: "Pay faster." })).toMatchObject({ title: "New: MoMo in one tap", detail: "Pay faster." });
    expect(describeNotification("paste_priced", { href: "https://evil.example" }).href).toBeNull();
    expect(describeNotification("paste_priced", { href: "//evil.example" }).href).toBeNull();
  });

  it("names a new delivery date, and the tracking message's firm date", () => {
    expect(describeNotification("delivery_date_changed", { order_count: 2, change: "moved", delivery_on: "2026-11-30", href: "/app/orders/x" })).toEqual({
      title: "New delivery date for 2 of your orders",
      detail: "Their flight moved. Now by Mon 30 Nov",
      href: "/app/orders/x",
    });
    expect(describeNotification("delivery_date_changed", { order_count: 1, order_no: "TM-1", change: "cancelled", delivery_on: "2026-12-05" })).toMatchObject({
      title: "New delivery date: TM-1",
      detail: "Its flight was cancelled. Now by Sat 5 Dec",
    });
    expect(describeNotification("store_tracking_added", { order_count: 1, order_no: "TM-1", delivery_on: "2026-12-01" }).detail).toBe("At your door by Tue 1 Dec");
    expect(describeNotification("store_tracking_added", { order_count: 1, order_no: "TM-1" }).detail).toBe("It is on its way to our US hub");
  });

  it("humanises an unknown event rather than printing the slug", () => {
    expect(describeNotification("welcome_back_admin", {}).title).toBe("Welcome back");
  });
});
