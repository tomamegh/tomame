import { describe, expect, it } from "vitest";

import { ORDER_STATUSES } from "@/config/constants";
import { ALLOWED_TRANSITIONS, allowedTransitionsFrom } from "../order-transitions";

/**
 * The state machine's edges, now read by both `updateOrderStatusAdmin` and the
 * admin console. These tests pin the table against CLAUDE.md's declared machine
 * and pin the lookup against the prototype hole that merging the two tables
 * nearly introduced into the server side.
 */
describe("ALLOWED_TRANSITIONS", () => {
  it("is CLAUDE.md's machine and nothing more", () => {
    expect(ALLOWED_TRANSITIONS).toEqual({
      pending: ["cancelled"],
      paid: ["processing"],
      processing: ["in_transit"],
      in_transit: ["delivered"],
      delivered: ["completed"],
    });
  });

  it("names only real statuses on both sides of every edge", () => {
    const statuses = new Set<string>(Object.values(ORDER_STATUSES));
    for (const [from, destinations] of Object.entries(ALLOWED_TRANSITIONS)) {
      expect(statuses.has(from)).toBe(true);
      for (const to of destinations) expect(statuses.has(to)).toBe(true);
    }
  });

  it("leaves the terminal statuses with nowhere to go", () => {
    expect(allowedTransitionsFrom("completed")).toEqual([]);
    expect(allowedTransitionsFrom("cancelled")).toEqual([]);
  });

  it("never lets a status transition into itself", () => {
    for (const [from, destinations] of Object.entries(ALLOWED_TRANSITIONS)) {
      expect(destinations).not.toContain(from);
    }
  });
});

describe("allowedTransitionsFrom", () => {
  it("answers an unknown status with an empty list", () => {
    expect(allowedTransitionsFrom("refunded")).toEqual([]);
    expect(allowedTransitionsFrom("")).toEqual([]);
  });

  it("does not fall through to Object.prototype", () => {
    // `ALLOWED_TRANSITIONS["toString"]` is a function, so a `?? []` lookup hands
    // back a function and the caller's `.map` throws — or, in the service, an
    // `.includes` that is not an array's. Every one of these must be empty.
    for (const key of ["toString", "constructor", "valueOf", "hasOwnProperty", "__proto__"]) {
      expect(allowedTransitionsFrom(key)).toEqual([]);
    }
  });
});
