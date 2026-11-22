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
  return renderEmail(`We'll price your ${data.storeHost} link by hand`, {
    preheader: "A buyer is quoting it for you. The reply comes to your chat within a few hours.",
    body: `
      ${eyebrow("Link update", "amber")}
      ${heading("A buyer is pricing this one by hand")}
      ${paragraph(
        `We couldn't read a price from your link on <strong>${host}</strong> automatically. Some stores block readers.`,
      )}
      ${paragraph("One of our buyers is quoting it for you now. The quote comes to your chat within a few hours, and nothing is charged until you pay it.")}
      ${button(data.destinationUrl, "Open your chat")}
    `,
    reason: "You are getting this because a link you pasted took longer than usual and we said we would let you know how it went.",
  });
}
