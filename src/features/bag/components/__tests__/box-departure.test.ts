import { describe, expect, it } from "vitest";

import { departureLine } from "../box-departure";

describe("departureLine (111)", () => {
  it("names the carrier, the route and the day", () => {
    expect(departureLine({ carrier: "Delta Cargo", origin: "JFK", destination: "ACC", departs_at: "2026-11-25T00:00:00Z" })).toBe(
      "Delta Cargo JFK → ACC · Wed 25 Nov",
    );
  });

  it("says nothing for no departure", () => {
    expect(departureLine(null)).toBeNull();
  });
});
