import { describe, expect, it } from "vitest";

import { PRICE_CONFIRMING_MESSAGE } from "@/features/extraction/price-confidence";
import { STOCK_CHECK_MESSAGE, STOCK_UNAVAILABLE_MESSAGE } from "@/features/extraction/stock-signals";
import type { PricingBreakdown } from "@/lib/pricing";
import { describePendingWait, payBlockReason } from "../components/format";
import type { BagDelivery, BagLine, BagView } from "../types";

const pricing = { total_ghs: 1000 } as PricingBreakdown;

function line(over: Partial<BagLine> = {}): BagLine {
  return {
    id: Math.random().toString(36).slice(2),
    extraction_cache_id: "e",
    pending: null,
    quantity: 1,
    special_instructions: null,
    product: { title: "Thing", image: null, url: "https://example.com", store: null, variant: null, weight_lbs: 1, country: "USA" },
    pricing,
    pricing_unavailable_reason: null,
    gap_price_usd: null,
    gap_origin_country: null,
    sourced_price_usd: null,
    store_shipping_code: null,
    sourcing: null,
    freight_checking: false,
    pay_hold: null,
    ...over,
  };
}

const door: BagDelivery = { kind: "door", address_id: "a", zone_id: "z", zone_name: "Greater Accra", label: "Home", fee_ghs: 0 };

function view(lines: BagLine[], over: Partial<BagView> = {}): BagView {
  return {
    delivery: door, delivery_fee_ghs: 0, cart_id: "c", lines, boxes: [], unboxed_line_ids: [], consolidation_saving_ghs: 0, consolidation_saving_pct: 0,
    item_count: lines.length, subtotal_usd: 0, tax_usd: 0, fee_usd: 0, store_shipping_usd: 0, freight_ghs: 0, boxed_weight_lbs: 0, total_ghs: 0, total_usd: 0,
    rate_locked_until: null, has_unpriced_lines: false, has_pending_lines: false, has_freight_checks: false, has_sourcing_lines: false,
    ...over,
  };
}

const ctx = { isSignedIn: true, hasContact: true };

describe("payBlockReason", () => {
  it("is null when nothing waits", () => {
    expect(payBlockReason(view([line()]), ctx)).toBeNull();
    expect(payBlockReason(view([]), ctx)).toBeNull();
  });

  it("names a price being confirmed instead of letting checkout 409", () => {
    const held = line({ pay_hold: { kind: "price_check", message: PRICE_CONFIRMING_MESSAGE, needs_staff: true } });
    expect(payBlockReason(view([line(), held]), ctx)).toBe("We're confirming the price of 1 item. Pay opens once it's confirmed.");
  });

  it("puts an unavailable item ahead of a price check, and counts", () => {
    const gone = line({ pay_hold: { kind: "unavailable", message: STOCK_UNAVAILABLE_MESSAGE, needs_staff: false } });
    const stock = line({ pay_hold: { kind: "stock_check", message: STOCK_CHECK_MESSAGE, needs_staff: true } });
    expect(payBlockReason(view([gone, gone, stock]), ctx)).toBe("2 items are no longer available. Remove them to pay for the rest.");
    expect(payBlockReason(view([stock]), ctx)).toBe("We're confirming stock and condition for 1 item. Pay opens once it's confirmed.");
  });

  it("puts reads and freight checks first: they finish on their own", () => {
    const reading = line({ pending: { request_id: "r", status: "pending", error: null, queued_at: new Date().toISOString(), assisted_open: false }, pricing: null });
    const freight = line({ freight_checking: true, pricing: null });
    expect(payBlockReason(view([reading, freight]), ctx)).toBe("Reading 1 item. Pay opens once it's priced.");
    expect(payBlockReason(view([freight]), ctx)).toMatch(/^Checking the freight on 1 item/);
  });

  it("asks for delivery, then contact details, for a signed-in viewer", () => {
    expect(payBlockReason(view([line()], { delivery: null }), ctx)).toBe("Choose how you'd like it delivered to pay.");
    expect(payBlockReason(view([line()]), { isSignedIn: true, hasContact: false })).toBe("Add your name and phone number to pay.");
    expect(payBlockReason(view([line()], { delivery: null }), { isSignedIn: false, hasContact: false })).toBeNull();
  });
});

describe("describePendingWait copy", () => {
  const queued = new Date("2026-11-20T10:00:00Z");
  const pending = { request_id: "r", status: "pending" as const, error: null, queued_at: queued.toISOString(), assisted_open: false };
  it("is plain status at every mark, with no jokes", () => {
    const at = (s: number) => describePendingWait(pending, new Date(queued.getTime() + s * 1000), { notifies: true });
    expect(at(1).title).toBe("Reading this page");
    expect(at(6).title).toBe("Reading this page");
    expect(at(25).title).toBe("Still reading this page");
    for (const s of [1, 6, 25]) expect(`${at(s).title} ${at(s).detail ?? ""}`).not.toMatch(/stubborn|!/);
  });
});
