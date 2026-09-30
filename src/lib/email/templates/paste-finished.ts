import { renderEmail, eyebrow, heading, paragraph, muted, button, summaryCard, escapeHtml } from "./layout";

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
  const host = escapeHtml(data.storeHost);
  return renderEmail(`Priced: ${data.productName ?? `your link from ${data.storeHost}`}`, {
    preheader: "Your landed price in GH₵ is ready: item, tax, our fee, freight and today's rate.",
    body: `
      ${eyebrow("Price ready", "green")}
      ${heading("Your link is priced")}
      ${paragraph(
        data.productName
          ? `We finished reading <strong>${escapeHtml(data.productName)}</strong>. Your landed price is ready in GH₵.`
          : `We finished reading your link from <strong>${host}</strong>. Your landed price is ready in GH₵.`,
      )}
      ${summaryCard({
        label: "What you pasted",
        title: data.productName ? escapeHtml(data.productName) : undefined,
        rows: [
          ["Store", host],
          ["Landed price", "Item, tax, our fee, freight and today's rate"],
        ],
      })}
      ${button(data.destinationUrl, "See the landed price")}
      ${muted("Nothing is charged until you approve it.")}
    `,
    reason: "You are getting this because a link you pasted took longer than usual to read and we said we would let you know.",
  });
}

export function pasteUnreadableTemplate(data: PasteFinishedEmailData) {
  const host = escapeHtml(data.storeHost);
  return renderEmail(`We couldn't read your link from ${data.storeHost}`, {
    preheader: "A second try often works, and a buyer can always find it for you by hand.",
    body: `
      ${eyebrow("Link update", "amber")}
      ${heading("We couldn't read that page")}
      ${paragraph(
        `We tried a few times to read your link from <strong>${host}</strong> and could not get a price out of it. Some stores block readers.`,
      )}
      ${paragraph("A second try often works. If it does not, describe the item and one of our buyers will source it for you by hand.")}
      ${button(data.destinationUrl, "Try again or ask a buyer")}
    `,
    reason: "You are getting this because a link you pasted took longer than usual and we said we would let you know how it went.",
  });
}
