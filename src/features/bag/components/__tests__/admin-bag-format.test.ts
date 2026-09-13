import { describe, expect, it } from "vitest";

import type { AdminBagRow } from "@/db/queries/admin-bags";
import type { AdminBoxItem } from "@/db/queries/admin-boxes";
import type { ConsolidationBoxRow } from "@/db/queries/consolidation-boxes";
import type { PricingBreakdown } from "@/lib/pricing";
import {
  BAG_STALE_AFTER_HOURS,
  bagOwnerLabel,
  describeBoxFill,
  isBagStale,
  isPastCutoff,
  summariseBags,
} from "../admin-bag-format";

const NOW = new Date("2026-09-13T12:00:00Z");
const HOUR = 3_600_000;

function bag(overrides: Partial<AdminBagRow> = {}): AdminBagRow {
  return {
    id: "cart-1",
    status: "open",
    owner: { kind: "customer", user_id: "u1", name: "Ama Owusu", email: null, session_id: null },
    line_count: 1,
    item_count: 1,
    snapshot_value_ghs: 100,
    priced_line_count: 1,
    blocked_line_count: 0,
    created_at: NOW.toISOString(),
    updated_at: NOW.toISOString(),
    lines: [],
    ...overrides,
  };
}

describe("summariseBags", () => {
  it("counts bags, blocked bags and stale bags, and sums the snapshot value", () => {
    const totals = summariseBags(
      [
        bag({ id: "a", snapshot_value_ghs: 120.5, item_count: 2 }),
        bag({ id: "b", snapshot_value_ghs: 79.5, item_count: 1, blocked_line_count: 1 }),
        bag({
          id: "c",
          snapshot_value_ghs: 0,
          item_count: 3,
          updated_at: new Date(NOW.getTime() - (BAG_STALE_AFTER_HOURS + 1) * HOUR).toISOString(),
        }),
      ],
      NOW,
    );

    expect(totals).toEqual({
      count: 3,
      blocked: 1,
      stale: 1,
      snapshotValueGhs: 200,
      itemCount: 6,
    });
  });

  it("answers zeroes for an empty list rather than throwing", () => {
    expect(summariseBags([], NOW)).toEqual({
      count: 0,
      blocked: 0,
      stale: 0,
      snapshotValueGhs: 0,
      itemCount: 0,
    });
  });
});

describe("isBagStale", () => {
  it("turns over exactly at the threshold", () => {
    const justInside = bag({
      updated_at: new Date(NOW.getTime() - (BAG_STALE_AFTER_HOURS - 1) * HOUR).toISOString(),
    });
    const justOutside = bag({
      updated_at: new Date(NOW.getTime() - (BAG_STALE_AFTER_HOURS + 1) * HOUR).toISOString(),
    });
    expect(isBagStale(justInside, NOW)).toBe(false);
    expect(isBagStale(justOutside, NOW)).toBe(true);
  });

  it("treats an unreadable timestamp as not stale, so a live bag is never chased by accident", () => {
    expect(isBagStale(bag({ updated_at: "not a date" }), NOW)).toBe(false);
  });
});

describe("bagOwnerLabel", () => {
  it("prefers the name, then the email, and never shows a user id", () => {
    expect(bagOwnerLabel(bag())).toBe("Ama Owusu");
    expect(
      bagOwnerLabel(
        bag({ owner: { kind: "customer", user_id: "u1", name: null, email: "a@b.com", session_id: null } }),
      ),
    ).toBe("a@b.com");
    expect(
      bagOwnerLabel(
        bag({ owner: { kind: "customer", user_id: "u1", name: null, email: null, session_id: null } }),
      ),
    ).toBe("Customer");
  });

  it("names an anonymous bag by the tail of its session, not the whole cookie", () => {
    const label = bagOwnerLabel(
      bag({
        owner: {
          kind: "anonymous",
          user_id: null,
          name: null,
          email: null,
          session_id: "sess_abcdef123456",
        },
      }),
    );
    expect(label).toBe("Visitor · 123456");
    expect(label).not.toContain("sess_abcdef");
  });
});

// ── Boxes ───────────────────────────────────────────────────────────────────

const CONSTANTS = {
  box_capacity_lbs: 50,
  consolidation_saving_pct: 0.1,
  minimum_chargeable_weight_lbs: 1,
};

function box(overrides: Partial<ConsolidationBoxRow> = {}): ConsolidationBoxRow {
  return {
    id: "box-1",
    region_code: "USA",
    label: null,
    capacity_lbs: 50,
    cutoff_at: null,
    departs_at: null,
    status: "open",
    created_at: NOW.toISOString(),
    updated_at: NOW.toISOString(),
    ...overrides,
  };
}

function item(overrides: Partial<AdminBoxItem> = {}): AdminBoxItem {
  return {
    kind: "order",
    id: "i1",
    reference: "TM-00001",
    title: "A thing",
    product_url: null,
    quantity: 1,
    weight_lbs: 10,
    pricing: null,
    order_status: "paid",
    ...overrides,
  };
}

describe("describeBoxFill", () => {
  it("adds the chargeable weights the packer would have charged", () => {
    const fill = describeBoxFill(
      box(),
      [item({ id: "a", weight_lbs: 10, quantity: 2 }), item({ id: "b", weight_lbs: 5 })],
      CONSTANTS,
    );
    expect(fill.chargeableLbs).toBe(25);
    expect(fill.fillPct).toBe(50);
    expect(fill.headroomLbs).toBe(25);
  });

  it("applies the minimum chargeable weight rather than the listed one", () => {
    const fill = describeBoxFill(box(), [item({ weight_lbs: 0.2 })], {
      ...CONSTANTS,
      minimum_chargeable_weight_lbs: 2,
    });
    expect(fill.chargeableLbs).toBe(2);
  });

  it("prefers the stored breakdown's weight over the listing's", () => {
    const pricing = { weight_lbs: 8 } as unknown as PricingBreakdown;
    const fill = describeBoxFill(box(), [item({ weight_lbs: 3, pricing })], CONSTANTS);
    expect(fill.chargeableLbs).toBe(8);
  });

  it("counts an unweighed item at zero and says how many there were", () => {
    const fill = describeBoxFill(
      box(),
      [item({ id: "a", weight_lbs: 10 }), item({ id: "b", weight_lbs: null })],
      CONSTANTS,
    );
    expect(fill.chargeableLbs).toBe(10);
    expect(fill.unweighedCount).toBe(1);
  });

  it("separates what has been paid for from what is still in a bag", () => {
    const fill = describeBoxFill(
      box(),
      [item({ id: "a" }), item({ id: "b", kind: "bag_line", order_status: null })],
      CONSTANTS,
    );
    expect(fill.committedCount).toBe(1);
    expect(fill.provisionalCount).toBe(1);
  });

  it("clamps the meter at 100 for an over-packed box but keeps the true weight", () => {
    const fill = describeBoxFill(box({ capacity_lbs: 10 }), [item({ weight_lbs: 40 })], CONSTANTS);
    expect(fill.fillPct).toBe(100);
    expect(fill.chargeableLbs).toBe(40);
    expect(fill.headroomLbs).toBe(0);
  });

  it("reports an empty box as empty rather than dividing by a missing capacity", () => {
    expect(describeBoxFill(box({ capacity_lbs: 0 }), [], CONSTANTS).fillPct).toBe(0);
  });
});

describe("isPastCutoff", () => {
  it("is false when no cutoff was ever set", () => {
    expect(isPastCutoff(box(), NOW)).toBe(false);
  });

  it("is true only once the cutoff has actually passed", () => {
    expect(
      isPastCutoff(box({ cutoff_at: new Date(NOW.getTime() + HOUR).toISOString() }), NOW),
    ).toBe(false);
    expect(
      isPastCutoff(box({ cutoff_at: new Date(NOW.getTime() - HOUR).toISOString() }), NOW),
    ).toBe(true);
  });
});
