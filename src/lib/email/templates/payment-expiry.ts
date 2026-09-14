import { emailLayout, heading, paragraph, muted, divider, button, infoRow, infoTable } from "./layout";

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
  return {
    subject: "Your Tomame payment did not go through",
    html: emailLayout(`
      ${heading("Your payment did not go through")}
      ${paragraph(
        `We opened a payment of <strong>GH₵ ${data.amountGhs.toFixed(2)}</strong> for you and Paystack did not report it as completed within ${data.expiryMinutes} minutes, so we have released it. You have not been charged.`,
      )}
      ${divider()}
      ${infoTable(`
        ${infoRow("Amount", `GH₵ ${data.amountGhs.toFixed(2)}`)}
        ${infoRow("Reference", data.reference)}
      `)}
      ${divider()}
      ${button(data.retryUrl, "Pay again")}
      ${paragraph(
        `Your items are still waiting for you at the same price. If money did leave your account, reply to this email with the reference above and we will sort it out.`,
      )}
      ${muted(`This is a transactional message about a payment you started on Tomame.`)}
    `),
  };
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
  return {
    subject: "We closed an unpaid Tomame order",
    html: emailLayout(`
      ${heading("We closed an unpaid order")}
      ${paragraph(
        `<strong>${data.subject}</strong> was waiting for a payment of GH₵ ${data.amountGhs.toFixed(2)} for more than ${data.ttlHours} hours, so we have closed it. Nothing has been charged.`,
      )}
      ${paragraph(
        `Store prices and the exchange rate move, so we do not hold a quote open indefinitely. Paste the link again and you will see today's landed price.`,
      )}
      ${divider()}
      ${button(data.shopUrl, "Get a fresh price")}
      ${muted(`This is a transactional message about an order you placed on Tomame.`)}
    `),
  };
}
