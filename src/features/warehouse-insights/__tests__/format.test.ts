import { describe, expect, it } from "vitest";

import { absoluteTime, clockTime, dayHeading, groupByDay, relativeTime } from "../components/format";

const NOW = new Date("2026-09-30T15:00:00Z");

describe("timeline time", () => {
  it("reads relative time", () => {
    expect(relativeTime("2026-09-30T14:59:30Z", NOW)).toBe("Just now");
    expect(relativeTime("2026-09-30T14:48:00Z", NOW)).toBe("12 min ago");
    expect(relativeTime("2026-09-30T12:00:00Z", NOW)).toBe("3 h ago");
    expect(relativeTime("2026-09-28T12:00:00Z", NOW)).toBe("2 days ago");
    expect(relativeTime("2026-09-01T12:00:00Z", NOW)).toBe("Tuesday 1 Sep");
  });

  it("prints UTC clock and full times", () => {
    expect(clockTime("2026-09-30T09:05:00Z")).toBe("09:05");
    expect(absoluteTime("2026-09-30T09:05:07Z")).toBe("Wed, 30 Sep 2026, 09:05:07 UTC");
  });

  it("heads days as Today, Yesterday, then the date", () => {
    expect(dayHeading("2026-09-30T01:00:00Z", NOW)).toBe("Today");
    expect(dayHeading("2026-09-29T23:00:00Z", NOW)).toBe("Yesterday");
    expect(dayHeading("2026-09-28T23:00:00Z", NOW)).toBe("Monday 28 Sep");
  });

  it("groups consecutive rows by UTC day", () => {
    const groups = groupByDay([
      { created_at: "2026-09-30T10:00:00Z" },
      { created_at: "2026-09-30T01:00:00Z" },
      { created_at: "2026-09-29T23:00:00Z" },
    ]);
    expect(groups.map((g) => [g.day, g.rows.length])).toEqual([
      ["2026-09-30", 2],
      ["2026-09-29", 1],
    ]);
  });
});
