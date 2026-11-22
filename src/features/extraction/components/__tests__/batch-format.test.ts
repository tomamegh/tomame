import { describe, expect, it } from "vitest";

import { PRICE_CONFIRMING_MESSAGE } from "@/features/extraction/price-confidence";
import { STOCK_CHECK_MESSAGE, STOCK_UNAVAILABLE_MESSAGE } from "@/features/extraction/stock-signals";
import type { PasteBatchLine } from "../../services/paste-batch";
import type { PasteStatus } from "../../services/paste-status";
import { batchRowStatus, quoteExpiry, readingClock, linksInText, splitLinks } from "../batch-format";

describe("splitLinks", () => {
  it("splits several links pasted at once, in order, without repeats", () => {
    const text = `https://www.amazon.com/dp/B0C1
https://www.ebay.com/itm/123, https://www.amazon.com/dp/B0C1
see also walmart.com/ip/456.`;
    expect(splitLinks(text)).toEqual(["https://www.amazon.com/dp/B0C1", "https://www.ebay.com/itm/123", "walmart.com/ip/456"]);
  });

  it("finds nothing in a description", () => {
    expect(splitLinks("wireless earbuds under 100 dollars")).toEqual([]);
    expect(splitLinks("")).toEqual([]);
  });
});

const paste = (over: Partial<PasteStatus> = {}): PasteStatus => ({
  id: "p1",
  product_url: "https://www.amazon.com/dp/B0C1",
  status: "ready",
  outcome: "priced",
  rechecking: false,
  queued_at: "2026-11-20T10:00:00Z",
  extraction_cache_id: "e1",
  title: "Headphones",
  error: null,
  created_at: "2026-11-20T10:00:00Z",
  updated_at: "2026-11-20T10:00:05Z",
  assisted: null,
  quote_expires_at: "2026-11-21T10:00:05Z",
  priced_from_cache_at: null,
  ...over,
});

const line = (over: Partial<PasteBatchLine> = {}): PasteBatchLine => ({
  request_id: "p1",
  extraction_cache_id: "e1",
  title: "Headphones",
  image: null,
  store: "Amazon",
  url: "https://www.amazon.com/dp/B0C1",
  total_ghs: 5041.16,
  total_usd: 349.36,
  pricing_unavailable_reason: null,
  pay_hold: null,
  receipt: [],
  ...over,
});

describe("batchRowStatus", () => {
  it("a re-check reads as Re-checking until it lands; out of stock is its own state (106)", () => {
    expect(batchRowStatus(paste({ status: "running", rechecking: true }), line())).toMatchObject({ kind: "reading", label: "Re-checking", addable: false });
    expect(batchRowStatus(paste({ outcome: "unavailable", extraction_cache_id: null }), null)).toMatchObject({ kind: "unavailable", label: "Out of stock", askable: true });
  });

  it("walks Reading → Pricing → Ready", () => {
    expect(batchRowStatus(paste({ outcome: "reading", status: "running", extraction_cache_id: null }), null).label).toBe("Reading");
    expect(batchRowStatus(paste(), null).label).toBe("Pricing");
    const ready = batchRowStatus(paste(), line());
    expect(ready).toMatchObject({ label: "Ready", tone: "success", addable: true });
  });

  it("names the hold, and keeps a held line addable but not an unavailable one", () => {
    const price = batchRowStatus(paste(), line({ pay_hold: { kind: "price_check", message: PRICE_CONFIRMING_MESSAGE, needs_staff: false } }));
    expect(price).toMatchObject({ label: "Confirming price", addable: true });
    const stock = batchRowStatus(paste(), line({ pay_hold: { kind: "stock_check", message: STOCK_CHECK_MESSAGE, needs_staff: true } }));
    expect(stock).toMatchObject({ label: "Needs a stock check", addable: true });
    const gone = batchRowStatus(paste(), line({ pay_hold: { kind: "unavailable", message: STOCK_UNAVAILABLE_MESSAGE, needs_staff: false } }));
    expect(gone).toMatchObject({ label: "No longer available", addable: false });
  });

  it("offers a buyer when the link could not be read or priced", () => {
    expect(batchRowStatus(paste({ outcome: "unpriced", extraction_cache_id: null }), null)).toMatchObject({ label: "Couldn't read", askable: true });
    expect(batchRowStatus(paste({ outcome: "manual", status: "failed", extraction_cache_id: null }), null)).toMatchObject({ kind: "manual", askable: false });
    expect(batchRowStatus(paste(), line({ total_ghs: null, pricing_unavailable_reason: "needs_review" }))).toMatchObject({ label: "Couldn't price", askable: true });
  });

  it("offers a fresh read for a stale or expired quote, never a buyer (110)", () => {
    expect(batchRowStatus(paste({ outcome: "expired" }), null)).toMatchObject({ kind: "expired", refreshable: true, askable: false });
    expect(batchRowStatus(paste({ outcome: "stale" }), null)).toMatchObject({ kind: "stale", refreshable: true });
  });

  it("says Checking freight, not Couldn't price, while the freight check runs (110)", () => {
    const hold = { kind: "freight_check" as const, message: "Checking", needs_staff: false };
    expect(batchRowStatus(paste(), line({ total_ghs: null, pricing_unavailable_reason: "Checking", pay_hold: hold }))).toMatchObject({ kind: "pricing", label: "Checking freight" });
  });

  it("keeps a priced link on Pricing while its total is still settling", () => {
    expect(batchRowStatus(paste(), line({ total_ghs: null, pricing_unavailable_reason: null }))).toMatchObject({ kind: "pricing", label: "Pricing", askable: false });
    expect(batchRowStatus(paste({ assisted: { status: "open", requested_at: "2026-11-20T10:01:00Z" } }), null).label).toBe("With a buyer");
  });
});

describe("links inside typed or pasted text", () => {
  it("reads several links typed with spaces as links, not a description", () => {
    expect(
      linksInText("https://www.amazon.com/-/en/dp/B0DJ1C3J2B?language=en_US&currency=GHS https://www.amazon.com/dp/B07Q31WX1C https://www.amazon.com/dp/B08CH4TFC6"),
    ).toHaveLength(3);
  });

  it("finds the link in an app's share text", () => {
    expect(linksInText("Check out this item on Amazon https://a.co/d/abc123")).toEqual(["https://a.co/d/abc123"]);
  });

  it("keeps a sentence that only names a store as a description", () => {
    expect(linksInText("Samsung S24 at walmart.com")).toEqual([]);
    expect(linksInText("Oraimo FreePods 4 earbuds")).toEqual([]);
  });

  it("still takes a single bare link", () => {
    expect(linksInText("amazon.com/dp/B07Q31WX1C")).toEqual(["amazon.com/dp/B07Q31WX1C"]);
  });
});

describe("quoteExpiry / readingClock (110)", () => {
  it("names the end in Accra time with what is left", () => {
    const e = quoteExpiry("2026-11-23T20:41:00Z", Date.parse("2026-11-22T21:00:00Z"));
    expect(e).toMatchObject({ lapsed: false, left: "23 h 41 min left" });
    expect(e?.at).toContain("20:41");
    expect(quoteExpiry("2026-11-23T20:41:00Z", Date.parse("2026-11-23T20:42:00Z"))?.lapsed).toBe(true);
    expect(quoteExpiry(null, 0)).toBeNull();
  });

  it("counts the read and explains a long one", () => {
    expect(readingClock("2026-11-22T10:00:00Z", Date.parse("2026-11-22T10:00:42Z"))).toEqual({ elapsed: "0:42", note: null });
    expect(readingClock("2026-11-22T10:00:00Z", Date.parse("2026-11-22T10:01:05Z")).note).toMatch(/buyer quotes it/);
  });
});
