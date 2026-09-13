import { describe, expect, it, vi } from "vitest";

// `admin.service.ts` is server-only and imports the service-role query module.
// The derivations under test are pure, so both are stubbed out of the way rather
// than a Supabase client being stood up for functions that never touch one.
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));

import {
  buildSeries,
  summariseBags,
  summariseBoxes,
  summariseCustomers,
  summariseExtraction,
  summariseMoney,
  summariseOrders,
} from "@/features/admin/admin.service";
import type {
  BoxCutoffRow,
  CappedRows,
  DashboardOrderRow,
  OpenBagLineRow,
  PasteJobRow,
  SettledPaymentRow,
} from "@/db/queries/admin-dashboard";

function capped<T>(rows: T[], truncated = false): CappedRows<T> {
  return { rows, truncated };
}

describe("summariseMoney", () => {
  it("sums settled pesewas into cedis", () => {
    const money = summariseMoney(
      capped<SettledPaymentRow>([
        { created_at: "2026-09-01T10:00:00Z", amount: 504_116 },
        { created_at: "2026-09-02T10:00:00Z", amount: 120_000 },
      ]),
    );
    expect(money.settledGhs).toBe(6241.16);
    expect(money.paymentCount).toBe(2);
    expect(money.averagePaymentGhs).toBe(3120.58);
  });

  it("has no average when nothing settled — an empty window is not GH₵0 per payment", () => {
    const money = summariseMoney(capped<SettledPaymentRow>([]));
    expect(money.settledGhs).toBe(0);
    expect(money.averagePaymentGhs).toBeNull();
  });

  it("carries the row cap through so the screen can say 'at least'", () => {
    const money = summariseMoney(
      capped<SettledPaymentRow>([{ created_at: "2026-09-01T10:00:00Z", amount: 100 }], true),
    );
    expect(money.truncated).toBe(true);
  });
});

describe("summariseOrders", () => {
  const rows: DashboardOrderRow[] = [
    { created_at: "2026-09-01T10:00:00Z", user_id: "a", status: "paid" },
    { created_at: "2026-09-02T10:00:00Z", user_id: "b", status: "cancelled" },
    { created_at: "2026-09-03T10:00:00Z", user_id: "a", status: "delivered" },
  ];

  it("splits cancellations out of the placed count rather than dropping them", () => {
    const orders = summariseOrders(capped(rows), 412);
    expect(orders.placed).toBe(2);
    expect(orders.cancelled).toBe(1);
    expect(orders.allTime).toBe(412);
  });

  it("keeps the all-time count null when that query failed", () => {
    expect(summariseOrders(capped(rows), null).allTime).toBeNull();
  });
});

describe("summariseCustomers", () => {
  it("counts distinct buyers, ignoring cancelled orders", () => {
    const customers = summariseCustomers(
      capped<DashboardOrderRow>([
        { created_at: "2026-09-01T10:00:00Z", user_id: "a", status: "paid" },
        { created_at: "2026-09-02T10:00:00Z", user_id: "a", status: "processing" },
        { created_at: "2026-09-03T10:00:00Z", user_id: "b", status: "cancelled" },
      ]),
      120,
    );
    expect(customers.ordering).toBe(1);
    expect(customers.registered).toBe(120);
  });
});

describe("summariseExtraction", () => {
  const rows: PasteJobRow[] = [
    { created_at: "2026-09-10T10:00:00Z", status: "ready" },
    { created_at: "2026-09-10T11:00:00Z", status: "ready" },
    { created_at: "2026-09-11T10:00:00Z", status: "ready" },
    { created_at: "2026-09-11T11:00:00Z", status: "failed" },
    { created_at: "2026-09-12T10:00:00Z", status: "running" },
    { created_at: "2026-09-12T11:00:00Z", status: "pending" },
  ];

  it("rates only the pastes that finished, so a burst cannot fake a dip", () => {
    const health = summariseExtraction(rows);
    expect(health.total).toBe(6);
    expect(health.ready).toBe(3);
    expect(health.failed).toBe(1);
    expect(health.working).toBe(2);
    expect(health.successRate).toBe(0.75);
  });

  it("reports an unknown rate rather than 0% when nothing has finished", () => {
    const health = summariseExtraction([
      { created_at: "2026-09-12T10:00:00Z", status: "pending" },
    ]);
    expect(health.successRate).toBeNull();
    expect(health.working).toBe(1);
  });
});

describe("summariseBags", () => {
  it("counts bags by the lines in them, so an empty cart row is not demand", () => {
    const bags = summariseBags(
      capped<OpenBagLineRow>([
        { cart_id: "one", quantity: 2, pricing_total_ghs: 1000 },
        { cart_id: "one", quantity: 1, pricing_total_ghs: 250.5 },
        { cart_id: "two", quantity: 1, pricing_total_ghs: null },
      ]),
    );
    expect(bags.bags).toBe(2);
    expect(bags.items).toBe(4);
    expect(bags.valueGhs).toBe(1250.5);
    expect(bags.unpricedLines).toBe(1);
  });

  it("is empty, not zero-valued nonsense, when no bag is open", () => {
    const bags = summariseBags(capped<OpenBagLineRow>([]));
    expect(bags).toMatchObject({ bags: 0, items: 0, valueGhs: 0, unpricedLines: 0 });
  });
});

describe("summariseBoxes", () => {
  const rows: BoxCutoffRow[] = [
    {
      id: "b1",
      label: "  ",
      region_code: "USA",
      cutoff_at: "2026-09-14T18:00:00Z",
      departs_at: "2026-09-15T06:00:00Z",
    },
    {
      id: "b2",
      label: "Accra 37",
      region_code: "USA",
      cutoff_at: "2026-09-15T18:00:00Z",
      departs_at: null,
    },
  ];

  it("names the soonest box, falling back to its region when it has no label", () => {
    const boxes = summariseBoxes(rows);
    expect(boxes.count).toBe(2);
    expect(boxes.soonest).toEqual({ label: "USA", cutoffAt: "2026-09-14T18:00:00Z" });
  });

  it("has nothing to name when no box is closing", () => {
    expect(summariseBoxes([])).toEqual({ count: 0, soonest: null });
  });
});

describe("buildSeries", () => {
  const windowStart = new Date("2026-09-10T00:00:00Z");

  it("fills every day in the window, so a quiet day plots as zero not a gap", () => {
    const series = buildSeries(windowStart, 3, {
      orders: [{ created_at: "2026-09-12T09:00:00Z", user_id: "a", status: "paid" }],
      payments: [{ created_at: "2026-09-10T09:00:00Z", amount: 250_000 }],
      pastes: [{ created_at: "2026-09-10T09:00:00Z", status: "ready" }],
    });

    expect(series.map((point) => point.date)).toEqual([
      "2026-09-10",
      "2026-09-11",
      "2026-09-12",
    ]);
    expect(series[0]).toEqual({
      date: "2026-09-10",
      orders: 0,
      revenueGhs: 2500,
      pastes: 1,
    });
    expect(series[1]).toEqual({ date: "2026-09-11", orders: 0, revenueGhs: 0, pastes: 0 });
    expect(series[2]?.orders).toBe(1);
  });

  it("plots settled money, not order totals, and leaves cancellations out", () => {
    const series = buildSeries(windowStart, 1, {
      orders: [
        { created_at: "2026-09-10T09:00:00Z", user_id: "a", status: "cancelled" },
        { created_at: "2026-09-10T10:00:00Z", user_id: "b", status: "paid" },
      ],
      payments: [],
      pastes: [],
    });
    expect(series[0]).toEqual({ date: "2026-09-10", orders: 1, revenueGhs: 0, pastes: 0 });
  });

  it("ignores rows outside the window instead of bucketing them at the edge", () => {
    const series = buildSeries(windowStart, 2, {
      orders: [{ created_at: "2026-09-09T23:59:00Z", user_id: "a", status: "paid" }],
      payments: [{ created_at: "2026-09-20T00:00:00Z", amount: 999_999 }],
      pastes: [],
    });
    expect(series).toEqual([
      { date: "2026-09-10", orders: 0, revenueGhs: 0, pastes: 0 },
      { date: "2026-09-11", orders: 0, revenueGhs: 0, pastes: 0 },
    ]);
  });
});
