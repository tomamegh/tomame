import type { CarPriceSource, CarPurchaseTerms } from "../car-orders.types";
import { formatPesewas } from "../format";

/**
 * Turning an agreed figure into words a customer can act on, and the way out to
 * a person when they would rather talk than press.
 *
 * PURE AND FRAMEWORK-FREE, like `../format.ts` — no React, no clock, no fetch.
 * Everything here is a wording decision with a right answer, and two of them
 * are decisions the feature would be dishonest without:
 *
 *   1. THE BUTTON NAMES THE SUM IT IS ABOUT TO CHARGE. A car is GH₵120,000 to
 *      GH₵260,000 and a Ghanaian MoMo wallet cannot carry that in one
 *      transaction, so Paystack takes a DEPOSIT and the rest is settled off the
 *      platform. A button reading "Buy now" that then charges thirty per cent
 *      is a lie about money, and the customer discovers it on Paystack's screen
 *      rather than on ours. `depositButtonLabel` prints the figure instead.
 *
 *   2. AN AGREED FIGURE IS PRIVATE TO THE CUSTOMER IT WAS AGREED WITH. A quote
 *      answered on an `on_request` car, or an accepted offer on a `negotiable`
 *      one, becomes that person's price and nobody else's. The copy says whose
 *      figure it is, because a number appearing where "Price on request" stood
 *      a moment ago needs to explain itself.
 *
 * NO ARITHMETIC HAPPENS HERE. The server hands down all three figures already
 * struck (`getCarPurchaseTerms`); this module compares them and formats them,
 * and that is the whole of its licence with money.
 *
 * British English, as the rest of the product. No em dashes in anything a
 * customer reads.
 */

/** Where the figure this customer pays came from. */
export type CarPurchaseSource = CarPriceSource;

/**
 * The purchase terms as a component receives them.
 *
 * THE SERVICE'S OWN TYPE, ALIASED, NOT A HAND-COPIED SHAPE. `car-orders.types`
 * is deliberately pure (no `server-only`, no Supabase, no `env`) precisely so
 * that a client island can share it with the service that strikes the figures,
 * which means the contract can be depended on directly and a rename on either
 * side fails typecheck rather than drifting. `CarCheckoutStart` in
 * `car-actions.tsx` is mirrored by hand only because a ROUTE's response shape
 * has no such module to import.
 *
 * The alias exists rather than the raw name so the prop reads as a view model
 * at every call site, and so this module is the one place components look.
 */
export type CarPurchaseTermsView = CarPurchaseTerms;

/**
 * Whether the deposit IS the whole price.
 *
 * A comparison, not a calculation. The deposit percentage is admin-controlled
 * and a cheap enough car could be taken in one go; when that happens the row
 * must stop promising a balance that does not exist, and the button must stop
 * calling the payment a deposit.
 */
export function isPaidInFull(terms: CarPurchaseTermsView): boolean {
  return terms.balancePesewas <= 0;
}

/**
 * What the primary button says.
 *
 * "Pay GH₵54,000 deposit", never "Buy now". The figure is the point: it is the
 * only thing standing between the customer and a Paystack screen showing a
 * number they were not told about.
 */
export function depositButtonLabel(terms: CarPurchaseTermsView): string {
  const amount = formatPesewas(terms.depositPesewas);
  return isPaidInFull(terms) ? `Pay ${amount} now` : `Pay ${amount} deposit`;
}

/** Every string the terms panel prints, chosen by where the figure came from. */
export interface CarPurchaseCopy {
  /** The panel's own heading. Says whose price this is. */
  heading: string;
  /** True when the figure belongs to this customer alone and should say so. */
  isPrivate: boolean;
  /** The row labels, top to bottom. */
  totalLabel: string;
  depositLabel: string;
  balanceLabel: string;
  /** The one honest line about how the rest of the money moves. */
  settlement: string;
}

const SETTLEMENT_DEPOSIT =
  "The deposit goes through Paystack now and reserves the car for you. The balance is settled by bank transfer or in person before you collect it, not in the app.";

const SETTLEMENT_FULL =
  "This pays for the car in full through Paystack. There is nothing left to settle afterwards.";

export function purchaseCopy(terms: CarPurchaseTermsView): CarPurchaseCopy {
  const full = isPaidInFull(terms);

  const heading =
    terms.source === "quote"
      ? "The price we quoted you"
      : terms.source === "accepted_offer"
        ? "The price we agreed with you"
        : full
          ? "Buy this car"
          : "Reserve this car with a deposit";

  return {
    heading,
    // A listing price is on the page for everyone to read. The other two are
    // this customer's alone and must not be mistaken for a public figure.
    isPrivate: terms.source !== "listing",
    totalLabel: "Full price",
    depositLabel: full ? "You pay today" : "Deposit today",
    balanceLabel: "Balance to settle",
    settlement: full ? SETTLEMENT_FULL : SETTLEMENT_DEPOSIT,
  };
}

/**
 * The three figures as one line, for the phone bar where a panel will not fit.
 *
 * All three, always, in the same order the panel uses. Dropping the total to
 * save a line is exactly the shortcut that leaves a customer pressing a deposit
 * button without knowing what it is a deposit on.
 */
export function termsSummaryLine(terms: CarPurchaseTermsView): string {
  const total = formatPesewas(terms.payablePesewas);
  if (isPaidInFull(terms)) return `${total} in full`;
  return `${formatPesewas(terms.depositPesewas)} now, ${formatPesewas(
    terms.balancePesewas,
  )} later, ${total} in all`;
}

// ── WhatsApp handoff ────────────────────────────────────────────────────────

/**
 * What lands in the customer's WhatsApp compose box.
 *
 * THE LINK IS IN THE MESSAGE, not just the car's name. A message arriving as
 * "I am interested in the 2019 Toyota Highlander XLE" costs whoever answers it
 * a search through the forecourt; one carrying the URL is a car they can open.
 * Both are here because the name is what the CUSTOMER recognises in their own
 * sent messages and the URL is what WE need.
 */
export function carWhatsappMessage(title: string, carUrl: string): string {
  return `Hi Tomame, I am interested in the ${title}. ${carUrl}`;
}

/**
 * A `wa.me` link with the car prefilled, or null when there is no number.
 *
 * `base` comes from `whatsappHref(site_settings.whatsapp_number)` in
 * `@/components/layout/marketing/links` — THE SAME RESOLUTION `AskBuyerCard`
 * uses, deliberately reused rather than reimplemented, because a second copy of
 * "0XXXXXXXXX means +233" is a second thing to get wrong. Null in, null out:
 * the caller falls back to `/contact` rather than rendering a dead `wa.me/`,
 * which is the precedent that card set.
 */
export function carWhatsappHref(base: string | null, message: string): string | null {
  if (!base) return null;
  const separator = base.includes("?") ? "&" : "?";
  return `${base}${separator}text=${encodeURIComponent(message)}`;
}
