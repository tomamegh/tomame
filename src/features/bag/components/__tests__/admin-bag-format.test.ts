import { describe, expect, it } from "vitest";

import type { AdminBagRow } from "@/db/queries/admin-bags";
import type { AdminBoxItem } from "@/db/queries/admin-boxes";
import type { ConsolidationBoxRow } from "@/db/queries/consolidation-boxes";
import type { PricingBreakdown } from "@/lib/pricing";
import {
  BAG_STALE_AFTER_HOURS,
  bagOwnerLabel,
  bagReasons,
  isBagReady,
  sittingBags,
  sittingBucket,
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
    owner: { kind: "customer", user_id: "u1", name: "Ama Owusu", email: null, phone: "+233241234567", session_id: null },
    line_count: 1,
    item_count: 1,
    snapshot_value_ghs: 100,
    priced_line_count: 1,
    blocked_line_count: 0,
    expired_line_count: 0,
    delivery_chosen: true,
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

    expect(totals).toMatchObject({
      count: 3,
      blocked: 1,
      stale: 1,
      snapshotValueGhs: 200,
      itemCount: 6,
    });
  });

  it("answers zeroes for an empty list rather than throwing", () => {
    expect(summariseBags([], NOW)).toMatchObject({
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
        bag({ owner: { kind: "customer", user_id: "u1", name: null, email: "a@b.com", phone: null, session_id: null } }),
      ),
    ).toBe("a@b.com");
    expect(
      bagOwnerLabel(
        bag({ owner: { kind: "customer", user_id: "u1", name: null, email: null, phone: null, session_id: null } }),
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
          phone: null,
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
    code: "BX-1001",
    departure_id: null,
    closed_at: null,
    closed_reason: null,
    archived_at: null,
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
    scale_weight_lbs: null,
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

  it("shows an over-packed box as over capacity, not 100% · 0 lb spare (Fix 11)", () => {
    const fill = describeBoxFill(box({ capacity_lbs: 10 }), [item({ weight_lbs: 40 })], CONSTANTS);
    expect(fill.fillPct).toBe(400);
    expect(fill.chargeableLbs).toBe(40);
    expect(fill.headroomLbs).toBe(0);
    expect(fill.over).toBe(true);
    expect(fill.overLbs).toBe(30);
    expect(fill.oversizeRefs).toEqual(["TM-00001"]);
  });

  it("re-checks the TV: 141.2 lb in a 9 lb box is 1569% and 132.2 lb over", () => {
    const fill = describeBoxFill(box({ capacity_lbs: 9 }), [item({ weight_lbs: 141.2 })], CONSTANTS);
    expect(fill).toMatchObject({ fillPct: 1569, overLbs: 132.2, headroomLbs: 0, over: true });
  });

  it("counts the hub's scale as confirmed and the listing as an estimate", () => {
    const fill = describeBoxFill(
      box(),
      [item({ id: "a", weight_lbs: 2, scale_weight_lbs: 3.5 }), item({ id: "b", weight_lbs: 2 }), item({ id: "c", weight_lbs: null })],
      CONSTANTS,
    );
    expect(fill).toMatchObject({ weighedCount: 1, estimateCount: 1, unweighedCount: 1 });
    expect(fill.chargeableLbs).toBe(5.5);
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

describe("bagReasons (Fix 14)", () => {
  const line = (state: AdminBagRow["lines"][number]["state"], over: Partial<AdminBagRow["lines"][number]> = {}) => ({
    id: `l-${state}`,
    title: "Thing",
    product_url: null,
    quantity: 1,
    snapshot_total_ghs: 100,
    state,
    quoted_at: NOW.toISOString(),
    created_at: NOW.toISOString(),
    ...over,
  });

  it("is empty for a bag that can be paid: Ready to pay", () => {
    expect(bagReasons(bag({ lines: [line("priced")] }), NOW)).toEqual([]);
  });

  it("never says only Blocked: each reason carries its next action", () => {
    const threeDaysAgo = new Date(NOW.getTime() - 3 * 24 * HOUR).toISOString();
    const reasons = bagReasons(
      bag({
        lines: [line("failed"), line("unpriced"), line("expired", { quoted_at: threeDaysAgo }), line("reading")],
        blocked_line_count: 3,
        expired_line_count: 1,
        delivery_chosen: false,
      }),
      NOW,
    );
    expect(reasons.map((r) => r.key)).toEqual(["needs_price", "reading", "expired", "details"]);
    expect(reasons[0]).toMatchObject({ label: "1 link could not be read · 1 listing had no price", href: "/admin/pastes" });
    expect(reasons[2]).toMatchObject({ label: "Quote expired · quoted 3 days ago", action: "Re-quote at today's rate", requote: true });
    expect(reasons[3]!.label).toBe("No delivery yet");
    for (const reason of reasons) expect(reason.action.length).toBeGreaterThan(5);
  });

  it("calls a link read for over 30 minutes stuck, and a visitor not signed in", () => {
    const old = new Date(NOW.getTime() - 2 * HOUR).toISOString();
    const reasons = bagReasons(
      bag({ owner: { kind: "anonymous", user_id: null, name: null, email: null, phone: null, session_id: "abc123" }, lines: [line("reading", { created_at: old })], blocked_line_count: 1 }),
      NOW,
    );
    expect(reasons.map((r) => r.key)).toEqual(["stuck", "anonymous"]);
  });

  it("asks a signed-in customer with no phone for one, and a listing no longer on file to be pasted again", () => {
    const reasons = bagReasons(bag({ owner: { kind: "customer", user_id: "u1", name: "Ama", email: null, phone: null, session_id: null }, lines: [line("gone")], blocked_line_count: 1 }), NOW);
    expect(reasons[0]).toMatchObject({ key: "needs_price", action: "Ask the customer to paste the link again" });
    expect(reasons[1]).toMatchObject({ key: "details", label: "No phone number yet" });
  });

  it("keeps a re-quoted bag Ready to pay when only checkout details are missing", () => {
    const reasons = bagReasons(bag({ delivery_chosen: false, lines: [line("priced")] }), NOW);
    expect(reasons.map((r) => r.key)).toEqual(["details"]);
    expect(isBagReady(reasons)).toBe(true);
    expect(isBagReady(bagReasons(bag({ lines: [line("expired")], expired_line_count: 1 }), NOW))).toBe(false);
  });

  it("counts Ready to pay and each reason across bags", () => {
    const totals = summariseBags([bag({ id: "a", lines: [line("priced")] }), bag({ id: "b", lines: [line("expired")], expired_line_count: 1 })], NOW);
    expect(totals.ready).toBe(1);
    expect(totals.reasons.expired).toBe(1);
  });
});

describe("sitting bags (Fix 14)", () => {
  it("lists bags untouched for over 48 hours, oldest first, in age buckets", () => {
    const ago = (days: number) => new Date(NOW.getTime() - days * 24 * HOUR).toISOString();
    const list = sittingBags([bag({ id: "fresh" }), bag({ id: "five", updated_at: ago(5) }), bag({ id: "three", updated_at: ago(3) }), bag({ id: "twenty", updated_at: ago(20) })], NOW);
    expect(list.map((b) => b.id)).toEqual(["twenty", "five", "three"]);
    expect(list.map((b) => sittingBucket(b, NOW))).toEqual(["over 2 weeks", "4-7 days", "2-3 days"]);
  });
});
