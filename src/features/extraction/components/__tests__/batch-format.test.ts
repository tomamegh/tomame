import { describe, expect, it } from "vitest";

import { PRICE_CONFIRMING_MESSAGE } from "@/features/extraction/price-confidence";
import { STOCK_CHECK_MESSAGE, STOCK_UNAVAILABLE_MESSAGE } from "@/features/extraction/stock-signals";
import type { PasteBatchLine } from "../../services/paste-batch";
import type { PasteStatus } from "../../services/paste-status";
import { batchRowStatus, splitLinks } from "../batch-format";

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
  extraction_cache_id: "e1",
  title: "Headphones",
  error: null,
  created_at: "2026-11-20T10:00:00Z",
  updated_at: "2026-11-20T10:00:05Z",
  assisted: null,
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
  ...over,
});

describe("batchRowStatus", () => {
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
    expect(batchRowStatus(paste({ outcome: "expired", status: "failed", extraction_cache_id: null }), null)).toMatchObject({ label: "Couldn't read", askable: true });
    expect(batchRowStatus(paste(), line({ total_ghs: null }))).toMatchObject({ label: "Couldn't price", askable: true });
    expect(batchRowStatus(paste({ assisted: { status: "open", requested_at: "2026-11-20T10:01:00Z" } }), null).label).toBe("With a buyer");
  });
});
