import { describe, expect, it } from "vitest";

import { deliveryLock } from "../delivery-lock";

const NOW = new Date("2026-11-24T12:00:00Z");
const plan = (cutoffAt: string, departsOn: string, basis: "flown" | "hub_arrival" | "expected_hub_arrival" = "expected_hub_arrival") =>
  ({
    kind: "firm",
    flight: { carrier: "Delta Cargo", origin: "JFK", destination: "ACC", departsOn, cutoffAt },
    deliveryOn: "2026-12-01",
    basis,
  }) as const;

describe("deliveryLock", () => {
  it("is open with no deadline before any flight is booked", () => {
    expect(deliveryLock({ groupStatus: "paid", orders: [{ status: "paid" }], plans: [], now: NOW })).toEqual({ editable: true, until: null, flightOn: null });
  });

  it("closes at the earliest cutoff across the checkout", () => {
    const out = deliveryLock({
      groupStatus: "paid",
      orders: [{ status: "processing" }, { status: "processing" }],
      plans: [plan("2026-12-03T00:00:00Z", "2026-12-04"), plan("2026-11-26T00:00:00Z", "2026-11-27")],
      now: NOW,
    });
    expect(out).toEqual({ editable: true, until: "2026-11-26T00:00:00Z", flightOn: "2026-11-27" });
  });

  it("is locked once that cutoff has passed", () => {
    const out = deliveryLock({ groupStatus: "paid", orders: [{ status: "processing" }], plans: [plan("2026-11-24T00:00:00Z", "2026-11-25")], now: NOW });
    expect(out).toMatchObject({ editable: false, reason: expect.stringMatching(/box for its flight has closed/) });
  });

  it("is locked once anything has left the hub, or flown", () => {
    expect(deliveryLock({ groupStatus: "paid", orders: [{ status: "processing" }, { status: "in_transit" }], plans: [], now: NOW })).toMatchObject({ editable: false });
    expect(deliveryLock({ groupStatus: "paid", orders: [{ status: "processing" }], plans: [plan("2026-12-01T00:00:00Z", "2026-12-02", "flown")], now: NOW })).toMatchObject({ editable: false });
  });

  it("ignores cancelled lines, and refuses unpaid or fully cancelled checkouts", () => {
    expect(deliveryLock({ groupStatus: "paid", orders: [{ status: "cancelled" }, { status: "paid" }], plans: [], now: NOW })).toMatchObject({ editable: true });
    expect(deliveryLock({ groupStatus: "paid", orders: [{ status: "cancelled" }], plans: [], now: NOW })).toMatchObject({ editable: false });
    expect(deliveryLock({ groupStatus: "pending", orders: [{ status: "pending" }], plans: [], now: NOW })).toMatchObject({ editable: false });
  });
});
