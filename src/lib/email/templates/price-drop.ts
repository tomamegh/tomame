import { renderEmail, eyebrow, heading, paragraph, muted, button, summaryCard, link, escapeHtml } from "./layout";

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
  const name = escapeHtml(data.productName);

  return renderEmail(`Price drop: ${data.productName} is down ${pct}%`, {
    preheader: `Now $${data.currentPriceUsd.toFixed(2)} at the store, down $${savedUsd.toFixed(2)}. Landed in Ghana for GH₵ ${data.currentTotalGhs.toFixed(2)}.`,
    body: `
      ${eyebrow(`Down ${pct}%`, "green")}
      ${heading("The price dropped")}
      ${paragraph(
        `<strong>${name}</strong> is now $${data.currentPriceUsd.toFixed(2)}, down $${savedUsd.toFixed(2)} (${pct}%) from the $${data.previousPriceUsd.toFixed(2)} we last told you about.`,
      )}
      ${summaryCard({
        label: "Price watch",
        title: name,
        rows: [
          ["Was (store price)", `<span style="text-decoration:line-through;">$${data.previousPriceUsd.toFixed(2)}</span>`],
          ["Now (store price)", `<span class="tm-green-text" style="color:#15703f;">$${data.currentPriceUsd.toFixed(2)}</span>`],
          ["Rate", `1 USD = ${data.exchangeRate} GHS`],
        ],
        total: ["Landed total", `GH₵&nbsp;${data.currentTotalGhs.toFixed(2)}`],
      })}
      ${button(data.watchUrl, "Get it at this price")}
      ${muted(
        "The landed total is what you would pay today for one, delivered: item price, tax, our fee and freight at the rate shown. Store prices move without warning, so it is only good while the store's is.",
      )}
    `,
    reason: `You are getting this because you asked us to watch ${link(data.productUrl, "this product")}. We only write when the price falls again, so a price that simply stays low will not email you twice. Stop watching it any time from your Tomame account.`,
  });
}
