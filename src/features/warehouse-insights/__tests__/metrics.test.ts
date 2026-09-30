import { describe, expect, it } from "vitest";

import {
  dailyThroughput,
  durationStats,
  formatDuration,
  hubToShipHours,
  itemsPacked,
  operatorRows,
  sealToShipHours,
  staffMember,
  tally,
  totalActions,
  type MetricAuditRow,
} from "../metrics";

const YAW = "0cc86b58-ba66-4922-875e-8066bfdb0ada";
const ADA = "f98b7fd0-3462-45df-ad3e-5f8106db8544";

function row(action: string, created_at: string, extra: Partial<MetricAuditRow> = {}): MetricAuditRow {
  return { action, actor_id: YAW, actor_role: "warehouse", metadata: {}, created_at, ...extra };
}

describe("totalActions", () => {
  it("counts each kind of work, and orders inside shipped packages", () => {
    const totals = totalActions([
      row("warehouse_item_received", "2026-09-28T10:00:00Z"),
      row("warehouse_item_received", "2026-09-28T11:00:00Z"),
      row("warehouse_item_reweighed", "2026-09-28T12:00:00Z"),
      row("warehouse_package_items_added", "2026-09-28T12:00:00Z", { metadata: { order_ids: ["a", "b"], custom_lines: 1 } }),
      row("warehouse_package_sealed", "2026-09-29T09:00:00Z"),
      row("warehouse_package_shipped", "2026-09-29T10:00:00Z", { metadata: { order_count: 3 } }),
      row("warehouse_package_shipped", "2026-09-29T11:00:00Z", { metadata: {} }),
      row("warehouse_label_printed", "2026-09-29T09:30:00Z"),
      row("order_held", "2026-09-29T09:30:00Z"),
      row("user_logged_in", "2026-09-29T08:00:00Z"),
    ]);
    expect(totals).toEqual({
      received: 2,
      reweighed: 1,
      packed: 3,
      sealed: 1,
      shipped: 2,
      shipped_orders: 3,
      labels: 1,
      holds: 1,
    });
  });

  it("ignores a negative or missing custom line count", () => {
    expect(itemsPacked({ order_ids: ["a"], custom_lines: -4 })).toBe(1);
    expect(itemsPacked(null)).toBe(0);
  });
});

describe("dailyThroughput", () => {
  it("zero-fills every day in the range and buckets by UTC day", () => {
    const days = dailyThroughput(
      [
        row("warehouse_item_received", "2026-09-28T23:59:00Z"),
        row("warehouse_item_received", "2026-09-30T00:01:00Z"),
        row("warehouse_package_shipped", "2026-09-30T08:00:00Z", { metadata: { order_count: 2 } }),
        row("warehouse_item_received", "2026-09-01T00:00:00Z"), // before the range: dropped
      ],
      new Date("2026-09-28T00:00:00Z"),
      new Date("2026-09-30T15:00:00Z"),
    );
    expect(days).toEqual([
      { day: "2026-09-28", received: 1, shipped: 0 },
      { day: "2026-09-29", received: 0, shipped: 0 },
      { day: "2026-09-30", received: 1, shipped: 2 },
    ]);
  });
});

describe("durations", () => {
  it("takes the median of an odd and an even count, and the mean", () => {
    expect(durationStats([5, 1, 3])).toEqual({ count: 3, median_hours: 3, mean_hours: 3 });
    expect(durationStats([1, 2, 3, 10])).toEqual({ count: 4, median_hours: 2.5, mean_hours: 4 });
    expect(durationStats([])).toEqual({ count: 0, median_hours: null, mean_hours: null });
  });

  it("drops negative and non-finite samples", () => {
    expect(durationStats([-1, Number.NaN, 4]).count).toBe(1);
  });

  it("measures each order from its first arrival, and skips orders never logged in", () => {
    const packages = [
      { sealed_at: "2026-09-29T00:00:00Z", shipped_at: "2026-09-30T00:00:00Z", order_ids: ["a", "b", "c"] },
      { sealed_at: null, shipped_at: "2026-09-30T12:00:00Z", order_ids: ["d"] },
    ];
    const arrivals = new Map([
      ["a", "2026-09-28T00:00:00Z"],
      ["b", "2026-09-29T12:00:00Z"],
      ["d", "2026-09-30T06:00:00Z"],
    ]);
    expect(hubToShipHours(packages, arrivals)).toEqual([48, 12, 6]);
    expect(sealToShipHours(packages)).toEqual([24]);
  });

  it("formats minutes, hours and days", () => {
    expect(formatDuration(null)).toBe("–");
    expect(formatDuration(0.25)).toBe("15 min");
    expect(formatDuration(0.001)).toBe("1 min");
    expect(formatDuration(3.24)).toBe("3.2 h");
    expect(formatDuration(60)).toBe("2.5 days");
  });
});

describe("operatorRows", () => {
  const staff = new Map([
    [YAW, staffMember({ id: YAW, role: "warehouse", first_name: "Yaw", last_name: "Hub", email: "w@x" })],
    [ADA, staffMember({ id: ADA, role: "admin", first_name: null, last_name: null, email: "builder-test@tomame.local" })],
  ]);

  it("credits work but not sign-ins, folds in activity, and sorts by last active", () => {
    const rows = operatorRows(
      [
        row("user_logged_in", "2026-09-30T08:00:00Z"),
        row("warehouse_item_received", "2026-09-30T09:00:00Z"),
        row("warehouse_package_shipped", "2026-09-30T10:00:00Z"),
        row("warehouse_label_printed", "2026-09-29T10:00:00Z", { actor_id: ADA, actor_role: "admin" }),
        row("warehouse_item_received", "2026-09-29T10:00:00Z", { actor_id: null }),
      ],
      [
        { actor_id: YAW, kind: "scan", events: 4, last_at: "2026-09-30T11:00:00Z" },
        { actor_id: YAW, kind: "lookup_failed", events: 1, last_at: "2026-09-30T09:30:00Z" },
        { actor_id: YAW, kind: "page_view", events: 20, last_at: "2026-09-30T11:30:00Z" },
      ],
      staff,
    );
    expect(rows.map((r) => r.name)).toEqual(["Yaw Hub", "builder-test"]);
    expect(rows[0]).toMatchObject({
      actions: 2,
      received: 1,
      shipped: 1,
      scans: 5,
      failed_lookups: 1,
      page_views: 20,
      last_active: "2026-09-30T11:30:00Z",
      role: "warehouse",
    });
    expect(rows[1]).toMatchObject({ actions: 1, labels: 1, role: "admin", initials: "BT" });
  });
});

describe("tally and staffMember", () => {
  it("counts values, most common first, blanks grouped", () => {
    expect(tally(["Damaged", null, "Damaged", " ", "Wrong colour"])).toEqual([
      { key: "Damaged", count: 2 },
      { key: "No reason given", count: 2 },
      { key: "Wrong colour", count: 1 },
    ]);
  });

  it("names a person from their profile, or their address", () => {
    expect(staffMember({ id: "1", role: "warehouse", first_name: "Yaw", last_name: "Hub", email: null })).toEqual({
      id: "1",
      name: "Yaw Hub",
      short_name: "Yaw",
      initials: "YH",
      role: "warehouse",
    });
    expect(staffMember({ id: "2", role: "admin", first_name: null, last_name: null, email: "kelanimdev@gmail.com" })).toMatchObject({
      name: "kelanimdev",
      initials: "K",
      role: "admin",
    });
  });
});
