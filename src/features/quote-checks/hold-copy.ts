import type { PayHold, PayHoldKind } from "@/features/extraction/pay-gate";
import type { StockCheckView } from "@/features/extraction/types";
import type { StatusTone } from "@/components/ui/inline-status";

/**
 * What the customer reads about a pay hold (pay-gate.ts), on the quote, the
 * bag and the batch list. Pure, so every screen says the same thing and the
 * wording is a test away from changing.
 *
 * The title is always the gate's own message (PRICE_CONFIRMING_MESSAGE,
 * STOCK_CHECK_MESSAGE, STOCK_UNAVAILABLE_MESSAGE); this file only adds what
 * happens next.
 */

export interface HoldCopy {
  tone: StatusTone;
  title: string;
  detail: string;
  /** Two or three words for a row's status pill. */
  pill: string;
}

/** Two or three words per hold kind, for status pills. */
export const HOLD_PILL: Record<PayHoldKind, string> = {
  freight_check: "Checking freight",
  price_check: "Confirming price",
  stock_check: "Needs a stock check",
  unavailable: "No longer available",
};

export function holdCopy(hold: PayHold, stock: StockCheckView | null = null): HoldCopy {
  switch (hold.kind) {
    case "freight_check":
      return {
        tone: "progress",
        title: hold.message,
        detail: "We're checking the shipping weight so the freight is right. It usually takes a few seconds.",
        pill: HOLD_PILL.freight_check,
      };
    case "price_check":
      return {
        tone: "progress",
        title: hold.message,
        detail: hold.needs_staff
          ? "Our team is checking the price on the store. You can add it to your bag now. Pay opens as soon as it's confirmed."
          : "We're reading the store's price again to make sure it's right. This usually takes under a minute. You can add it to your bag meanwhile.",
        pill: HOLD_PILL.price_check,
      };
    case "stock_check": {
      const requested = stock?.status === "requested";
      return {
        tone: "neutral",
        title: hold.message,
        detail: requested
          ? "Our team is checking with the store. You can add it to your bag now. Pay opens once it's confirmed."
          : "Our team checks with the store first, usually within a few hours. You can add it to your bag now, or confirm with us on WhatsApp.",
        pill: HOLD_PILL.stock_check,
      };
    }
    case "unavailable":
      return {
        tone: "warning",
        title: hold.message,
        detail: hold.substitute_url
          ? "We found an alternative you can look at. Remove this one from your bag to pay for the rest."
          : "Remove it from your bag to pay for the rest.",
        pill: HOLD_PILL.unavailable,
      };
  }
}

/** "Renewed item · Only 2 left" — the store facts that triggered a stock check. */
export function stockReasons(stock: StockCheckView | null): string | null {
  if (!stock || stock.reasons.length === 0) return null;
  return stock.reasons.join(" · ");
}

/** "Confirmed until 4:30 pm" for a stock check staff confirmed. Null when not confirmed. */
export function stockConfirmedLine(stock: StockCheckView | null, locale = "en-GB"): string | null {
  if (!stock || stock.status !== "confirmed") return null;
  if (!stock.valid_until) return "Stock and condition confirmed";
  const until = new Date(stock.valid_until);
  if (Number.isNaN(until.getTime())) return "Stock and condition confirmed";
  const time = new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit", weekday: "short" }).format(until);
  return `Stock and condition confirmed until ${time}`;
}
