interface OrderEmailData {
  productName: string;
  orderId: string;
  trackingNumber?: string;
  carrier?: string;
  estimatedDeliveryDate?: string;
}

export function orderPaidTemplate(data: OrderEmailData) {
  return {
    subject: "Payment confirmed — your Tomame order is being prepared",
    html: `
      <h2>Payment Confirmed</h2>
      <p>Great news! We've received your payment for <strong>${data.productName}</strong>.</p>
      <p>Order ID: <strong>${data.orderId}</strong></p>
      <p>Our team will begin processing your order shortly. We'll notify you when there's an update.</p>
    `,
  };
}

export function orderProcessingTemplate(data: OrderEmailData) {
  return {
    subject: "Your Tomame order is now being processed",
    html: `
      <h2>Order Processing</h2>
      <p>Your order for <strong>${data.productName}</strong> is now being processed.</p>
      <p>Order ID: <strong>${data.orderId}</strong></p>
      <p>We're working on purchasing and preparing your item. You'll receive another update once it ships.</p>
    `,
  };
}

export function orderShippedTemplate(data: OrderEmailData) {
  return {
    subject: "Your Tomame order has shipped!",
    html: `
      <h2>Order Shipped</h2>
      <p>Your order for <strong>${data.productName}</strong> is on its way!</p>
      <p>Order ID: <strong>${data.orderId}</strong></p>
      ${data.carrier ? `<p>Carrier: <strong>${data.carrier}</strong></p>` : ""}
      ${data.trackingNumber ? `<p>Tracking Number: <strong>${data.trackingNumber}</strong></p>` : ""}
      ${data.estimatedDeliveryDate ? `<p>Estimated Delivery: <strong>${data.estimatedDeliveryDate}</strong></p>` : ""}
      <p>We'll let you know when your order has been delivered.</p>
    `,
  };
}

export function orderDeliveredTemplate(data: OrderEmailData) {
  return {
    subject: "Your Tomame order has been delivered",
    html: `
      <h2>Order Delivered</h2>
      <p>Your order for <strong>${data.productName}</strong> has been delivered.</p>
      <p>Order ID: <strong>${data.orderId}</strong></p>
      <p>Thank you for shopping with Tomame!</p>
    `,
  };
}

export function orderCancelledTemplate(data: OrderEmailData) {
  return {
    subject: "Your Tomame order has been cancelled",
    html: `
      <h2>Order Cancelled</h2>
      <p>Your order for <strong>${data.productName}</strong> has been cancelled.</p>
      <p>Order ID: <strong>${data.orderId}</strong></p>
      <p>If you have any questions, please contact our support team.</p>
    `,
  };
}
