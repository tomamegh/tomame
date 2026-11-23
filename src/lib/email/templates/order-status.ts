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
  link,
} from "./layout";
import { taxRowLabel } from "@/lib/pricing/tax-label";
import { CUSTOMS_ROW_LABEL, CUSTOMS_ROW_VALUE, FREIGHT_ROW_LABEL, HANDLING_ROW_LABEL, feeRowLabel } from "@/config/price-story";
import { CUSTOMER_STAGE_NAMES } from "@/config/tracking-copy";

interface OrderEmailData {
  productName: string;
  orderId: string;
  /** Tomame's own number (`orders.order_no`, TM-00042), shown as the reference. */
  trackingNumber?: string;
  estimatedDeliveryDate?: string;
  /**
   * The store's own tracking for the trip to our hub ("UPS", "1Z…"). Only on
   * the purchased email, and only when the admin ticked "include it" — by
   * default customers see Tomame's number alone.
   */
  storeTracking?: Array<{ carrier: string; number: string }>;
  /** Fix 6: the firm delivery promise once the store's tracking is in ("By Tue 2 Dec", "booked on Delta Cargo…"). */
  delivery?: { line: string; detail: string | null };
  /**
   * The order's own breakdown, for the payment confirmation. Only for an order
   * paid on its own: a bag's first order is not the bag, so a grouped order
   * passes none and the card carries the customs line alone.
   */
  pricing?: PricingBreakdownData;
  /** 123: the window promised at payment, for the payment confirmation. */
  promise?: { from: string; to: string };
}

export interface PricingBreakdownData {
  itemPriceUsd: number;
  subtotalUsd: number;
  taxPercentage: number;
  taxUsd: number;
  valueFeePercentage: number;
  valueFeeUsd: number;
  /** The store's own shipping to our warehouse, line total. Absent/0 hides the row. */
  storeShippingUsd?: number;
  flatRateGhs: number;
  /** Fix 7: the part of `flatRateGhs` that is the handling fee, printed as its own row. Absent/0 hides it. */
  handlingGhs?: number;
  exchangeRate: number;
  totalGhs: number;
}

interface OrderReviewEmailData {
  productName: string;
  orderId: string;
  /** Tomame's own number (TM-00042). Shown as the reference when given. */
  trackingNumber?: string;
  totalGhs?: number;
  pricing?: PricingBreakdownData;
  priceChanged?: boolean;
  reason?: string;
  paymentUrl?: string;
}

interface OrderPlacedEmailData {
  productName: string;
  orderId: string;
  /** Tomame's own number (TM-00042). Shown as the reference when given. */
  trackingNumber?: string;
  totalGhs: number;
  needsReview: boolean;
  paymentUrl?: string;
}

/** The journey every paid order walks, in the customer-facing stage names. */
const JOURNEY = [
  CUSTOMER_STAGE_NAMES.paid,
  CUSTOMER_STAGE_NAMES.purchased,
  CUSTOMER_STAGE_NAMES.departed,
  CUSTOMER_STAGE_NAMES.delivered,
] as const;

const ORDER_REASON = "You are getting this because you placed an order on Tomame.";

const ghs = (n: number) => `GH₵&nbsp;${n.toFixed(2)}`;
const usd = (n: number) => `$${n.toFixed(2)}`;

function orderUrl(orderId: string) {
  return `${appUrl()}/app/orders/${encodeURIComponent(orderId)}`;
}

/**
 * The reference a customer reads is Tomame's own number (TM-00042), the one
 * `/track` and support know it by. The order's UUID stays inside the links; it
 * is printed only for an order that has no TM number to show.
 */
function orderCard(
  data: { productName: string; orderId: string; trackingNumber?: string },
  rows: SummaryRows = [],
  total?: readonly [string, string],
) {
  const reference = data.trackingNumber?.trim() || data.orderId;
  return summaryCard({
    label: "Your order",
    title: escapeHtml(data.productName),
    rows: [["Order reference", `<span style="word-break:break-all;">${escapeHtml(reference)}</span>`], ...rows],
    total,
  });
}

type SummaryRows = Array<readonly [string, string] | false | null | undefined>;

/** Customs is inside freight: a display row on every emailed breakdown, adding nothing. */
const CUSTOMS_ROW = [escapeHtml(CUSTOMS_ROW_LABEL), escapeHtml(CUSTOMS_ROW_VALUE)] as const;

/** The breakdown rows every priced email prints, in the shared price-story wording. */
export function breakdownRows(p: PricingBreakdownData): SummaryRows {
  return [
    ["Item price", usd(p.subtotalUsd)],
    [
      escapeHtml(taxRowLabel({ subtotal_usd: p.subtotalUsd, tax_percentage: p.taxPercentage, tax_usd: p.taxUsd }, "tax")),
      usd(p.taxUsd),
    ],
    [escapeHtml(feeRowLabel(p.valueFeePercentage)), usd(p.valueFeeUsd)],
    p.storeShippingUsd ? ["Store shipping", usd(p.storeShippingUsd)] : null,
    [escapeHtml(FREIGHT_ROW_LABEL), ghs(Math.round((p.flatRateGhs - (p.handlingGhs ?? 0)) * 100) / 100)],
    p.handlingGhs ? [escapeHtml(HANDLING_ROW_LABEL), ghs(p.handlingGhs)] : null,
    CUSTOMS_ROW,
    ["Rate", `1 USD = ${p.exchangeRate} GHS`],
  ];
}

/** `/track?q=TM-00042`, the public lookup every confirmation links to. */
function trackUrl(reference: string | undefined): string {
  return reference?.trim() ? `${appUrl()}/track?q=${encodeURIComponent(reference.trim())}` : `${appUrl()}/track`;
}

/** The /track line on every order confirmation: no sign-in needed. */
function trackLine(reference: string | undefined): string {
  return muted(
    `You can also follow it without signing in: ${link(trackUrl(reference), "track your order")} with your order ID${reference?.trim() ? ` <strong>${escapeHtml(reference.trim())}</strong>` : ""} and your phone number.`,
  );
}

/** "Fri 28 Nov" for a bare `YYYY-MM-DD` (Ghana is UTC all year). */
function emailDay(isoDate: string): string {
  return new Date(`${isoDate}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
}

/** "Fri 28 Nov – Sun 30 Nov", or one day when the window is a single day. */
export function promiseWindowText(promise: { from: string; to: string }): string {
  return promise.from === promise.to ? emailDay(promise.from) : `${emailDay(promise.from)} – ${emailDay(promise.to)}`;
}

/** The first-stage promise on the payment confirmation: the window now, the firm date with the store's tracking. */
function promiseCallout(promise: { from: string; to: string } | undefined): string {
  if (!promise) return "";
  return callout(
    `<strong>Estimated delivery: ${escapeHtml(promiseWindowText(promise))}</strong><br />That is our usual window from today. As soon as the store ships it, we send you a firm date with the flight it is booked on.`,
    "green",
  );
}

export function orderPaidTemplate(data: OrderEmailData) {
  return renderEmail("Payment confirmed: your Tomame order is being prepared", {
    preheader: `We have your payment for ${data.productName}. Our buyers are on it.`,
    body: `
      ${eyebrow("Payment received", "green")}
      ${heading("You're all paid up")}
      ${paragraph(`Thank you. Your payment for <strong>${escapeHtml(data.productName)}</strong> is in, and your order is in the queue for our buyers.`)}
      ${steps(JOURNEY, 0)}
      ${promiseCallout(data.promise)}
      ${orderCard(data, data.pricing ? breakdownRows(data.pricing) : [CUSTOMS_ROW], data.pricing ? ["Total paid", ghs(data.pricing.totalGhs)] : undefined)}
      ${paragraph("Next, we buy it from the store. We will write at every step, so there is nothing you need to do.")}
      ${button(orderUrl(data.orderId), "Track your order")}
      ${trackLine(data.trackingNumber)}
    `,
    reason: ORDER_REASON,
  });
}

export function orderProcessingTemplate(data: OrderEmailData) {
  const store = (data.storeTracking ?? []).filter((t) => t.number.trim());
  const storeRows: SummaryRows = store.map(
    (t, i) =>
      [store.length > 1 ? `Store tracking ${i + 1}` : "Store tracking", `<span style="word-break:break-all;">${escapeHtml(`${t.carrier} ${t.number}`)}</span>`] as const,
  );
  return renderEmail("We've purchased your item", {
    preheader: `${data.productName} is purchased and on its way to our hub.`,
    body: `
      ${eyebrow("Order update")}
      ${heading("We've purchased your item")}
      ${paragraph(`We have purchased <strong>${escapeHtml(data.productName)}</strong> from the store. It is now on its way to our hub, and once it heads for Ghana we will write again.`)}
      ${steps(JOURNEY, 1)}
      ${orderCard(data, storeRows)}
      ${data.delivery ? paragraph(`<strong>At your door: ${escapeHtml(data.delivery.line)}</strong>${data.delivery.detail ? `. ${escapeHtml(data.delivery.detail)}` : ""}`) : ""}
      ${store.length > 0 ? muted("The store tracking is for the trip to our hub only. Your Tomame number above is the one to track the whole journey with.") : ""}
      ${data.delivery ? "" : muted("Stores usually take 2 to 5 working days to deliver to our hub. We give you a firm delivery date as soon as the store sends its tracking.")}
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
      ${orderCard(data, [CUSTOMS_ROW], ["Total", ghs(data.totalGhs)])}
      ${cta}
      ${trackLine(data.trackingNumber)}
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
    ? orderCard(data, breakdownRows(p), ["Total", ghs(p.totalGhs)])
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
