import { describe, expect, it } from "vitest";

import { KIND_EVENT_PREFIXES, NOTIFICATION_KINDS, notificationKind } from "../notification-kind";

describe("notificationKind (Fix 8)", () => {
  it("files every event seen on prod under orders, quotes or account", () => {
    const orders = ["order_placed", "order_placed_admin", "order_expired_unpaid", "payment_expired", "shipment_update", "parcel_photo_added", "store_tracking_added", "delivery_date_changed", "delivery_details_changed", "courier_dispatched", "order_repriced"];
    const quotes = ["paste_priced", "paste_unreadable", "price_drop", "sourcing_available", "sourcing_unavailable", "car_enquiry_answered"];
    for (const e of orders) expect(notificationKind(e)).toBe("orders");
    for (const e of quotes) expect(notificationKind(e)).toBe("quotes");
    expect(notificationKind("welcome")).toBe("account");
    expect(notificationKind("new_signup")).toBe("account");
  });

  it("offers All plus the three kinds, and the SQL prefixes agree with the matcher", () => {
    expect(NOTIFICATION_KINDS.map((k) => k.key)).toEqual(["all", "orders", "quotes", "account"]);
    for (const p of KIND_EVENT_PREFIXES.orders) expect(notificationKind(`${p}x`)).toBe("orders");
    for (const p of KIND_EVENT_PREFIXES.quotes) expect(notificationKind(`${p}x`)).toBe("quotes");
  });
});
