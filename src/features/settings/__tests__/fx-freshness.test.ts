import { describe, expect, it } from "vitest";

import { RATE_REFRESH_INTERVAL_HOURS, describeRateAge, rateAge } from "../components/fx-freshness";

const NOW = new Date("2026-09-13T12:00:00.000Z");

function hoursAgo(hours: number): string {
  return new Date(NOW.getTime() - hours * 3_600_000).toISOString();
}

describe("rateAge", () => {
  it("is fresh inside one scheduled interval", () => {
    expect(rateAge(hoursAgo(1), NOW)).toEqual({ state: "fresh", hours: 1 });
    expect(rateAge(hoursAgo(RATE_REFRESH_INTERVAL_HOURS), NOW).state).toBe("fresh");
  });

  it("is late once two scheduled runs have been missed", () => {
    expect(rateAge(hoursAgo(RATE_REFRESH_INTERVAL_HOURS * 2), NOW).state).toBe("late");
    expect(rateAge(hoursAgo(12), NOW).state).toBe("late");
  });

  it("is stale after a day", () => {
    expect(rateAge(hoursAgo(24), NOW)).toEqual({ state: "stale", hours: 24 });
  });

  it("reads a future timestamp as brand new rather than negative", () => {
    const ahead = new Date(NOW.getTime() + 3_600_000).toISOString();
    expect(rateAge(ahead, NOW)).toEqual({ state: "fresh", hours: 0 });
  });

  it("is unknown for a missing or unparseable timestamp", () => {
    expect(rateAge(null, NOW).state).toBe("unknown");
    expect(rateAge("not a date", NOW).state).toBe("unknown");
  });
});

describe("describeRateAge", () => {
  it("says out loud that quotes are being priced at an old cedi", () => {
    expect(describeRateAge(rateAge(hoursAgo(30), NOW))).toContain("old cedi");
  });

  it("does not alarm anyone about a rate fetched an hour ago", () => {
    expect(describeRateAge(rateAge(hoursAgo(1), NOW))).toBe("Fetched 1 hour ago.");
  });

  it("admits when there is no fetch time at all", () => {
    expect(describeRateAge(rateAge(null, NOW))).toContain("No fetch time recorded");
  });
});
