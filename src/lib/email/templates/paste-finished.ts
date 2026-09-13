import { emailLayout, heading, paragraph, muted, divider, button } from "./layout";

/**
 * "Your link is priced" / "We couldn't read your link" — the follow-up a
 * customer is promised when a paste takes long enough that the screen tells them
 * to carry on shopping (`describePendingWait`, the 5 s mark).
 *
 * Nothing here is calculated: the store host is the URL's, the destination is a
 * route the server already knows resolves (the priced quote, or the Buy-for-me
 * screen where the row explains itself), and no price is quoted — the quote
 * screen prices under the customer's own rate lock at the moment they open it,
 * and a figure printed here could disagree with it minutes later.
 */
export interface PasteFinishedEmailData {
  /** "amazon.com" — what the customer recognises before a title does. */
  storeHost: string;
  /** The listing's title when the page yielded one. */
  productName: string | null;
  /** Where the button goes: the priced quote, or Buy-for-me. */
  destinationUrl: string;
}

export function pastePricedTemplate(data: PasteFinishedEmailData) {
  const what = data.productName ? `<strong>${data.productName}</strong>` : `your link from ${data.storeHost}`;
  return {
    subject: `Priced: ${data.productName ?? `your link from ${data.storeHost}`}`,
    html: emailLayout(`
      ${heading("Your link is priced")}
      ${paragraph(`We finished reading ${what}. The landed price — item, tax, our fee, freight and today's rate — is ready in GH₵.`)}
      ${divider()}
      ${button(data.destinationUrl, "See the landed price")}
      ${muted(
        "You are getting this because a link you pasted took longer than usual to read and we said we would let you know. Nothing is charged until you approve it.",
      )}
    `),
  };
}

export function pasteUnreadableTemplate(data: PasteFinishedEmailData) {
  return {
    subject: `We couldn't read your link from ${data.storeHost}`,
    html: emailLayout(`
      ${heading("We couldn't read that page")}
      ${paragraph(
        `We tried a few times to read your link from <strong>${data.storeHost}</strong> and could not get a price out of it. Some stores block readers; a second attempt often works, and a buyer can always source it for you by hand.`,
      )}
      ${divider()}
      ${button(data.destinationUrl, "Try again or describe it to a buyer")}
      ${muted("You are getting this because a link you pasted took longer than usual and we said we would let you know how it went.")}
    `),
  };
}
