import { describe, expect, it } from "vitest";

import type { PricingBreakdown } from "@/lib/pricing";
import {
  buildReceiptRows,
  formatOrderLatest,
  formatGreetingFor,
  formatRelativeTime,
  RECEIPT_ROW_DELAYS,
  safeImageSrc,
  splitGhsTotal,
} from "@/features/app-home/components/format";

const NOW = new Date("2026-09-12T12:00:00Z");

function breakdown(overrides: Partial<PricingBreakdown> = {}): PricingBreakdown {
  return {
    pricing_method: "flat_rate",
    pricing_group: "electronics",
    item_price: 298,
    item_currency: "USD",
    item_price_usd: 298,
    quantity: 1,
    subtotal_usd: 298,
    exchange_rate: 14.43,
    mid_market_rate: 13.87,
    tax_percentage: 0.08,
    tax_usd: 23.84,
    value_fee_percentage: 0.06,
    value_fee_usd: 17.88,
    flat_rate_ghs: 240,
    total_ghs: 5041.16,
    total_pesewas: 504116,
    fee_calculation_note: "flat rate",
    ...overrides,
  };
}

describe("formatGreetingFor", () => {
  it("joins the name onto the server-resolved time of day", () => {
    expect(formatGreetingFor("Afternoon", "Kwame")).toBe("Afternoon, Kwame");
  });

  it("greets without a name rather than as 'there'", () => {
    expect(formatGreetingFor("Morning", null)).toBe("Morning");
    expect(formatGreetingFor("Evening", "   ")).toBe("Evening");
  });
});

describe("formatRelativeTime", () => {
  it("reads under a minute as 'just now'", () => {
    expect(formatRelativeTime("2026-09-12T11:59:30Z", NOW)).toBe("just now");
  });

  it("counts whole minutes and hours", () => {
    expect(formatRelativeTime("2026-09-12T11:58:00Z", NOW)).toBe("2 min ago");
    expect(formatRelativeTime("2026-09-12T11:00:00Z", NOW)).toBe("1 hr ago");
    expect(formatRelativeTime("2026-09-12T09:00:00Z", NOW)).toBe("3 hrs ago");
  });

  it("names yesterday, then counts days, then falls back to a date", () => {
    expect(formatRelativeTime("2026-09-11T10:00:00Z", NOW)).toBe("yesterday");
    expect(formatRelativeTime("2026-09-09T10:00:00Z", NOW)).toBe("3 days ago");
    expect(formatRelativeTime("2026-08-30T10:00:00Z", NOW)).toBe("30 Aug");
  });

  it("rounds a future timestamp to the present instead of counting forward", () => {
    expect(formatRelativeTime("2026-09-12T12:05:00Z", NOW)).toBe("just now");
  });

  it("returns null for junk so the caller drops the clause", () => {
    expect(formatRelativeTime("not a date", NOW)).toBeNull();
  });
});

describe("formatOrderLatest", () => {
  it("prints a real event with its note and short day", () => {
    expect(
      formatOrderLatest({
        kind: "event",
        title: "On its way to Accra",
        note: "New York",
        at: "2026-09-06T10:00:00.000Z",
      }),
    ).toBe("On its way to Accra · New York · 6 Sep");
  });

  it("drops an empty note rather than leaving a stray separator", () => {
    expect(
      formatOrderLatest({ kind: "event", title: "Paid", note: null, at: "2026-09-01T09:00:00.000Z" }),
    ).toBe("Paid · 1 Sep");
  });

  it("labels a forecast as an estimate and a confirmed window as a promise", () => {
    const eta = { from: "2026-09-18", to: "2026-09-20" };
    expect(formatOrderLatest({ kind: "eta", eta: { ...eta, source: "confirmed" } })).toBe(
      "At your door Fri 18 – Sun 20 Sep",
    );
    expect(formatOrderLatest({ kind: "eta", eta: { ...eta, source: "estimated" } })).toBe(
      "Estimated at your door Fri 18 – Sun 20 Sep",
    );
  });

  it("passes the stage hint through", () => {
    expect(formatOrderLatest({ kind: "hint", text: "Date set when it ships" })).toBe(
      "Date set when it ships",
    );
  });
});

describe("splitGhsTotal", () => {
  it("demotes the pesewas to their own run", () => {
    expect(splitGhsTotal(5041.16)).toEqual({
      whole: "GH₵5,041",
      fraction: ".16",
    });
  });

  it("keeps the grouping and the two decimals of formatGhs", () => {
    expect(splitGhsTotal(40)).toEqual({ whole: "GH₵40", fraction: ".00" });
  });
});

describe("safeImageSrc", () => {
  it("accepts https", () => {
    expect(safeImageSrc("https://m.media-amazon.com/a.jpg")).toBe(
      "https://m.media-amazon.com/a.jpg",
    );
  });

  it("accepts the two allow-listed http CDNs", () => {
    expect(safeImageSrc("http://img.ltwebstatic.com/a.jpg")).toBe(
      "http://img.ltwebstatic.com/a.jpg",
    );
  });

  it("rejects anything next/image is not configured for", () => {
    expect(safeImageSrc("http://example.com/a.jpg")).toBeNull();
    expect(safeImageSrc("data:image/png;base64,AAAA")).toBeNull();
    expect(safeImageSrc("/relative.jpg")).toBeNull();
    expect(safeImageSrc(null)).toBeNull();
  });
});

describe("buildReceiptRows", () => {
  it("takes every percentage off the breakdown, never a literal", () => {
    // `tax_usd` moves with `tax_percentage`: 7.5% of $298 is $22.35. The
    // override used to change only the rate and leave $23.84 beside it, which
    // is 8% — a breakdown the calculator cannot produce, and one the tax-floor
    // check now reads (correctly) as "the charge is not the rate".
    const rows = buildReceiptRows(
      breakdown({ tax_percentage: 0.075, tax_usd: 22.35, value_fee_percentage: 0.04 }),
    );

    expect(rows.map((row) => row.label)).toEqual([
      "Item",
      "7.5% sales tax",
      "4% Tomame fee",
      "Freight",
      "Rate",
    ]);
  });

  it("names the minimum when the floor decided the tax, not the rate", () => {
    // The release blocker: $6.78 of goods billed $2.00 under "10% sales tax",
    // which is 29.5%. QA, 2026-09-15.
    const rows = buildReceiptRows(
      breakdown({ item_price_usd: 6.78, subtotal_usd: 6.78, tax_percentage: 0.1, tax_usd: 2 }),
    );

    expect(rows.find((row) => row.key === "tax")).toMatchObject({
      label: "Sales tax (min. $2.00)",
      value: "$2.00",
    });
  });

  it("prints GH₵ for the freight and the rate, $ for the US-side figures", () => {
    const rows = buildReceiptRows(breakdown());
    expect(rows.map((row) => row.value)).toEqual([
      "$298.00",
      "$23.84",
      "$17.88",
      "GH₵240.00",
      "$1 = GH₵14.43",
    ]);
  });

  it("has one entrance delay per row, store shipping included", () => {
    expect(buildReceiptRows(breakdown({ store_shipping_usd: 24 }))).toHaveLength(
      RECEIPT_ROW_DELAYS.length,
    );
  });

  it("prints a Store shipping row only when the store charges shipping", () => {
    const rows = buildReceiptRows(breakdown({ store_shipping_usd: 48 }));
    expect(rows.map((row) => row.key)).toEqual(["item", "tax", "fee", "shipping", "freight", "rate"]);
    expect(rows.find((row) => row.key === "shipping")).toMatchObject({ label: "Store shipping", value: "$48.00" });
    expect(buildReceiptRows(breakdown()).some((row) => row.key === "shipping")).toBe(false);
  });

  it("omits a row rather than printing NaN when a figure is missing", () => {
    const rows = buildReceiptRows(
      breakdown({ tax_usd: Number.NaN, exchange_rate: 0 }),
    );
    expect(rows.map((row) => row.key)).toEqual(["item", "fee", "freight"]);
  });

  it("drops the percentage prefix rather than labelling a row 'NaN%'", () => {
    // The amount and its rate are separate fields: a row can carry a real
    // figure with no usable percentage beside it.
    const rows = buildReceiptRows(
      breakdown({
        tax_percentage: Number.NaN,
        value_fee_percentage: undefined as unknown as number,
      }),
    );

    const labels = rows.map((row) => row.label);
    expect(labels).toContain("Sales tax");
    expect(labels).toContain("Tomame fee");
    expect(labels.join(" ")).not.toContain("NaN");

    // The amounts still print — only the prefix is dropped.
    expect(rows.find((row) => row.key === "tax")?.value).toBe("$23.84");
  });
});

