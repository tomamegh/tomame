import { describe, expect, it } from "vitest";

import { availabilityNotice, stockNote } from "../components/format";

describe("availabilityNotice", () => {
  it("reduces a store's phrase to one of three calm lines", () => {
    expect(availabilityNotice("In Stock.")).toEqual({ tone: "success", label: "In stock at the store" });
    expect(availabilityNotice("Only 2 left in stock - order soon.")).toEqual({ tone: "warning", label: "Only 2 left at the store" });
    expect(availabilityNotice("Currently unavailable. We don't know when or if this item will be back in stock.")).toEqual({
      tone: "warning",
      label: "Out of stock at the store",
    });
  });

  it("never prints scraped text it does not recognise", () => {
    expect(availabilityNotice("FREE delivery Tuesday, November 25 on orders shipped by Amazon")).toBeNull();
    expect(availabilityNotice("   ")).toBeNull();
    expect(availabilityNotice(null)).toBeNull();
  });
});

describe("stockNote", () => {
  const now = new Date("2026-11-23T12:00:00Z");

  it("says what the store said and when we read it", () => {
    expect(stockNote({ availability: "In Stock.", fetchedAt: "2026-11-23T11:58:00Z", now })).toEqual({
      tone: "success",
      label: "In stock at the store · checked 2 min ago",
    });
    expect(stockNote({ availability: "Only 2 left in stock - order soon.", fetchedAt: "2026-11-23T11:59:50Z", now })).toEqual({
      tone: "warning",
      label: "Only 2 left at the store · checked just now",
    });
  });

  it("lets our team's confirmation outrank the store's wording", () => {
    expect(stockNote({ availability: "Only 1 left", fetchedAt: "2026-11-23T08:00:00Z", now, stockCheckStatus: "confirmed" })).toEqual({
      tone: "success",
      label: "Stock confirmed by our team",
    });
  });

  it("shows nothing when the store said nothing we can read", () => {
    expect(stockNote({ availability: "Ships from and sold by Amazon", fetchedAt: "2026-11-23T11:00:00Z", now })).toBeNull();
    expect(stockNote({ availability: null, fetchedAt: null, now })).toBeNull();
  });
});
