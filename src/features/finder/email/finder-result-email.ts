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

export interface FinderTurnItem {
  /** The item as the assistant understood it: "iPhone 17 Pro 256GB unlocked". */
  product: string;
  /** Null when nothing could be stood behind for this item. */
  best: FinderCandidateState | null;
  alternatives: FinderCandidateState[];
  /** Why nothing was found, when `best` is null. */
  nothingMessage: string | null;
}

/** "iPhone 17 Pro and Desktop monitor"; three or more end "and 1 more". */
export function itemsPhrase(products: readonly string[]): string {
  if (products.length <= 1) return products[0] ?? "your items";
  if (products.length === 2) return `${products[0]} and ${products[1]}`;
  return `${products[0]}, ${products[1]} and ${products.length - 2} more`;
}

/**
 * One email for one chat turn (107): every item the customer asked for in one
 * message, each with its best landed price or an honest "not found". The
 * figures are each run's own; nothing is recomputed here.
 */
export function finderTurnTemplate({ items, chatUrl, buyerHref }: { items: FinderTurnItem[]; chatUrl: string; buyerHref: string | null }): RenderedEmail {
  const found = items.filter((i) => i.best?.quote);
  const names = items.map((i) => i.product);
  const single = items.length === 1 ? items[0]! : null;
  const subject = single
    ? single.best?.quote
      ? `Best price for ${single.product}: ${formatGhs(single.best.quote.totalGhs)} landed`
      : `We couldn't find ${single.product} ourselves`
    : found.length > 0
      ? `Your prices for ${itemsPhrase(names)}`
      : `We couldn't find ${itemsPhrase(names)} ourselves`;

  const sections = items
    .map((item) => {
      const title = `<p class="tm-ink" style="margin:0 0 8px; font-size:18px; line-height:26px; font-weight:700; color:${EMAIL_COLORS.ink};">${escapeHtml(item.product)}</p>`;
      const best = item.best;
      if (!best?.quote) {
        return `${title}${paragraph(escapeHtml(item.nothingMessage ?? "We found matches and are still confirming their prices with the stores."))}`;
      }
      const others = item.alternatives.filter((c) => c.quote && c.status === "priced").slice(0, 2);
      return `${title}
        ${summaryCard({
          label: `Best price · ${escapeHtml(best.store.name)} · ${best.condition}`,
          title: escapeHtml(best.title),
          rows: best.quote.rows.map((r) => [escapeHtml(r.label), formatGhs(r.amountGhs)] as const),
          total: ["Landed in Accra", formatGhs(best.quote.totalGhs)],
        })}
        ${button(finderQuoteUrl(best.productUrl), "Add it to your bag")}
        ${
          others.length
            ? infoTable(
                others
                  .map((c) =>
                    infoRow(
                      `${escapeHtml(c.title)}<br /><span class="tm-text3" style="font-size:12px; color:${EMAIL_COLORS.text3};">${escapeHtml(c.store.name)} · ${c.condition}</span>`,
                      `<a href="${escapeHtml(finderQuoteUrl(c.productUrl))}" class="tm-coral-text" style="color:${EMAIL_COLORS.coralStrong}; text-decoration:none;">${formatGhs(c.quote!.totalGhs)}</a>`,
                    ),
                  )
                  .join(""),
              )
            : ""
        }`;
    })
    .join(divider());

  const missing = items.some((i) => !i.best?.quote);
  const phrase = escapeHtml(itemsPhrase(names));
  return renderEmail(subject, {
    preheader:
      found.length > 0
        ? `${found.length === items.length ? "Every" : `${found.length} of ${items.length}`} item${items.length === 1 ? "" : "s"} priced, landed in Accra with freight, customs and our fee included.`
        : "A Tomame buyer can look for it by hand and reply with a landed price in cedis.",
    body: `
      ${eyebrow("Shopping assistant", found.length ? "green" : "coral")}
      ${heading(items.length === 1 ? (found.length ? "Your best price is ready" : "We couldn't find this one") : found.length ? "Your prices are ready" : "We couldn't find these")}
      ${paragraph(`You asked us to find <strong>${phrase}</strong>. ${found.length ? "Here is the lowest landed price we found for each, with everything to Accra included." : ""}`)}
      ${sections}
      ${muted("We check each price with the store again before you pay, and nothing is charged until you approve it.")}
      ${missing && buyerHref ? `${divider()}${paragraph("A Tomame buyer can search by hand for anything we could not find, including stores we do not search automatically.")}${button(buyerHref, "Ask a buyer on WhatsApp")}` : ""}
      ${divider()}${paragraph(link(chatUrl, "Open the conversation"))}
    `,
    reason: `You are getting this because you asked Tomame's shopping assistant to find ${phrase} and we said we would email you the result.`,
  });
}
