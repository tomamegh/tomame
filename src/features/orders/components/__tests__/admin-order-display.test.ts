import { describe, expect, it } from "vitest";

import type { PricingBreakdown } from "@/lib/pricing";
import type { Order } from "../../types";
import {
  formatAdminDate,
  formatAdminDateTime,
  formatAge,
  orderEtaDisplay,
  orderEtaFields,
  orderTotalDisplay,
} from "../admin-order-display";

const NOW = new Date("2026-09-13T12:00:00Z");

function order(overrides: Partial<Order> = {}): Order {
  return {
    id: "o1",
    order_no: "TM-00001",
    status: "paid",
    admin_total_ghs: null,
    estimated_delivery_date: null,
    eta_from: null,
    eta_to: null,
    pricing: {
      pricing_method: "flat_rate",
      total_ghs: 1240.5,
    } as unknown as PricingBreakdown,
    ...overrides,
  } as unknown as Order;
}

describe("orderTotalDisplay", () => {
  it("prints the stored breakdown's total", () => {
    expect(orderTotalDisplay(order())).toEqual({
      text: "GH₵1,240.50",
      tone: "neutral",
      isOverride: false,
      isUnpriced: false,
    });
  });

  it("lets an admin's hand-set total override the engine's, and says which it is", () => {
    const display = orderTotalDisplay(order({ admin_total_ghs: 999 }));
    expect(display.text).toBe("GH₵999.00");
    expect(display.isOverride).toBe(true);
  });

  it("refuses to print GH₵0.00 for an order the engine could not price", () => {
    const display = orderTotalDisplay(
      order({
        needs_review: true,
        pricing: { pricing_method: "needs_review", total_ghs: 0 } as unknown as PricingBreakdown,
      }),
    );
    expect(display).toEqual({
      text: "Not priced",
      tone: "amber",
      isOverride: false,
      isUnpriced: true,
    });
  });

  it("shows the hand price even on an order whose breakdown is still needs_review", () => {
    const display = orderTotalDisplay(
      order({
        admin_total_ghs: 500,
        pricing: { pricing_method: "needs_review", total_ghs: 0 } as unknown as PricingBreakdown,
      }),
    );
    expect(display.text).toBe("GH₵500.00");
    expect(display.isUnpriced).toBe(false);
  });

  it("survives a row with no breakdown at all rather than throwing", () => {
    const display = orderTotalDisplay(order({ pricing: null as unknown as PricingBreakdown }));
    expect(display.isUnpriced).toBe(true);
  });
});

describe("orderEtaDisplay", () => {
  it("prints the window the operator set", () => {
    expect(orderEtaDisplay(order({ eta_from: "2026-09-18", eta_to: "2026-09-20" }))).toBe(
      "Fri 18 – Sun 20 Sep",
    );
  });

  it("falls back to a pre-050 single date as a one-day window, not a range", () => {
    expect(orderEtaDisplay(order({ estimated_delivery_date: "2026-09-18" }))).toBe("Fri 18 Sep");
  });

  it("is null when no date was ever set, so a cell can stay honestly empty", () => {
    expect(orderEtaDisplay(order())).toBeNull();
  });
});

describe("orderEtaFields", () => {
  it("pre-fills both ends from a pre-050 single date so editing cannot clear it", () => {
    expect(orderEtaFields(order({ estimated_delivery_date: "2026-09-18" }))).toEqual({
      from: "2026-09-18",
      to: "2026-09-18",
    });
  });

  it("prefers the stored window over the midpoint", () => {
    expect(
      orderEtaFields(
        order({ eta_from: "2026-09-18", eta_to: "2026-09-20", estimated_delivery_date: "2026-09-19" }),
      ),
    ).toEqual({ from: "2026-09-18", to: "2026-09-20" });
  });

  it("is empty strings when nothing is set, which is what an input wants", () => {
    expect(orderEtaFields(order())).toEqual({ from: "", to: "" });
  });
});

describe("dates", () => {
  it("formats a day and a timestamp in UTC, which is Accra's own clock", () => {
    expect(formatAdminDate("2026-09-13")).toBe("13 Sep 2026");
    expect(formatAdminDateTime("2026-09-13T14:02:00Z")).toBe("13 Sep 2026, 14:02");
  });

  it("answers null for nothing and for nonsense, rather than Invalid Date", () => {
    expect(formatAdminDate(null)).toBeNull();
    expect(formatAdminDate("soon")).toBeNull();
    expect(formatAdminDateTime(undefined)).toBeNull();
  });
});

describe("formatAge", () => {
  it("climbs through the units", () => {
    expect(formatAge(new Date(NOW.getTime() - 30_000).toISOString(), NOW)).toBe("just now");
    expect(formatAge(new Date(NOW.getTime() - 5 * 60_000).toISOString(), NOW)).toBe("5m ago");
    expect(formatAge(new Date(NOW.getTime() - 3 * 3_600_000).toISOString(), NOW)).toBe("3h ago");
    expect(formatAge(new Date(NOW.getTime() - 3 * 86_400_000).toISOString(), NOW)).toBe("3d ago");
    expect(formatAge(new Date(NOW.getTime() - 65 * 86_400_000).toISOString(), NOW)).toBe("2mo ago");
  });

  it("answers null for an unreadable timestamp rather than a fictional age", () => {
    expect(formatAge("not a date", NOW)).toBeNull();
    expect(formatAge(null, NOW)).toBeNull();
  });
});
