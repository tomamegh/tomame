import { renderEmail, eyebrow, heading, paragraph, muted, button, quote, escapeHtml } from "./layout";

/**
 * The answer to "ask us to source this" (065).
 *
 * The customer was told a person would price an item the engine could not, and
 * their bag has been holding it, unpayable, ever since. This is the message that
 * promise was made against, which is why it is an email and not only a bell: the
 * whole point is to reach somebody who has closed the tab.
 *
 * NO PRICE IS QUOTED. The bag re-prices under the customer's own rate lock the
 * moment they open it, and a cedi figure printed here could disagree with the
 * one on the pay button minutes later. The buyer's note is quoted instead, in
 * their own words, because that is the part a machine could not have written.
 */
export interface SourcingAnsweredEmailData {
  /** The listing's title, or the store host when the page yielded none. */
  productName: string;
  /** What the buyer wrote for the customer, if anything. */
  note: string | null;
  /** Where the button goes: the bag, where the line now prices. */
  destinationUrl: string;
}

const SOURCING_REASON = "You are getting this because you asked us to source an item we could not price automatically.";

export function sourcingAvailableTemplate(data: SourcingAnsweredEmailData) {
  const name = escapeHtml(data.productName);
  return renderEmail(`We can get it: ${data.productName}`, {
    preheader: "One of our buyers found it. It is priced in your bag now, all in.",
    body: `
      ${eyebrow("Good news", "green")}
      ${heading("We can get this one")}
      ${paragraph(
        `One of our buyers looked up <strong>${name}</strong> and confirmed we can buy it for you. It is priced in your bag now, all in: item, tax, our fee, freight and today's rate.`,
      )}
      ${data.note ? quote(escapeHtml(data.note), "Your Tomame buyer") : ""}
      ${button(data.destinationUrl, "See the price in your bag")}
      ${muted("Nothing is charged until you approve it.")}
    `,
    reason: SOURCING_REASON,
  });
}

export function sourcingUnavailableTemplate(data: SourcingAnsweredEmailData) {
  const name = escapeHtml(data.productName);
  return renderEmail(`We could not get: ${data.productName}`, {
    preheader: "You have not been charged. The item is still in your bag for you to remove.",
    body: `
      ${eyebrow("Sourcing update", "neutral")}
      ${heading("We couldn't get this one")}
      ${paragraph(
        `Our buyer looked into <strong>${name}</strong> and we cannot buy it for you. You have not been charged anything, and the item is still in your bag so you can take it out when you are ready.`,
      )}
      ${data.note ? quote(escapeHtml(data.note), "Your Tomame buyer") : ""}
      ${button(data.destinationUrl, "Open your bag")}
      ${muted("Found it on another store? Paste that link and we will price it there.")}
    `,
    reason: SOURCING_REASON,
  });
}
