import { describe, expect, it } from "vitest";

import { describeScore, promiseAccuracy, type PromiseAccuracyRow } from "../promise-accuracy";

const row = (orderNo: string, deliveredOn: string, estimateTo: string | null, firmDates: string[] = []): PromiseAccuracyRow => ({
  orderId: `id-${orderNo}`,
  orderNo,
  deliveredOn,
  estimateTo,
  firmDates,
});

describe("promiseAccuracy", () => {
  it("scores each promise against the delivery day; on or before counts as kept", () => {
    const out = promiseAccuracy([
      row("TM-1", "2026-11-30", "2026-11-30", ["2026-11-29"]), // estimate kept (same day), firm 1 day late
      row("TM-2", "2026-12-04", "2026-12-01", ["2026-12-01", "2026-12-04"]), // estimate 3 late, first firm 3 late, last kept
      row("TM-3", "2026-11-26", "2026-11-28"), // early on the estimate, no firm date
      row("TM-4", "2026-11-27", null), // paid before promises: nothing to score
    ]);
    expect(out.delivered).toBe(4);
    expect(out.scores.estimate).toEqual({ given: 3, kept: 2, avgDaysLate: 3, maxDaysLate: 3 });
    expect(out.scores.firstFirm).toEqual({ given: 2, kept: 0, avgDaysLate: 2, maxDaysLate: 3 });
    expect(out.scores.lastFirm).toEqual({ given: 2, kept: 1, avgDaysLate: 1, maxDaysLate: 1 });
    expect(out.redated).toBe(1);
    // Judged by the last firm date when there is one, else the estimate.
    expect(out.late).toEqual([
      { orderId: "id-TM-1", orderNo: "TM-1", deliveredOn: "2026-11-30", promisedOn: "2026-11-29", promise: "firm", daysLate: 1 },
    ]);
  });

  it("says nothing was given rather than 0%", () => {
    const out = promiseAccuracy([row("TM-4", "2026-11-27", null)]);
    expect(out.scores.estimate).toEqual({ given: 0, kept: 0, avgDaysLate: null, maxDaysLate: null });
    expect(describeScore(out.scores.estimate)).toBeNull();
    expect(describeScore({ given: 14, kept: 12, avgDaysLate: 2, maxDaysLate: 3 })).toBe("12 of 14 on time");
  });

  it("lists the latest late deliveries first, capped", () => {
    const rows = Array.from({ length: 12 }, (_, i) => row(`TM-${i}`, `2026-12-${String(i + 10).padStart(2, "0")}`, "2026-12-01"));
    const out = promiseAccuracy(rows, 3);
    expect(out.late.map((o) => o.orderNo)).toEqual(["TM-11", "TM-10", "TM-9"]);
  });
});
