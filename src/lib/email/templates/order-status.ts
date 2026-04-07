import {
  emailLayout,
  heading,
  paragraph,
  muted,
  divider,
  button,
  infoRow,
  infoTable,
} from "./layout";

interface OrderEmailData {
  productName: string;
  orderId: string;
  trackingNumber?: string;
  carrier?: string;
  estimatedDeliveryDate?: string;
}

interface PricingBreakdownData {
  itemPriceUsd: number;
  subtotalUsd: number;
  taxPercentage: number;
  taxUsd: number;
  valueFeePercentage: number;
  valueFeeUsd: number;
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

function orderDetails(data: OrderEmailData, extraRows = "") {
  return infoTable(`
    ${infoRow("Order ID", data.orderId)}
    ${infoRow("Item", data.productName)}
    ${extraRows}
  `);
}

export function orderPaidTemplate(data: OrderEmailData) {
  return {
    subject: "Payment confirmed — your Tomame order is being prepared",
    html: emailLayout(`
      ${heading("Payment Confirmed")}
      ${paragraph("Great news! We've received your payment and your order is now queued for processing.")}
      ${divider()}
      ${orderDetails(data)}
      ${divider()}
      ${paragraph("Our team will begin purchasing your item shortly. We'll notify you at every step of the way.")}
      ${muted("You'll receive an email when your order moves to the next stage.")}
    `),
  };
}

export function orderProcessingTemplate(data: OrderEmailData) {
  return {
    subject: "Your Tomame order is now being processed",
    html: emailLayout(`
      ${heading("Order in Progress")}
      ${paragraph("We've started processing your order. Our team is purchasing your item from the international store.")}
      ${divider()}
      ${orderDetails(data)}
      ${divider()}
      ${paragraph("Once your item is ready to ship, we'll send you the tracking details.")}
      ${muted("Processing typically takes 2–5 business days depending on the source.")}
    `),
  };
}

export function orderShippedTemplate(data: OrderEmailData) {
  const extraRows = [
    data.carrier ? infoRow("Carrier", data.carrier) : "",
    data.trackingNumber ? infoRow("Tracking #", data.trackingNumber) : "",
    data.estimatedDeliveryDate
      ? infoRow("Est. Delivery", data.estimatedDeliveryDate)
      : "",
  ].join("");

  return {
    subject: "Your Tomame order has shipped!",
    html: emailLayout(`
      ${heading("Your Order Has Shipped")}
      ${paragraph("Your item is on its way to Ghana! Here are the details:")}
      ${divider()}
      ${orderDetails(data, extraRows)}
      ${divider()}
      ${paragraph("We'll let you know as soon as your order is delivered.")}
      ${muted("Delivery times vary based on shipping method and customs processing.")}
    `),
  };
}

export function orderDeliveredTemplate(data: OrderEmailData) {
  return {
    subject: "Your Tomame order has been delivered",
    html: emailLayout(`
      ${heading("Order Delivered")}
      ${paragraph("Your order has been successfully delivered. We hope you love your purchase!")}
      ${divider()}
      ${orderDetails(data)}
      ${divider()}
      ${paragraph("Thank you for shopping with Tomame. We'd love to help you with your next order.")}
      ${muted("If you have any issues with your delivery, please contact our support team.")}
    `),
  };
}

export function orderPlacedTemplate(data: OrderPlacedEmailData) {
  const bodyText = data.needsReview
    ? "Thanks for your order! Our team needs to review a few details before it can proceed. We'll email you once the review is complete."
    : "Thanks for your order! Please complete your payment to begin processing.";

  const paymentBtn = !data.needsReview && data.paymentUrl
    ? button(data.paymentUrl, "Complete Payment")
    : "";

  return {
    subject: "We received your Tomame order",
    html: emailLayout(`
      ${heading("Order Received")}
      ${paragraph(bodyText)}
      ${divider()}
      ${infoTable(`
        ${infoRow("Order ID", data.orderId)}
        ${infoRow("Item", data.productName)}
        ${infoRow("Total", `GHS ${data.totalGhs.toFixed(2)}`)}
      `)}
      ${divider()}
      ${paymentBtn}
      ${muted("Log in to your Tomame account to track your order.")}
    `),
  };
}

export function orderCancelledTemplate(data: OrderEmailData) {
  return {
    subject: "Your Tomame order has been cancelled",
    html: emailLayout(`
      ${heading("Order Cancelled")}
      ${paragraph("Your order has been cancelled. If a payment was made, a refund will be processed to your original payment method.")}
      ${divider()}
      ${orderDetails(data)}
      ${divider()}
      ${paragraph("If you have questions about this cancellation, please reach out to our support team.")}
      ${muted("Refunds typically take 3–5 business days to appear in your account.")}
    `),
  };
}

export function orderApprovedTemplate(data: OrderReviewEmailData) {
  const bodyText = data.priceChanged
    ? "Great news! Our team has reviewed your order and approved it. The price has been updated — please complete your payment at the new amount."
    : "Great news! Our team has reviewed your order and it has been approved. Please proceed to payment to begin processing.";

  const paymentBtn = data.paymentUrl
    ? button(data.paymentUrl, "Complete Payment")
    : "";

  const pricingRows = data.pricing
    ? infoTable(`
        ${infoRow("Order ID", data.orderId)}
        ${infoRow("Item", data.productName)}
        ${infoRow("Item price (USD)", `$${data.pricing.subtotalUsd.toFixed(2)}`)}
        ${infoRow(`Tax (${(data.pricing.taxPercentage * 100).toFixed(0)}%)`, `$${data.pricing.taxUsd.toFixed(2)}`)}
        ${infoRow(`Value fee (${(data.pricing.valueFeePercentage * 100).toFixed(0)}%)`, `$${data.pricing.valueFeeUsd.toFixed(2)}`)}
        ${infoRow("Freight", `GH₵ ${data.pricing.flatRateGhs.toFixed(2)}`)}
        ${infoRow("Rate", `1 USD = ${data.pricing.exchangeRate} GHS`)}
        ${infoRow("Total", `GHS ${data.pricing.totalGhs.toFixed(2)}`)}
      `)
    : infoTable(`
        ${infoRow("Order ID", data.orderId)}
        ${infoRow("Item", data.productName)}
        ${data.totalGhs !== undefined ? infoRow("Total", `GHS ${data.totalGhs.toFixed(2)}`) : ""}
      `);

  return {
    subject: "Your Tomame order has been approved",
    html: emailLayout(`
      ${heading("Order Approved")}
      ${paragraph(bodyText)}
      ${divider()}
      ${pricingRows}
      ${divider()}
      ${paymentBtn}
      ${muted("Log in to your Tomame account to complete payment and begin processing.")}
    `),
  };
}

export function orderRejectedTemplate(data: OrderReviewEmailData) {
  const reasonText = data.reason
    ? paragraph(`<strong>Reason:</strong> ${data.reason}`)
    : "";

  return {
    subject: "Update on your Tomame order",
    html: emailLayout(`
      ${heading("Order Could Not Be Processed")}
      ${paragraph("Unfortunately, after reviewing your order our team was unable to proceed with it.")}
      ${divider()}
      ${infoTable(`
        ${infoRow("Order ID", data.orderId)}
        ${infoRow("Item", data.productName)}
      `)}
      ${divider()}
      ${reasonText}
      ${paragraph("If a payment was made, a refund will be processed to your original payment method within 3–5 business days.")}
      ${muted("Please contact our support team if you have any questions.")}
    `),
  };
}
