import {
  emailLayout,
  heading,
  paragraph,
  muted,
  divider,
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
