import { describe, it, expect } from "vitest";

import type { OrderPricingBreakdown } from "@/features/orders/types";
import {
  ctaLabel,
  feedbackStatusLabel,
  feedbackStatusNote,
  feedbackVerdictLabel,
  isFeedbackComplaint,
  photoAltText,
  photoKindLabel,
  formatEtaWindow,
  formatEventStamp,
  formatGroupPosition,
  formatRowEyebrow,
  formatRowMeta,
  formatShortDay,
  formatWeekdayDay,
  paidRows,
  paidTotalGhs,
} from "../format";

const pricing = (over: Partial<OrderPricingBreakdown> = {}): OrderPricingBreakdown =>
  ({
    subtotal_usd: 298,
    tax_usd: 23.84,
    tax_percentage: 0.08,
    value_fee_usd: 14.9,
    value_fee_percentage: 0.05,
    flat_rate_ghs: 180,
    exchange_rate: 14.43,
    total_ghs: 5041.16,
    ...over,
  }) as OrderPricingBreakdown;

describe("dates", () => {
  it('formats "28 Aug", not en-GB\'s "28 Sept"', () => {
    expect(formatShortDay("2026-08-28T10:20:00Z")).toBe("28 Aug");
    expect(formatShortDay("2026-09-08T22:14:00Z")).toBe("8 Sep");
  });

  it("treats a bare YYYY-MM-DD as that calendar day, not as local midnight", () => {
    expect(formatWeekdayDay("2026-09-18")).toBe("Fri 18 Sep");
  });

  it('stamps an update as "Sep 8 · 22:14"', () => {
    expect(formatEventStamp("2026-09-08T22:14:00Z")).toBe("Sep 8 · 22:14");
  });

  it("returns null rather than 'Invalid Date' for anything unparseable", () => {
    expect(formatShortDay(null)).toBeNull();
    expect(formatShortDay("")).toBeNull();
    expect(formatShortDay("soon")).toBeNull();
    expect(formatEventStamp(undefined)).toBeNull();
  });
});

describe("formatEtaWindow", () => {
  it("prints the month once when both ends share it", () => {
    expect(formatEtaWindow({ from: "2026-09-18", to: "2026-09-20", source: "confirmed" })).toBe(
      "Fri 18 – Sun 20 Sep",
    );
  });

  it("keeps both months when the window crosses one", () => {
    expect(formatEtaWindow({ from: "2026-09-28", to: "2026-10-02", source: "confirmed" })).toBe(
      "Mon 28 Sep – Fri 2 Oct",
    );
  });

  it("collapses a one-day window to a single day", () => {
    expect(formatEtaWindow({ from: "2026-09-18", to: "2026-09-18", source: "confirmed" })).toBe(
      "Fri 18 Sep",
    );
  });

  it("accepts a half-open window rather than squaring it off into a fake range", () => {
    expect(formatEtaWindow({ from: "2026-09-18", to: null, source: "confirmed" })).toBe(
      "Fri 18 Sep",
    );
  });

  it("returns null when there is no window at all — the tile is then not drawn", () => {
    expect(formatEtaWindow(null)).toBeNull();
    expect(formatEtaWindow({ from: null, to: null, source: "estimated" })).toBeNull();
  });
});

describe("row labels", () => {
  it("drops the store when the URL matched nothing we know", () => {
    expect(formatRowEyebrow(null, "TM-00042", "2026-08-28T00:00:00Z")).toBe("TM-00042 · 28 Aug");
    expect(formatRowEyebrow("Amazon", "TM-00042", "2026-08-28T00:00:00Z")).toBe(
      "Amazon · TM-00042 · 28 Aug",
    );
  });

  it("drops the total when the order has no priced snapshot", () => {
    expect(formatRowMeta(2, null)).toBe("Qty 2");
    expect(formatRowMeta(2, 612.4)).toBe("Qty 2 · GH₵612.40");
  });

  it("only numbers a line that actually has siblings", () => {
    expect(formatGroupPosition(null)).toBeNull();
    expect(formatGroupPosition({ index: 1, total: 1 })).toBeNull();
    expect(formatGroupPosition({ index: 2, total: 3 })).toBe("2 of 3 in this bag");
  });

  it("names each CTA", () => {
    expect(ctaLabel("pay")).toBe("Pay now");
    expect(ctaLabel("buy_again")).toBe("Buy again");
    expect(ctaLabel("track")).toBe("Track");
    expect(ctaLabel("details")).toBe("Details");
  });
});

describe("paidRows — read from the stored breakdown, never recomputed", () => {
  it("prints the receipt the mock draws", () => {
    expect(paidRows(pricing())).toEqual([
      { key: "item", label: "Item", value: "$298.00" },
      { key: "tax", label: "US sales tax 8%", value: "$23.84" },
      { key: "fee", label: "Tomame fee 5%", value: "$14.90" },
      { key: "freight", label: "Freight", value: "GH₵180.00" },
      { key: "rate", label: "Rate", value: "1 USD = 14.43", tone: "muted" },
    ]);
  });

  it("omits a zero line rather than printing '$0.00'", () => {
    const keys = paidRows(pricing({ tax_usd: 0, value_fee_usd: 0, flat_rate_ghs: 0 })).map(
      (row) => row.key,
    );
    expect(keys).toEqual(["item", "rate"]);
  });

  it("quotes the rate at the same two decimals as the nav pill", () => {
    const rate = paidRows(pricing({ exchange_rate: 14.4297 })).find((r) => r.key === "rate");
    expect(rate?.value).toBe("1 USD = 14.43");
  });
});

describe("paidTotalGhs", () => {
  it("uses the stored total by default", () => {
    expect(paidTotalGhs(pricing(), null)).toBe(5041.16);
  });

  it("prefers an admin override — that is what the customer was actually charged", () => {
    expect(paidTotalGhs(pricing(), 4999)).toBe(4999);
  });

  it("ignores a nonsense override rather than rendering NaN", () => {
    expect(paidTotalGhs(pricing(), Number.NaN)).toBe(5041.16);
  });
});

describe("parcel photos and feedback (054)", () => {
  it("names every photo kind the column can hold", () => {
    expect(photoKindLabel("hub_received")).toBe("At our US hub");
    expect(photoKindLabel("packed")).toBe("Packed for the flight");
    expect(photoKindLabel("damaged")).toBe("Damage we found");
    expect(photoKindLabel("delivered")).toBe("At your door");
    expect(photoKindLabel("other")).toBe("From the warehouse");
  });

  it("describes an uncaptioned photo for a screen reader", () => {
    expect(photoAltText("hub_received", "2026-09-08T22:14:00Z")).toBe(
      "Photo of your parcel. At our US hub, 8 Sep",
    );
    expect(photoAltText("packed", "not-a-date")).toBe(
      "Photo of your parcel. Packed for the flight",
    );
  });

  it("reads a confirmation back as a confirmation, not a complaint", () => {
    expect(feedbackVerdictLabel("looks_right")).toBe("You confirmed this looks right");
    expect(isFeedbackComplaint("looks_right")).toBe(false);
    expect(isFeedbackComplaint("wrong_variant")).toBe(true);
  });

  it("never promises a buyer will look at a confirmation", () => {
    expect(feedbackStatusNote("looks_right", "open")).toBe(
      "Thank you. That is noted against this parcel.",
    );
    expect(feedbackStatusNote("wrong_item", "open")).toContain("Someone will look at it");
    expect(feedbackStatusNote("wrong_item", "in_review")).toBe(
      "A buyer is looking into this now.",
    );
    expect(feedbackStatusNote("damaged", "resolved")).toBe("We have dealt with this.");
  });

  it("labels where a complaint has got to in the queue", () => {
    expect(feedbackStatusLabel("open")).toBe("Received");
    expect(feedbackStatusLabel("in_review")).toBe("Being looked at");
    expect(feedbackStatusLabel("resolved")).toBe("Sorted");
    expect(feedbackStatusLabel("dismissed")).toBe("Closed");
  });
});
