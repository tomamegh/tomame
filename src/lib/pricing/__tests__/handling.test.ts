import { describe, expect, it } from "vitest";

import { buildReceiptRows } from "@/features/app-home/components/format";
import { paidRows } from "@/features/journeys/format";
import { breakdownRows } from "@/lib/email/templates/order-status";
import type { OrderPricingBreakdown } from "@/features/orders/types";
import type { PricingBreakdown } from "../calculator";
import { freightExHandlingGhs, handlingGhsOf } from "../handling";

// The brief's acceptance example: Oraimo BoomPop N, $49.99, 1 lb minimum, GH₵12.25.
const ORAIMO = {
  pricing_method: "weight_expression",
  pricing_group: "sound_speakers",
  item_price: 49.99,
  item_currency: "USD",
  item_price_usd: 49.99,
  quantity: 1,
  subtotal_usd: 49.99,
  exchange_rate: 12.25,
  mid_market_rate: 11.78,
  tax_percentage: 0.088,
  tax_usd: 4.4,
  value_fee_percentage: 0.04,
  value_fee_usd: 2,
  flat_rate_ghs: 110.25,
  freight_usd: 9,
  handling_fee_usd: 3,
  total_ghs: 801.03,
  total_pesewas: 80103,
  fee_calculation_note: "",
} as unknown as PricingBreakdown & OrderPricingBreakdown;

describe("handling fee as its own line (Fix 7)", () => {
  it("splits freight and handling; a breakdown stored before Fix 7 splits from the rate", () => {
    expect(handlingGhsOf(ORAIMO)).toBe(36.75);
    expect(freightExHandlingGhs(ORAIMO)).toBe(73.5);
    expect(handlingGhsOf({ ...ORAIMO, handling_ghs: 36.75 })).toBe(36.75);
  });

  it("is zero for flat-rate and fixed-freight items, and never more than the freight", () => {
    expect(handlingGhsOf({ ...ORAIMO, pricing_method: "flat_rate" })).toBe(0);
    expect(handlingGhsOf({ ...ORAIMO, pricing_method: "fixed_freight" })).toBe(0);
    expect(handlingGhsOf({ ...ORAIMO, flat_rate_ghs: 10 })).toBe(10);
    expect(handlingGhsOf(null)).toBe(0);
  });

  it("shows a Handling fee line on the quote, the order page and the email, and the lines add up to the total", () => {
    const quote = buildReceiptRows(ORAIMO);
    expect(quote.find((r) => r.key === "freight")?.value).toBe("GH₵73.50");
    expect(quote.find((r) => r.key === "handling")).toMatchObject({ label: "Handling fee", value: "GH₵36.75" });

    const page = paidRows(ORAIMO);
    expect(page.find((r) => r.key === "handling")?.value).toBe("GH₵36.75");

    const email = breakdownRows({
      itemPriceUsd: 49.99, subtotalUsd: 49.99, taxPercentage: 0.088, taxUsd: 4.4, valueFeePercentage: 0.04, valueFeeUsd: 2,
      flatRateGhs: 110.25, handlingGhs: 36.75, exchangeRate: 12.25, totalGhs: 801.03,
    }).filter((r): r is readonly [string, string] => Array.isArray(r));
    expect(email.find(([label]) => label === "Handling fee")?.[1]).toContain("36.75");
    expect(email.find(([label]) => label.startsWith("Freight"))?.[1]).toContain("73.50");

    const usd = (49.99 + 4.4 + 2) * 12.25;
    expect(Math.round((usd + 73.5 + 36.75) * 100) / 100).toBe(801.03);
  });
});
