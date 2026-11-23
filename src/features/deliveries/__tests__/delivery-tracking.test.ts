import { describe, expect, it } from "vitest";

import { missingWindow, trackingCellOf } from "../delivery-tracking";

const order = (over: Record<string, unknown> = {}) => ({ status: "completed", carrier: null, tracking_number: null, no_tracking_reason: null, ...over }) as Parameters<typeof trackingCellOf>[0];

describe("the Deliveries tracking cell (Fix 12)", () => {
  it("reads the air waybill off the package the order flew in", () => {
    expect(trackingCellOf(order(), { package_reference: "PKG-10028", carrier: "Delta Cargo", awb: "006-12345675", no_tracking_reason: null, shipped: true })).toMatchObject({
      kind: "tracked",
      number: "006-12345675",
      note: "PKG-10028",
    });
  });

  it("never calls a delivered order with nothing recorded 'Not shipped yet'", () => {
    expect(trackingCellOf(order({ status: "completed" }), null).kind).toBe("none_recorded");
    expect(trackingCellOf(order({ status: "processing" }), null).kind).toBe("not_shipped");
    expect(trackingCellOf(order({ status: "in_transit" }), null).kind).toBe("untracked_moving");
  });

  it("shows the reason when it shipped without an air waybill", () => {
    expect(trackingCellOf(order({ status: "in_transit" }), { package_reference: "PKG-1", carrier: null, awb: null, no_tracking_reason: "Hand-carried", shipped: true })).toEqual({
      kind: "no_awb",
      reason: "Hand-carried",
    });
  });

  it("keeps the store's own tracking on an order shipped by an admin (TM-00002)", () => {
    expect(trackingCellOf(order({ carrier: "UPS", tracking_number: "1ze3500b0334960616" }), null)).toMatchObject({ kind: "tracked", carrier: "UPS" });
  });

  it("flags a dispatched order with no window", () => {
    expect(missingWindow({ status: "in_transit" }, null)).toBe(true);
    expect(missingWindow({ status: "in_transit" }, "Thu 18 – Sat 20 Nov")).toBe(false);
    expect(missingWindow({ status: "completed" }, null)).toBe(false);
  });
});
