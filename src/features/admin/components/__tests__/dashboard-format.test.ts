import { describe, expect, it } from "vitest";

import {
  extractionTone,
  formatCount,
  formatCountdown,
  formatDateRange,
  formatDayKey,
  formatGhsFloor,
  formatRate,
  formatTimestamp,
  orderStatusLabel,
  orderStatusTone,
  pluralise,
  queueTone,
} from "@/features/admin/components/dashboard-format";

describe("formatCount", () => {
  it("groups thousands", () => {
    expect(formatCount(1234)).toBe("1,234");
    expect(formatCount(0)).toBe("0");
  });
});

describe("formatRate", () => {
  it("prints whole percent", () => {
    expect(formatRate(0.875)).toBe("88%");
    expect(formatRate(1)).toBe("100%");
  });

  it("prints a dash for an unknown rate rather than accusing the extractor of 0%", () => {
    expect(formatRate(null)).toBe("—");
  });
});

describe("formatGhsFloor", () => {
  it("states a complete figure plainly", () => {
    expect(formatGhsFloor(5041.16, false)).toBe("GH₵5,041.16");
  });

  it("marks a capped figure as a floor", () => {
    expect(formatGhsFloor(5041.16, true)).toBe("at least GH₵5,041.16");
  });
});

describe("date formatting", () => {
  it("formats a day key in UTC, matching the service's own buckets", () => {
    expect(formatDayKey("2026-08-15")).toBe("15 Aug");
  });

  it("states a window as a range", () => {
    expect(formatDateRange("2026-08-15", "2026-09-13")).toBe("15 Aug – 13 Sept 2026");
  });

  it("formats a timestamp, and refuses to print 'Invalid Date'", () => {
    expect(formatTimestamp("2026-09-13T14:32:00Z")).toBe("13 Sept, 14:32");
    expect(formatTimestamp("not a date")).toBeNull();
    expect(formatTimestamp(null)).toBeNull();
  });
});

describe("formatCountdown", () => {
  const now = new Date("2026-09-13T12:00:00Z");

  it("counts minutes under the hour", () => {
    expect(formatCountdown("2026-09-13T12:45:00Z", now)).toBe("in 45 min");
  });

  it("rounds hours down, so a cutoff is never announced late", () => {
    expect(formatCountdown("2026-09-13T14:50:00Z", now)).toBe("in 2 hours");
    expect(formatCountdown("2026-09-13T13:00:00Z", now)).toBe("in 1 hour");
  });

  it("switches to days past two", () => {
    expect(formatCountdown("2026-09-16T12:00:00Z", now)).toBe("in 3 days");
  });

  it("never produces a negative countdown when the clock has drifted past", () => {
    expect(formatCountdown("2026-09-13T11:59:00Z", now)).toBe("now");
  });

  it("degrades on junk rather than throwing mid-render", () => {
    expect(formatCountdown("nonsense", now)).toBe("soon");
  });
});

describe("pluralise", () => {
  it("agrees with its count", () => {
    expect(pluralise(1, "payment")).toBe("1 payment");
    expect(pluralise(3, "payment")).toBe("3 payments");
    expect(pluralise(2, "delivery", "deliveries")).toBe("2 deliveries");
  });
});

describe("tones", () => {
  it("makes an empty queue green — good news must read as good news", () => {
    expect(queueTone(0)).toBe("green");
    expect(queueTone(1)).toBe("amber");
  });

  it("escalates extraction health only once customers are really seeing dead links", () => {
    expect(extractionTone(null)).toBe("muted");
    expect(extractionTone(0.95)).toBe("green");
    expect(extractionTone(0.8)).toBe("amber");
    expect(extractionTone(0.5)).toBe("coral");
  });

  it("uses the state machine's own states, humanised", () => {
    expect(orderStatusLabel("in_transit")).toBe("In transit");
    expect(orderStatusLabel("pending")).toBe("Awaiting payment");
    expect(orderStatusTone("delivered")).toBe("green");
    expect(orderStatusTone("pending")).toBe("amber");
    expect(orderStatusTone("cancelled")).toBe("muted");
    expect(orderStatusTone("processing")).toBe("neutral");
  });
});
