import { renderEmail, eyebrow, heading, paragraph, muted, button, summaryCard, callout, escapeHtml } from "./layout";

/**
 * The mail an unpaid order or bag gets when an admin pricing change moved its
 * total (order-reprice-notify.service.ts). It is sent once the total has
 * settled, and it states both figures: a customer who saw GH₵ 880 at checkout
 * and is asked for GH₵ 930 at Paystack must have been told why before they get
 * there. Amounts arrive in GHS.
 */
export interface OrderRepricedEmailData {
  /** Mid-sentence: "your bag of 3 items" or the single product's name. */
  what: string;
  fromGhs: number;
  toGhs: number;
  /** The bag for a group, the order page for a single item. */
  payUrl: string;
}

const ghs = (n: number) => `GH₵&nbsp;${n.toLocaleString("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function orderRepricedTemplate(data: OrderRepricedEmailData) {
  const down = data.toGhs < data.fromGhs;
  const difference = ghs(Math.abs(data.toGhs - data.fromGhs));
  const what = escapeHtml(data.what);
  return renderEmail(down ? "Good news: your Tomame total went down" : "Your Tomame total has changed", {
    preheader: down
      ? `Your unpaid order now costs ${difference} less. Nothing has been charged.`
      : `We updated our shipping rates before you paid. Nothing has been charged.`,
    body: `
      ${eyebrow(down ? "Price lowered" : "Price updated", down ? "green" : "amber")}
      ${heading(down ? "Your total went down" : "Your total has changed")}
      ${paragraph(
        `We updated our shipping and service rates, and <strong>${what}</strong> had not been paid yet, so its total ${down ? "went down" : "went up"} by <strong>${difference}</strong>. The item price and the exchange rate you were quoted have not changed.`,
      )}
      ${summaryCard({
        label: "Your total",
        rows: [["Before", ghs(data.fromGhs)]],
        total: ["Now", ghs(data.toGhs)],
      })}
      ${callout("<strong>Nothing has been charged.</strong> The new total is what you will pay when you check out.", "green")}
      ${button(data.payUrl, down ? "Pay now" : "Review and pay")}
      ${muted("If you would rather not go ahead at the new price, you don't need to do anything: an unpaid order closes on its own.")}
    `,
    reason: "This is a transactional message about an order you placed on Tomame.",
  });
}
