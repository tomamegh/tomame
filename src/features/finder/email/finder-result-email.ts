import {
  appUrl,
  button,
  callout,
  divider,
  EMAIL_COLORS,
  escapeHtml,
  eyebrow,
  heading,
  infoRow,
  link,
  infoTable,
  muted,
  paragraph,
  renderEmail,
  summaryCard,
  type RenderedEmail,
} from "@/lib/email/templates/layout";

import { formatGhs } from "../format";
import type { FinderCandidateState } from "../types";

/**
 * "Your best price is ready": the email a finder run promises the customer
 * when it tells them they can close the page.
 *
 * Figures are the run's own (the calculator's totals and rows, as streamed);
 * nothing is recomputed here. The buttons go into the normal quote flow,
 * which prices again under the customer's own rate lock before they pay, so
 * the email says that rather than promising the number holds forever.
 */
export interface FinderResultEmailData {
  query: string;
  best: FinderCandidateState;
  alternatives: FinderCandidateState[];
  /** The run page, where every option and the narration stay. */
  runUrl?: string;
}

/** The quote flow for one listing: `/app/orders/new?url=` prices it and opens it. */
export function finderQuoteUrl(productUrl: string): string {
  return `${appUrl()}/app/orders/new?url=${encodeURIComponent(productUrl)}`;
}

export function finderResultTemplate({ query, best, alternatives, runUrl }: FinderResultEmailData): RenderedEmail {
  const q = escapeHtml(query);
  const bestQuote = best.quote;
  const bestTotal = bestQuote ? formatGhs(bestQuote.totalGhs) : null;

  const breakdown = bestQuote
    ? summaryCard({
        label: `Best price · ${escapeHtml(best.store.name)} · ${best.condition}`,
        title: escapeHtml(best.title),
        rows: bestQuote.rows.map((r) => [escapeHtml(r.label), formatGhs(r.amountGhs)] as const),
        total: ["Landed in Accra", formatGhs(bestQuote.totalGhs)],
      })
    : "";

  const others = alternatives.filter((c) => c.quote && c.status === "priced");
  const othersBlock =
    others.length > 0
      ? `${divider()}
      <p class="tm-ink" style="margin:0 0 4px; font-size:16px; line-height:24px; font-weight:700; color:${EMAIL_COLORS.ink};">Other options</p>
      ${infoTable(
        others
          .map((c) =>
            infoRow(
              `${escapeHtml(c.title)}<br /><span class="tm-text3" style="font-size:12px; color:${EMAIL_COLORS.text3};">${escapeHtml(c.store.name)} · ${c.condition}</span>`,
              `<a href="${escapeHtml(finderQuoteUrl(c.productUrl))}" class="tm-coral-text" style="color:${EMAIL_COLORS.coralStrong}; text-decoration:none;">${formatGhs(c.quote!.totalGhs)}</a>`,
            ),
          )
          .join(""),
      )}`
      : "";

  return renderEmail(bestTotal ? `Best price for "${query}": ${bestTotal} landed` : `Your price finder results for "${query}"`, {
    preheader: bestTotal
      ? `${best.store.name}, new, ${bestTotal} landed in Accra with freight, customs and our fee included.`
      : "We found matches and are confirming their prices with the stores.",
    body: `
      ${eyebrow("Price finder", "green")}
      ${heading(bestTotal ? "Your best price is ready" : "We found matches for you")}
      ${paragraph(
        bestTotal
          ? `You asked us to find <strong>${q}</strong>. Here is the lowest landed price we found, with everything to Accra included.`
          : `You asked us to find <strong>${q}</strong>. We found matches and are confirming their prices with the stores. The total appears as soon as a price is confirmed.`,
      )}
      ${breakdown}
      ${best.why ? callout(`<strong>Why this one:</strong> ${escapeHtml(best.why)}`, "neutral") : ""}
      ${button(finderQuoteUrl(best.productUrl), "Add it to your bag")}
      ${muted("We check the price with the store again before you pay, and nothing is charged until you approve it.")}
      ${othersBlock}
      ${runUrl ? `${divider()}${paragraph(link(runUrl, "See everything we found"))}` : ""}
    `,
    reason: `You are getting this because you asked Tomame's price finder to look for &ldquo;${q}&rdquo; and we said we would email you the result.`,
  });
}

export interface FinderNoMatchEmailData {
  query: string;
  message: string;
  runUrl: string;
  /** wa.me link to a buyer with the request typed in; null when no number is set. */
  buyerHref: string | null;
}

/** Nothing we could stand behind: say so, and hand the request to a person. */
export function finderNoMatchTemplate({ query, message, runUrl, buyerHref }: FinderNoMatchEmailData): RenderedEmail {
  const q = escapeHtml(query);
  return renderEmail(`We couldn't find "${query}" ourselves`, {
    preheader: "A Tomame buyer can look for it by hand and reply with a landed price in cedis.",
    body: `
      ${eyebrow("Price finder", "coral")}
      ${heading("We couldn't find this one")}
      ${paragraph(`You asked us to find <strong>${q}</strong>. ${escapeHtml(message)}`)}
      ${paragraph("A Tomame buyer can search by hand, including stores we do not search automatically, and reply with a landed price in cedis.")}
      ${buyerHref ? button(buyerHref, "Ask a buyer on WhatsApp") : button(runUrl, "See your search")}
      ${muted(`Your search stays here: ${link(runUrl, "open it")}.`)}
    `,
    reason: `You are getting this because you asked Tomame's price finder to look for &ldquo;${q}&rdquo; and we said we would email you the result.`,
  });
}
