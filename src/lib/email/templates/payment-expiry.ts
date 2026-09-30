import { renderEmail, eyebrow, heading, paragraph, muted, button, summaryCard, callout, escapeHtml } from "./layout";

/**
 * The two mails the payment reconciliation job sends (migration 059).
 *
 * Both name what happened and what the customer can do next. An order that
 * quietly vanishes is worse than one that says why, and a payment that was
 * released without a word leaves the customer wondering whether they were
 * charged. Amounts arrive in GHS already divided from pesewas by the caller.
 */
export interface PaymentExpiredEmailData {
  amountGhs: number;
  reference: string;
  /** Where "Pay again" leads: the bag for a group, the order for a single item. */
  retryUrl: string;
  /** How long the payment was held open before being released, in minutes. */
  expiryMinutes: number;
}

export function paymentExpiredTemplate(data: PaymentExpiredEmailData) {
  const amount = `GH₵&nbsp;${data.amountGhs.toFixed(2)}`;
  return renderEmail("Your Tomame payment did not go through", {
    preheader: `You have not been charged. Your items are still waiting at the same price.`,
    body: `
      ${eyebrow("Payment not completed", "amber")}
      ${heading("Your payment didn't go through")}
      ${paragraph(
        `We opened a payment of <strong>${amount}</strong> for you and Paystack did not report it as completed within ${data.expiryMinutes} minutes, so we have released it.`,
      )}
      ${callout("<strong>You have not been charged.</strong> Your items are still waiting for you at the same price.", "green")}
      ${summaryCard({
        label: "Payment",
        rows: [["Reference", escapeHtml(data.reference)]],
        total: ["Amount", amount],
      })}
      ${button(data.retryUrl, "Pay again")}
      ${muted("If money did leave your account, write to us with the reference above and we will sort it out.")}
    `,
    reason: "This is a transactional message about a payment you started on Tomame.",
  });
}

export interface UnpaidOrderCancelledEmailData {
  /** "your bag of 3 items" or the single product's name. */
  subject: string;
  amountGhs: number;
  ttlHours: number;
  /** Where to start again. */
  shopUrl: string;
}

export function unpaidOrderCancelledTemplate(data: UnpaidOrderCancelledEmailData) {
  const amount = `GH₵&nbsp;${data.amountGhs.toFixed(2)}`;
  return renderEmail("We closed an unpaid Tomame order", {
    preheader: "Nothing has been charged. Paste the link again for today's price.",
    body: `
      ${eyebrow("Order closed", "neutral")}
      ${heading("We closed an unpaid order")}
      ${paragraph(
        `<strong>${escapeHtml(data.subject)}</strong> was waiting for a payment of ${amount} for more than ${data.ttlHours} hours, so we have closed it. Nothing has been charged.`,
      )}
      ${paragraph(
        "Store prices and the exchange rate move, so we do not hold a quote open forever. Paste the link again and you will see today's landed price.",
      )}
      ${button(data.shopUrl, "Get a fresh price")}
    `,
    reason: "This is a transactional message about an order you placed on Tomame.",
  });
}
