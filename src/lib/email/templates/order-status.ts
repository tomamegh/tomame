import {
  renderEmail,
  eyebrow,
  heading,
  paragraph,
  muted,
  button,
  summaryCard,
  callout,
  steps,
  escapeHtml,
  appUrl,
} from "./layout";
import { taxRowLabel } from "@/lib/pricing/tax-label";

interface OrderEmailData {
  productName: string;
  orderId: string;
  trackingNumber?: string;
  estimatedDeliveryDate?: string;
}

interface PricingBreakdownData {
  itemPriceUsd: number;
  subtotalUsd: number;
  taxPercentage: number;
  taxUsd: number;
  valueFeePercentage: number;
  valueFeeUsd: number;
  /** The store's own shipping to our warehouse, line total. Absent/0 hides the row. */
  storeShippingUsd?: number;
  flatRateGhs: number;
  exchangeRate: number;
  totalGhs: number;
}

interface OrderReviewEmailData {
  productName: string;
  orderId: string;
  totalGhs?: number;
  pricing?: PricingBreakdownData;
  priceChanged?: boolean;
  reason?: string;
  paymentUrl?: string;
}

interface OrderPlacedEmailData {
  productName: string;
  orderId: string;
  totalGhs: number;
  needsReview: boolean;
  paymentUrl?: string;
}

/** The journey every paid order walks, as the customer reads it. */
const JOURNEY = ["Paid", "Buying", "On the way", "Delivered"] as const;

const ORDER_REASON = "You are getting this because you placed an order on Tomame.";

const ghs = (n: number) => `GH₵&nbsp;${n.toFixed(2)}`;
const usd = (n: number) => `$${n.toFixed(2)}`;

function orderUrl(orderId: string) {
  return `${appUrl()}/app/orders/${encodeURIComponent(orderId)}`;
}

function orderCard(data: { productName: string; orderId: string }, rows: SummaryRows = [], total?: readonly [string, string]) {
  return summaryCard({
    label: "Your order",
    title: escapeHtml(data.productName),
    rows: [["Order reference", `<span style="word-break:break-all;">${escapeHtml(data.orderId)}</span>`], ...rows],
    total,
  });
}

type SummaryRows = Array<readonly [string, string] | false | null | undefined>;

export function orderPaidTemplate(data: OrderEmailData) {
  return renderEmail("Payment confirmed: your Tomame order is being prepared", {
    preheader: `We have your payment for ${data.productName}. Our buyers are on it.`,
    body: `
      ${eyebrow("Payment received", "green")}
      ${heading("You're all paid up")}
      ${paragraph(`Thank you. Your payment for <strong>${escapeHtml(data.productName)}</strong> is in, and your order is in the queue for our buyers.`)}
      ${steps(JOURNEY, 0)}
      ${orderCard(data)}
      ${paragraph("Next, we buy it from the store. We will write at every step, so there is nothing you need to do.")}
      ${button(orderUrl(data.orderId), "Track your order")}
    `,
    reason: ORDER_REASON,
  });
}

export function orderProcessingTemplate(data: OrderEmailData) {
  return renderEmail("Your Tomame order is now being processed", {
    preheader: `We are buying ${data.productName} from the store now.`,
    body: `
      ${eyebrow("Order update")}
      ${heading("We're buying your item")}
      ${paragraph(`Our team is placing the order for <strong>${escapeHtml(data.productName)}</strong> with the store. Once it reaches our hub and heads for Ghana, you will get the tracking details.`)}
      ${steps(JOURNEY, 1)}
      ${orderCard(data)}
      ${muted("This usually takes 2 to 5 working days, depending on the store.")}
      ${button(orderUrl(data.orderId), "Track your order")}
    `,
    reason: ORDER_REASON,
  });
}

export function orderShippedTemplate(data: OrderEmailData) {
  return renderEmail("Your Tomame order has shipped!", {
    preheader: `${data.productName} is on its way to Ghana.`,
    body: `
      ${eyebrow("On the way")}
      ${heading("Your order is on its way to Ghana")}
      ${paragraph(`<strong>${escapeHtml(data.productName)}</strong> has left our hub. Here is how to follow it.`)}
      ${steps(JOURNEY, 2)}
      ${orderCard(data, [
        data.trackingNumber ? ["Tracking number", escapeHtml(data.trackingNumber)] : null,
        data.estimatedDeliveryDate ? ["Expected", escapeHtml(data.estimatedDeliveryDate)] : null,
      ])}
      ${paragraph("We will let you know the moment it is delivered.")}
      ${muted("Delivery times depend on the shipping method and on customs in Ghana.")}
      ${button(orderUrl(data.orderId), "Track your order")}
    `,
    reason: ORDER_REASON,
  });
}

export function orderDeliveredTemplate(data: OrderEmailData) {
  return renderEmail("Your Tomame order has been delivered", {
    preheader: `${data.productName} has been delivered. Enjoy it.`,
    body: `
      ${eyebrow("Delivered", "green")}
      ${heading("Delivered. Enjoy it!")}
      ${paragraph(`<strong>${escapeHtml(data.productName)}</strong> has been delivered. We hope it is everything you wanted.`)}
      ${steps(JOURNEY, JOURNEY.length)}
      ${orderCard(data)}
      ${paragraph("Thank you for shopping with Tomame. When you find the next thing you want, paste the link and we will price it in cedis.")}
      ${muted("Something not right with the delivery? Write to us and we will help.")}
      ${button(`${appUrl()}/app`, "Shop again")}
    `,
    reason: ORDER_REASON,
  });
}

export function orderPlacedTemplate(data: OrderPlacedEmailData) {
  const body = data.needsReview
    ? `${paragraph(`Thanks for your order for <strong>${escapeHtml(data.productName)}</strong>. A member of our team needs to check a few details before it can go ahead.`)}
       ${callout("<strong>No need to pay yet.</strong> We will email you as soon as the review is done.", "amber")}`
    : paragraph(`Thanks for your order for <strong>${escapeHtml(data.productName)}</strong>. Pay when you are ready and our buyers will get started.`);

  const cta = !data.needsReview && data.paymentUrl
    ? button(data.paymentUrl, "Complete payment")
    : button(orderUrl(data.orderId), "View your order");

  return renderEmail("We received your Tomame order", {
    preheader: data.needsReview
      ? `We are checking a few details on ${data.productName}. No payment needed yet.`
      : `Your order for ${data.productName} is ready to pay: GH₵ ${data.totalGhs.toFixed(2)}.`,
    body: `
      ${eyebrow("Order received")}
      ${heading("We've got your order")}
      ${body}
      ${orderCard(data, [], ["Total", ghs(data.totalGhs)])}
      ${cta}
      ${muted("Pay by Mobile Money or card through Paystack. Nothing is charged until you pay.")}
    `,
    reason: ORDER_REASON,
  });
}

export function orderCancelledTemplate(data: OrderEmailData) {
  return renderEmail("Your Tomame order has been cancelled", {
    preheader: `Your order for ${data.productName} has been cancelled.`,
    body: `
      ${eyebrow("Order cancelled", "neutral")}
      ${heading("Your order has been cancelled")}
      ${paragraph(`We have cancelled your order for <strong>${escapeHtml(data.productName)}</strong>. If you paid for it, we will refund you to the same Mobile Money wallet or card.`)}
      ${orderCard(data)}
      ${muted("Refunds usually show up within 3 to 5 working days. If you have questions about this cancellation, write to us and we will explain.")}
      ${button(`${appUrl()}/app`, "Back to Tomame")}
    `,
    reason: ORDER_REASON,
  });
}

export function orderApprovedTemplate(data: OrderReviewEmailData) {
  const intro = data.priceChanged
    ? `Good news: we have checked your order for <strong>${escapeHtml(data.productName)}</strong> and it can go ahead. The price has changed since you ordered, so please look at the new total before you pay.`
    : `Good news: we have checked your order for <strong>${escapeHtml(data.productName)}</strong> and it can go ahead. Pay when you are ready and our buyers will get started.`;

  const p = data.pricing;
  const card = p
    ? orderCard(
        data,
        [
          ["Item price", usd(p.subtotalUsd)],
          [
            escapeHtml(taxRowLabel({ subtotal_usd: p.subtotalUsd, tax_percentage: p.taxPercentage, tax_usd: p.taxUsd }, "tax")),
            usd(p.taxUsd),
          ],
          [`Value fee (${(p.valueFeePercentage * 100).toFixed(0)}%)`, usd(p.valueFeeUsd)],
          ...(p.storeShippingUsd ? [["Store shipping", usd(p.storeShippingUsd)] as [string, string]] : []),
          ["Freight", ghs(p.flatRateGhs)],
          ["Rate", `1 USD = ${p.exchangeRate} GHS`],
        ],
        ["Total", ghs(p.totalGhs)],
      )
    : orderCard(data, [], data.totalGhs !== undefined ? ["Total", ghs(data.totalGhs)] : undefined);

  return renderEmail("Your Tomame order has been approved", {
    preheader: data.priceChanged
      ? `Your order for ${data.productName} is approved at a new price. Check it before you pay.`
      : `Your order for ${data.productName} is approved and ready to pay.`,
    body: `
      ${eyebrow("Approved", "green")}
      ${heading("Your order is approved")}
      ${paragraph(intro)}
      ${data.priceChanged ? callout("<strong>The price has been updated.</strong> The total below is the one you will pay.", "amber") : ""}
      ${card}
      ${data.paymentUrl ? button(data.paymentUrl, "Complete payment") : ""}
      ${muted("Pay by Mobile Money or card through Paystack. Nothing is charged until you pay.")}
    `,
    reason: ORDER_REASON,
  });
}

export function orderRejectedTemplate(data: OrderReviewEmailData) {
  return renderEmail("Update on your Tomame order", {
    preheader: `We could not go ahead with your order for ${data.productName}.`,
    body: `
      ${eyebrow("Order update", "neutral")}
      ${heading("We couldn't go ahead with this one")}
      ${paragraph(`We checked your order for <strong>${escapeHtml(data.productName)}</strong> and, unfortunately, we are not able to buy it for you.`)}
      ${data.reason ? callout(`<strong>Why:</strong> ${escapeHtml(data.reason)}`, "neutral") : ""}
      ${orderCard(data)}
      ${paragraph("If you paid for it, we will refund you to the same Mobile Money wallet or card within 3 to 5 working days.")}
      ${muted("Found it on another store? Paste that link and we will price it there.")}
      ${button(`${appUrl()}/app`, "Find something else")}
    `,
    reason: ORDER_REASON,
  });
}
