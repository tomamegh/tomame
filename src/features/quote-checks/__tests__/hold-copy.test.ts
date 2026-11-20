import { describe, expect, it } from "vitest";

import type { PayHold } from "@/features/extraction/pay-gate";
import { PRICE_CHECKING_MESSAGE, PRICE_CONFIRMING_MESSAGE } from "@/features/extraction/price-confidence";
import { STOCK_CHECK_MESSAGE, STOCK_UNAVAILABLE_MESSAGE } from "@/features/extraction/stock-signals";
import type { StockCheckView } from "@/features/extraction/types";
import { HOLD_PILL, holdCopy, stockConfirmedLine, stockReasons } from "../hold-copy";

const stock = (over: Partial<StockCheckView> = {}): StockCheckView => ({
  reasons: ["Renewed item", "Only 2 left"],
  status: "needed",
  valid_until: null,
  substitute_url: null,
  whatsapp_url: "https://wa.me/233200000000?text=hi",
  reference: "Q-1A2B3C4D",
  ...over,
});

describe("holdCopy", () => {
  it("keeps the gate's own message as the title and says what happens next", () => {
    const auto: PayHold = { kind: "price_check", message: PRICE_CONFIRMING_MESSAGE, needs_staff: false };
    const staff: PayHold = { ...auto, needs_staff: true };
    expect(holdCopy(auto).title).toBe(PRICE_CONFIRMING_MESSAGE);
    expect(holdCopy(auto).detail).toMatch(/under a minute/);
    expect(holdCopy(staff).detail).toMatch(/Our team is checking/);
    expect(holdCopy(staff).pill).toBe("Confirming price");
  });

  it("an automatic re-read says it is checking with the store, not that our team is", () => {
    const hold: PayHold = { kind: "price_check", message: PRICE_CHECKING_MESSAGE, needs_staff: false };
    expect(`${holdCopy(hold).title}. ${holdCopy(hold).detail}`).toMatch(/^Checking this price with the store\. This usually takes under a minute\./);
    expect(holdCopy(hold).detail).not.toMatch(/Our team/);
    expect(holdCopy(hold).pill).toBe("Checking price");
  });

  it("tells a stock-check customer they can confirm on WhatsApp until a check is requested", () => {
    const hold: PayHold = { kind: "stock_check", message: STOCK_CHECK_MESSAGE, needs_staff: true };
    expect(holdCopy(hold, stock()).detail).toMatch(/WhatsApp/);
    expect(holdCopy(hold, stock({ status: "requested" })).detail).toMatch(/checking with the store/);
    expect(holdCopy(hold).pill).toBe(HOLD_PILL.stock_check);
  });

  it("points an unavailable item at the alternative when staff offered one", () => {
    const hold: PayHold = { kind: "unavailable", message: STOCK_UNAVAILABLE_MESSAGE, needs_staff: false, substitute_url: "https://example.com/x" };
    expect(holdCopy(hold).tone).toBe("warning");
    expect(holdCopy(hold).detail).toMatch(/alternative/);
    expect(holdCopy({ ...hold, substitute_url: null }).detail).toBe("Remove it from your bag to pay for the rest.");
  });

  it("uses no exclamation marks anywhere", () => {
    const holds: PayHold[] = [
      { kind: "freight_check", message: "Checking", needs_staff: false },
      { kind: "price_check", message: PRICE_CONFIRMING_MESSAGE, needs_staff: true },
      { kind: "stock_check", message: STOCK_CHECK_MESSAGE, needs_staff: true },
      { kind: "unavailable", message: STOCK_UNAVAILABLE_MESSAGE, needs_staff: false },
    ];
    for (const hold of holds) expect(`${holdCopy(hold).title} ${holdCopy(hold).detail}`).not.toContain("!");
  });
});

describe("stock lines", () => {
  it("joins the store facts that triggered the check", () => {
    expect(stockReasons(stock())).toBe("Renewed item · Only 2 left");
    expect(stockReasons(null)).toBeNull();
  });

  it("says a confirmation only when staff confirmed", () => {
    expect(stockConfirmedLine(stock())).toBeNull();
    expect(stockConfirmedLine(stock({ status: "confirmed" }))).toBe("Stock and condition confirmed");
    expect(stockConfirmedLine(stock({ status: "confirmed", valid_until: "2026-11-21T16:30:00Z" }))).toMatch(/^Stock and condition confirmed until /);
  });
});
