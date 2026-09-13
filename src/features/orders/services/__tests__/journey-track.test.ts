import { describe, it, expect } from "vitest";

import {
  deriveJourneyTrack,
  noteFor,
  type TrackEvent,
} from "../journey-track";

/**
 * The five-stop track over seven statuses plus `order_events`.
 *
 * The point under test is the one the data map is emphatic about: "US hub" is
 * NOT a status. It lights when an `order_events` row of kind `hub_received`
 * exists and at no other time, and the state machine is untouched.
 */

const event = (over: Partial<TrackEvent> & Pick<TrackEvent, "kind">): TrackEvent => ({
  title: "x",
  detail: null,
  location: null,
  weight_lbs: null,
  occurred_at: "2026-09-06T14:02:00Z",
  ...over,
});

const states = (status: string, events: TrackEvent[] = []) =>
  deriveJourneyTrack({ status, events }).stops.map((stop) => stop.state);

describe("deriveJourneyTrack — position from the status alone", () => {
  it("lights nothing for an unpaid order", () => {
    const track = deriveJourneyTrack({ status: "pending", events: [] });
    expect(track.stops.map((s) => s.state)).toEqual(["up", "up", "up", "up", "up"]);
    // Not the mock's 5% sliver: an empty rail is the honest picture of an order
    // nobody has paid for.
    expect(track.percent).toBe(0);
  });

  it("stands a paid order on the first stop", () => {
    expect(states("paid")).toEqual(["now", "up", "up", "up", "up"]);
    expect(deriveJourneyTrack({ status: "paid", events: [] }).percent).toBe(0);
  });

  it("stands a processing order on Purchased", () => {
    expect(states("processing")).toEqual(["done", "now", "up", "up", "up"]);
    expect(deriveJourneyTrack({ status: "processing", events: [] }).percent).toBe(25);
  });

  it("SKIPS the hub for in_transit — a status can never prove a hub arrival", () => {
    expect(states("in_transit")).toEqual(["done", "done", "done", "now", "up"]);
    expect(deriveJourneyTrack({ status: "in_transit", events: [] }).percent).toBe(75);
    // The hub stop is behind the parcel but carries no date, because nothing
    // recorded one.
    expect(deriveJourneyTrack({ status: "in_transit", events: [] }).stops[2]!.at).toBeNull();
    expect(deriveJourneyTrack({ status: "in_transit", events: [] }).reachedHub).toBe(false);
  });

  it("finishes a delivered order with no 'now' stop", () => {
    expect(states("delivered")).toEqual(["done", "done", "done", "done", "done"]);
    expect(deriveJourneyTrack({ status: "delivered", events: [] }).percent).toBe(100);
    expect(deriveJourneyTrack({ status: "delivered", events: [] }).isComplete).toBe(true);
  });

  it("treats completed exactly as delivered", () => {
    expect(states("completed")).toEqual(states("delivered"));
  });

  it("takes a cancelled order off the track entirely", () => {
    const track = deriveJourneyTrack({ status: "cancelled", events: [] });
    expect(track.stops.every((stop) => stop.state === "up")).toBe(true);
    expect(track.percent).toBe(0);
    expect(track.isCancelled).toBe(true);
  });

  it("does not guess a position for a status it has never seen", () => {
    const track = deriveJourneyTrack({ status: "teleported", events: [] });
    expect(track.percent).toBe(0);
    expect(track.stops.every((stop) => stop.state === "up")).toBe(true);
  });
});

describe("deriveJourneyTrack — events move the parcel forward, never back", () => {
  it("lights the hub for a PROCESSING order once a hub_received row exists", () => {
    const track = deriveJourneyTrack({
      status: "processing",
      events: [event({ kind: "hub_received", location: "New York", weight_lbs: 0.6 })],
    });
    expect(track.stops.map((s) => s.state)).toEqual(["done", "done", "now", "up", "up"]);
    expect(track.percent).toBe(50);
    expect(track.reachedHub).toBe(true);
    expect(track.stops[2]!.at).toBe("2026-09-06T14:02:00Z");
    expect(track.stops[2]!.note).toBe("New York · 0.6 lb");
  });

  it("marks the hub done once the parcel has departed it", () => {
    const track = deriveJourneyTrack({
      status: "in_transit",
      events: [
        event({ kind: "hub_received", location: "New York" }),
        event({ kind: "departed", occurred_at: "2026-09-08T22:14:00Z" }),
      ],
    });
    expect(track.stops.map((s) => s.state)).toEqual(["done", "done", "done", "now", "up"]);
    expect(track.reachedHub).toBe(true);
  });

  it("never drags a parcel BEHIND its status: a stale payment event cannot un-ship it", () => {
    const track = deriveJourneyTrack({
      status: "in_transit",
      events: [event({ kind: "payment_received", occurred_at: "2026-08-28T10:20:00Z" })],
    });
    expect(track.percent).toBe(75);
    expect(track.stops[0]!.state).toBe("done");
  });

  it("a delivered event completes the track even if the status has not caught up", () => {
    const track = deriveJourneyTrack({
      status: "in_transit",
      events: [event({ kind: "delivered", occurred_at: "2026-09-20T09:00:00Z" })],
    });
    expect(track.stops[4]!.state).toBe("now");
    expect(track.percent).toBe(100);
  });
});

describe("deriveJourneyTrack — sub-lines are never invented", () => {
  it("gives a stop no timestamp when no event carries one", () => {
    const track = deriveJourneyTrack({ status: "processing", events: [] });
    expect(track.stops.map((stop) => stop.at)).toEqual([null, null, null, null, null]);
    expect(track.stops.map((stop) => stop.note)).toEqual([null, null, null, null, null]);
  });

  it("prints the payment channel the payment event recorded", () => {
    const track = deriveJourneyTrack({
      status: "paid",
      events: [event({ kind: "payment_received", detail: "MTN MoMo", occurred_at: "2026-08-28T10:20:00Z" })],
    });
    expect(track.stops[0]!.at).toBe("2026-08-28T10:20:00Z");
    expect(track.stops[0]!.note).toBe("MTN MoMo");
  });

  it("carries the ETA window only on the final stop", () => {
    const track = deriveJourneyTrack({
      status: "in_transit",
      events: [],
      etaFrom: "2026-09-18",
      etaTo: "2026-09-20",
    });
    expect(track.stops[4]!.etaFrom).toBe("2026-09-18");
    expect(track.stops[4]!.etaTo).toBe("2026-09-20");
    expect(track.stops.slice(0, 4).every((stop) => stop.etaFrom === null)).toBe(true);
  });

  it("honours `delivered_at` for orders delivered before order_events existed", () => {
    const track = deriveJourneyTrack({
      status: "delivered",
      events: [],
      deliveredAt: "2026-08-26T16:00:00Z",
    });
    expect(track.stops[4]!.at).toBe("2026-08-26T16:00:00Z");
  });

  it("takes the newest of two events of the same kind — a parcel can pass two hubs", () => {
    const track = deriveJourneyTrack({
      status: "in_transit",
      events: [
        event({ kind: "hub_received", location: "Delaware", occurred_at: "2026-09-04T10:00:00Z" }),
        event({ kind: "hub_received", location: "Cincinnati", occurred_at: "2026-09-06T10:00:00Z" }),
      ],
    });
    expect(track.stops[2]!.note).toBe("Cincinnati");
  });

  it("prefers the more specific kind for a stop even when the other is newer", () => {
    const track = deriveJourneyTrack({
      status: "in_transit",
      events: [
        event({ kind: "departed", location: "Cincinnati", occurred_at: "2026-09-08T22:14:00Z" }),
        event({ kind: "arrived_country", location: "Accra", occurred_at: "2026-09-10T06:00:00Z" }),
      ],
    });
    expect(track.stops[3]!.note).toBe("Cincinnati");
  });
});

describe("noteFor", () => {
  it("folds location, detail and weight into one clause", () => {
    expect(
      noteFor(event({ kind: "hub_received", location: "New York", detail: "checked in", weight_lbs: 0.6 })),
    ).toBe("New York · checked in · 0.6 lb");
  });

  it("drops blank parts rather than leaving a stray separator", () => {
    expect(noteFor(event({ kind: "note", location: "   ", detail: "" }))).toBeNull();
  });

  it("prints a whole-number weight without decimals and never prints zero", () => {
    expect(noteFor(event({ kind: "hub_received", weight_lbs: 2 }))).toBe("2 lb");
    expect(noteFor(event({ kind: "hub_received", weight_lbs: 0 }))).toBeNull();
  });
});
