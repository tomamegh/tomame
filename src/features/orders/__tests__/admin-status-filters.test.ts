import { describe, expect, it } from "vitest";

import { countForFilter, statusesForFilter } from "../admin-status-filters";

describe("admin order filters (Fix 3)", () => {
  const byStatus = { pending: 0, paid: 4, processing: 1, in_transit: 1, delivered: 1, completed: 23, cancelled: 11 };

  it("counts Delivered the same on the tile and the chip: delivered + completed", () => {
    expect(countForFilter("delivered", byStatus)).toBe(24);
    expect(statusesForFilter("delivered")).toEqual(["delivered", "completed"]);
  });

  it("lists what the In flight tile counts", () => {
    expect(countForFilter("in_flight", byStatus)).toBe(6);
    expect(statusesForFilter("in_flight")).toEqual(["paid", "processing", "in_transit"]);
  });

  it("ignores an unknown filter rather than guessing", () => {
    expect(statusesForFilter("shipped")).toBeNull();
    expect(statusesForFilter(undefined)).toBeNull();
  });
});
