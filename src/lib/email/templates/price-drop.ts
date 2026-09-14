import {
  emailLayout,
  heading,
  paragraph,
  muted,
  divider,
  button,
  infoRow,
  infoTable,
} from "./layout";

/**
 * "The price dropped" alert for a price watch (migration 052).
 *
 * CURRENCY DISCIPLINE. The headline movement is quoted in USD and only in USD.
 * A GH₵ figure carries the store price AND the exchange rate, so a GH₵ "drop"
 * can be nothing but the cedi strengthening — claiming that as a price cut is a
 * lie the customer discovers at checkout. GH₵ therefore appears exactly once,
 * as the landed total the customer would pay today, next to the rate that
 * produced it. This mirrors the rule in `features/watches/types`.
 *
 * Every number here is passed in from rows the server computed: the previous
 * price is what the LAST alert quoted (`price_watches.notified_price_usd`) or
 * the baseline if this is the first, and the current price and total come from
 * the observation the job just appended.
 */
export interface PriceDropEmailData {
  productName: string;
  /** The store link, so the customer can check the drop themselves. */
  productUrl: string;
  /** Deep link into the app's price-watch screen. */
  watchUrl: string;
  /** The price the customer was last told about — the reference this drop beat. */
  previousPriceUsd: number;
  /** The reading that triggered this alert. */
  currentPriceUsd: number;
  /** Fraction of the previous price, e.g. 0.12 for a 12% fall. */
  dropPct: number;
  /** Landed GH₵ total at `exchangeRate`, quantity 1. */
  currentTotalGhs: number;
  exchangeRate: number;
}

export function priceDropTemplate(data: PriceDropEmailData) {
  const savedUsd = data.previousPriceUsd - data.currentPriceUsd;
  const pct = (data.dropPct * 100).toFixed(0);

  return {
    subject: `Price drop: ${data.productName} is down ${pct}%`,
    html: emailLayout(`
      ${heading("The price dropped")}
      ${paragraph(
        `<strong>${data.productName}</strong> is now $${data.currentPriceUsd.toFixed(2)}, down $${savedUsd.toFixed(2)} (${pct}%) from the $${data.previousPriceUsd.toFixed(2)} we last told you about.`,
      )}
      ${divider()}
      ${infoTable(`
        ${infoRow("Item", data.productName)}
        ${infoRow("Was (store price)", `$${data.previousPriceUsd.toFixed(2)}`)}
        ${infoRow("Now (store price)", `$${data.currentPriceUsd.toFixed(2)}`)}
        ${infoRow("Landed total", `GH₵ ${data.currentTotalGhs.toFixed(2)}`)}
        ${infoRow("Rate", `1 USD = ${data.exchangeRate} GHS`)}
      `)}
      ${divider()}
      ${button(data.watchUrl, "Get it at this price")}
      ${paragraph(
        `The landed total above is what you would pay today for one, delivered: item price, tax, our fee and freight at the rate shown. Store prices move without warning, so it is only good while the store's is.`,
      )}
      ${muted(
        `You are getting this because you asked us to watch <a href="${data.productUrl}" style="color:#a1a1aa;">this product</a>. We only write when the price falls again. A price that simply stays low will not email you twice. Stop watching it any time from your Tomame account.`,
      )}
    `),
  };
}
