import { describe, expect, it } from "vitest";

import type { PricingBreakdown } from "@/lib/pricing";
import {
  buildReceiptRows,
  formatEtaDate,
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

describe("formatEtaDate", () => {
  it("formats a bare YYYY-MM-DD as UTC, so it cannot shift a day", () => {
    expect(formatEtaDate("2026-09-19")).toBe("Lands 19 Sept");
  });

  it("returns null rather than inventing a date", () => {
    expect(formatEtaDate("")).toBeNull();
    expect(formatEtaDate("soon")).toBeNull();
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
    const rows = buildReceiptRows(
      breakdown({ tax_percentage: 0.075, value_fee_percentage: 0.04 }),
    );

    expect(rows.map((row) => row.label)).toEqual([
      "Item",
      "7.5% sales tax",
      "4% Tomame fee",
      "Freight",
      "Rate",
    ]);
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

  it("has one entrance delay per row", () => {
    expect(buildReceiptRows(breakdown())).toHaveLength(
      RECEIPT_ROW_DELAYS.length,
    );
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

describe("formatEtaDate tense", () => {
  it("reads as an arrival once the journey is complete", () => {
    expect(formatEtaDate("2026-09-06", { landed: true })).toBe("Landed 6 Sept");
  });
});
