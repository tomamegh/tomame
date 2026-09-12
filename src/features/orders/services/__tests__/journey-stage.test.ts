import { describe, it, expect } from "vitest";

// No mocks: journey-stage is pure and framework-free by design. If this file
// ever needs one, the module has grown a dependency it should not have.
import {
  JOURNEY_STOPS,
  describeJourney,
  journeyStageFor,
} from "../journey-stage";

describe("journeyStageFor — labels", () => {
  it("maps every order status to the agreed label", () => {
    const labels = Object.fromEntries(
      [
        "pending",
        "paid",
        "processing",
        "in_transit",
        "delivered",
        "completed",
        "cancelled",
      ].map((status) => [status, journeyStageFor(status).label]),
    );

    expect(labels).toEqual({
      pending: "Awaiting payment",
      paid: "Paid",
      processing: "Being purchased",
      in_transit: "In the air",
      delivered: "Delivered",
      completed: "Delivered",
      cancelled: "Cancelled",
    });
  });

  it('uses the "purchase" word, never "bought"', () => {
    expect(journeyStageFor("processing").label).toContain("purchased");
    expect(journeyStageFor("processing").label.toLowerCase()).not.toContain(
      "bought",
    );
    expect(JOURNEY_STOPS.map((stop) => stop.label)).toContain("Purchased");
  });
});

describe("journeyStageFor — stage position", () => {
  it("places each status at its stop on the five-stop track", () => {
    const positions = Object.fromEntries(
      [
        "pending",
        "paid",
        "processing",
        "in_transit",
        "delivered",
        "completed",
        "cancelled",
      ].map((status) => [status, journeyStageFor(status).trackPercent]),
    );

    expect(positions).toEqual({
      pending: 5,
      paid: 20,
      processing: 40,
      in_transit: 75,
      delivered: 100,
      completed: 100,
      cancelled: 0,
    });
  });

  it("never moves backwards through the shipping sequence", () => {
    const sequence = ["pending", "paid", "processing", "in_transit", "delivered"];
    const percents = sequence.map((s) => journeyStageFor(s).trackPercent);
    const sorted = [...percents].sort((a, b) => a - b);
    expect(percents).toEqual(sorted);
  });

  it("names a stop on the track for every shipping status", () => {
    const stopKeys = JOURNEY_STOPS.map((stop) => stop.key);
    for (const status of ["paid", "processing", "in_transit", "delivered", "completed"]) {
      expect(stopKeys).toContain(journeyStageFor(status).stopKey);
    }
  });

  it("leaves pending and cancelled off the track", () => {
    expect(journeyStageFor("pending").stopKey).toBeNull();
    expect(journeyStageFor("cancelled").stopKey).toBeNull();
  });

  it("exposes the five stops in order", () => {
    expect(JOURNEY_STOPS.map((stop) => stop.label)).toEqual([
      "Paid",
      "Purchased",
      "Hub",
      "In the air",
      "Your door",
    ]);
  });
});

describe("journeyStageFor — tone and flags", () => {
  it("assigns one colour token per state", () => {
    expect(journeyStageFor("pending").tone).toBe("amber");
    expect(journeyStageFor("paid").tone).toBe("coral");
    expect(journeyStageFor("processing").tone).toBe("coral");
    expect(journeyStageFor("in_transit").tone).toBe("coral");
    expect(journeyStageFor("delivered").tone).toBe("green");
    expect(journeyStageFor("completed").tone).toBe("green");
    expect(journeyStageFor("cancelled").tone).toBe("neutral");
  });

  it("flags the terminal states", () => {
    expect(journeyStageFor("delivered").isComplete).toBe(true);
    expect(journeyStageFor("completed").isComplete).toBe(true);
    expect(journeyStageFor("in_transit").isComplete).toBe(false);
    expect(journeyStageFor("cancelled").isCancelled).toBe(true);
    expect(journeyStageFor("delivered").isCancelled).toBe(false);
  });

  it("echoes the status it was given", () => {
    expect(journeyStageFor("in_transit").status).toBe("in_transit");
  });
});

describe("journeyStageFor — unknown status", () => {
  it("says so rather than guessing a position", () => {
    const stage = journeyStageFor("refunded");
    expect(stage.status).toBe("refunded");
    expect(stage.label).toBe("Unknown");
    expect(stage.stopKey).toBeNull();
    expect(stage.trackPercent).toBe(0);
    expect(stage.tone).toBe("neutral");
    expect(stage.isComplete).toBe(false);
    expect(stage.isCancelled).toBe(false);
  });

  it("survives empty and junk input", () => {
    expect(journeyStageFor("").label).toBe("Unknown");
    expect(journeyStageFor("constructor").label).toBe("Unknown");
    expect(journeyStageFor("__proto__").label).toBe("Unknown");
    expect(journeyStageFor("toString").trackPercent).toBe(0);
  });
});

describe("describeJourney — ETA", () => {
  it("returns the admin-entered date verbatim when one is set", () => {
    expect(
      describeJourney({
        status: "in_transit",
        estimatedDeliveryDate: "2026-09-19",
      }).etaDate,
    ).toBe("2026-09-19");
  });

  it("returns null when no date is set, and offers a hint instead", () => {
    const view = describeJourney({
      status: "processing",
      estimatedDeliveryDate: null,
    });
    expect(view.etaDate).toBeNull();
    expect(view.hint).toBe("Date set when it ships");
  });

  it("treats undefined and blank strings as not set", () => {
    expect(
      describeJourney({ status: "paid", estimatedDeliveryDate: undefined })
        .etaDate,
    ).toBeNull();
    expect(
      describeJourney({ status: "paid", estimatedDeliveryDate: "   " }).etaDate,
    ).toBeNull();
  });

  it("never fabricates a date for an in-transit order that has none", () => {
    const view = describeJourney({
      status: "in_transit",
      estimatedDeliveryDate: null,
    });
    expect(view.etaDate).toBeNull();
    expect(view.hint).toBe("Date to be confirmed");
  });

  it("carries the stage through unchanged", () => {
    const view = describeJourney({
      status: "delivered",
      estimatedDeliveryDate: "2026-09-01",
    });
    expect(view.label).toBe("Delivered");
    expect(view.trackPercent).toBe(100);
    expect(view.tone).toBe("green");
  });

  it("handles an unknown status with a date attached", () => {
    const view = describeJourney({
      status: "lost",
      estimatedDeliveryDate: "2026-09-19",
    });
    expect(view.label).toBe("Unknown");
    expect(view.etaDate).toBe("2026-09-19");
  });
});
