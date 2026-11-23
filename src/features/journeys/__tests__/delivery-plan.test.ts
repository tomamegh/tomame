import { describe, expect, it } from "vitest";

import { deliveryPlanFor, describePlan, type PlanDeparture } from "../delivery-plan";

const dep = (on: string): PlanDeparture => ({
  carrier: "Delta Cargo",
  origin: "JFK",
  destination: "ACC",
  departs_on: on,
  departs_at: `${on}T00:00:00Z`,
  cutoff_at: new Date(Date.parse(`${on}T00:00:00Z`) - 86_400_000).toISOString(),
});
// Wed 25, Fri 27 Nov, Wed 2, Fri 4 Dec 2026.
const DEPARTURES = [dep("2026-11-25"), dep("2026-11-27"), dep("2026-12-02"), dep("2026-12-04")];

describe("the two-stage delivery promise (Fix 6)", () => {
  it("shows only the usual range, and why, until the store's tracking is in", () => {
    const plan = deliveryPlanFor({ status: "processing", storeTracking: null, shippedOn: null, departures: DEPARTURES, estimate: { from: "2026-11-28", to: "2026-11-30" } });
    expect(plan).toMatchObject({ kind: "estimate", range: "usually 5–7 days" });
    expect(describePlan(plan!).detail).toMatch(/Wednesday or Friday Delta Cargo/);
  });

  it("books the first Wed/Fri flight whose cutoff is after the expected hub arrival once tracking is in", () => {
    // Registered Sat 21 Nov → expected at the hub Tue 24 Nov → the Wed 25 cutoff (Tue 24 00:00) has passed → Fri 27.
    const plan = deliveryPlanFor({
      status: "processing",
      storeTracking: { registeredAt: "2026-11-21T10:00:00Z", arrivedAt: null },
      shippedOn: null,
      departures: DEPARTURES,
      estimate: null,
    });
    expect(plan).toMatchObject({ kind: "firm", flight: { departsOn: "2026-11-27", carrier: "Delta Cargo" }, deliveryOn: "2026-11-30", basis: "expected_hub_arrival" });
    expect(describePlan(plan!)).toMatchObject({ label: "At your door", line: "By Mon 30 Nov" });
  });

  it("moves to the real hub arrival once the parcel is in", () => {
    const plan = deliveryPlanFor({
      status: "processing",
      storeTracking: { registeredAt: "2026-11-21T10:00:00Z", arrivedAt: "2026-11-23T15:00:00Z" },
      shippedOn: null,
      departures: DEPARTURES,
      estimate: null,
    });
    expect(plan).toMatchObject({ kind: "firm", flight: { departsOn: "2026-11-25" }, basis: "hub_arrival" });
  });

  it("uses the flight the package actually took once it has shipped", () => {
    const plan = deliveryPlanFor({ status: "in_transit", storeTracking: null, shippedOn: dep("2026-12-02"), departures: DEPARTURES, estimate: null });
    expect(plan).toMatchObject({ kind: "firm", basis: "flown", deliveryOn: "2026-12-05" });
  });

  it("never promises a later flight for an order already in the air with no flight on record (TM-00036 on prod)", () => {
    const hub = "2026-11-17T10:00:00Z";
    expect(deliveryPlanFor({ status: "in_transit", storeTracking: null, hubArrivedAt: hub, shippedOn: null, departures: DEPARTURES, estimate: null })).toBeNull();
  });

  it("says any day now, never a date already gone, for a flight that landed past its usual door date", () => {
    const plan = deliveryPlanFor({ status: "in_transit", storeTracking: null, shippedOn: dep("2026-11-18"), departures: DEPARTURES, estimate: null })!;
    expect(describePlan(plan, new Date("2026-11-23T12:00:00Z"))).toMatchObject({ line: "Any day now" });
    expect(describePlan(plan, new Date("2026-11-19T12:00:00Z")).line).toMatch(/^By /);
  });

  it("promises nothing for an unpaid, cancelled or delivered order", () => {
    for (const status of ["pending", "cancelled", "delivered", "completed"]) {
      expect(deliveryPlanFor({ status, storeTracking: null, shippedOn: null, departures: DEPARTURES, estimate: null })).toBeNull();
    }
  });
});

describe("a hub arrival makes it firm even without store tracking (Fix 6)", () => {
  it("books the first flight after the parcel was logged in at the hub", () => {
    const plan = deliveryPlanFor({ status: "processing", storeTracking: null, hubArrivedAt: "2026-11-26T09:00:00Z", shippedOn: null, departures: DEPARTURES, estimate: null });
    // Logged in Thu 26 Nov 09:00, after the Fri 27 cutoff (Thu 00:00): the Wed 2 Dec flight.
    expect(plan).toMatchObject({ kind: "firm", flight: { departsOn: "2026-12-02" }, basis: "hub_arrival" });
  });
});
