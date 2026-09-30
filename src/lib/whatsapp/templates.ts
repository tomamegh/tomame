/**
 * The WhatsApp template set — one per customer event that emails today.
 *
 * WhatsApp only delivers business-initiated messages as templates Meta has
 * approved, so these bodies are not ours to change at will: the text here must
 * match, character for character, what was approved in Meta Business Manager.
 * docs/whatsapp-templates.md is generated from the same shapes; change both, and
 * resubmit the template, or every send fails with 132000/132001.
 *
 * Conventions (all Meta rules or learned the hard way):
 *   - {{1}} is always the customer's first name ("there" when we have none).
 *   - A body never starts or ends with a placeholder, and no two are adjacent.
 *   - Money is `GH₵ 1,234.56`; the currency sits in the template, the number in
 *     the parameter.
 *   - The one button is a URL button whose URL is `<app>/{{1}}`; the suffix is
 *     the path (`app/orders/<id>`), so one base URL serves every template and
 *     the approved template never names an order.
 */

export const WHATSAPP_LANGUAGE = "en";

export interface WhatsAppTemplateDef {
  name: string;
  category: "UTILITY";
  body: string;
  /** Example value per placeholder, for Meta's review form. */
  samples: readonly string[];
  button: { text: string; sampleSuffix: string } | null;
}

const orderButton = (text: string) => ({ text, sampleSuffix: "app/orders/3f2a9c1e-7b4d-4e0a-9f61-2c8d5b7a1e90" });

export const WHATSAPP_TEMPLATES = {
  order_placed: {
    name: "tomame_order_placed",
    category: "UTILITY",
    body: "Hi {{1}}, we've got your order for {{2}}. Your total is GH₵ {{3}}. Pay with Mobile Money or card when you're ready and our buyers will get started.",
    samples: ["Ama", "Nike Air Max 90 (size 42)", "1,845.20"],
    button: orderButton("Pay now"),
  },
  order_in_review: {
    name: "tomame_order_in_review",
    category: "UTILITY",
    body: "Hi {{1}}, thanks for your order for {{2}}. Our team is checking a few details first, so there's nothing to pay yet. We'll message you as soon as it's ready.",
    samples: ["Ama", "Dyson V8 cordless vacuum"],
    button: orderButton("View order"),
  },
  order_paid: {
    name: "tomame_order_paid",
    category: "UTILITY",
    body: "Hi {{1}}, payment received for {{2}}. Thank you! Our buyers are on it, and we'll update you at every step.",
    samples: ["Kofi", "Apple AirPods Pro (2nd generation)"],
    button: orderButton("Track order"),
  },
  order_processing: {
    name: "tomame_order_processing",
    category: "UTILITY",
    body: "Hi {{1}}, we're buying {{2}} from the store now. Once it reaches our hub and heads for Ghana, you'll get the tracking details.",
    samples: ["Kofi", "Apple AirPods Pro (2nd generation)"],
    button: orderButton("Track order"),
  },
  order_shipped: {
    name: "tomame_order_shipped",
    category: "UTILITY",
    body: "Hi {{1}}, {{2}} has left our hub and is on its way to Ghana. Tracking: {{3}}. We'll let you know the moment it arrives.",
    samples: ["Esi", "Instant Pot Duo 7-in-1", "DHL 1234567890"],
    button: orderButton("Track order"),
  },
  order_delivered: {
    name: "tomame_order_delivered",
    category: "UTILITY",
    body: "Hi {{1}}, {{2}} has been delivered. We hope you love it! Thank you for shopping with Tomame.",
    samples: ["Esi", "Instant Pot Duo 7-in-1"],
    button: orderButton("View order"),
  },
  order_cancelled: {
    name: "tomame_order_cancelled",
    category: "UTILITY",
    body: "Hi {{1}}, your order for {{2}} has been cancelled. If you paid, we'll refund the same Mobile Money wallet or card, usually within 3 to 5 working days.",
    samples: ["Yaw", "Samsung Galaxy Buds2 Pro"],
    button: orderButton("View order"),
  },
  order_approved: {
    name: "tomame_order_approved",
    category: "UTILITY",
    body: "Hi {{1}}, good news: we've checked your order for {{2}} and it can go ahead. Your total is GH₵ {{3}}. Pay when you're ready and our buyers will start.",
    samples: ["Abena", "Dyson V8 cordless vacuum", "3,210.00"],
    button: orderButton("Pay now"),
  },
  order_rejected: {
    name: "tomame_order_rejected",
    category: "UTILITY",
    body: "Hi {{1}}, we're sorry, we can't go ahead with your order for {{2}}. Reason: {{3}}. Nothing has been charged.",
    samples: ["Abena", "Lithium power bank 30000mAh", "airlines will not carry this battery size"],
    button: orderButton("View order"),
  },
  parcel_photo: {
    name: "tomame_parcel_photo",
    category: "UTILITY",
    body: "Hi {{1}}, {{2}} has reached our hub and we've added a photo of your parcel. Take a look on your order page.",
    samples: ["Kwame", "Order TM-10482 (Nike Air Max 90)"],
    button: orderButton("See photo"),
  },
  payment_expired: {
    name: "tomame_payment_expired",
    category: "UTILITY",
    body: "Hi {{1}}, your payment of GH₵ {{2}} (ref {{3}}) wasn't completed in time, so nothing was charged. You can try again whenever you're ready.",
    samples: ["Kwame", "1,845.20", "TM-8F3K2L"],
    button: { text: "Try again", sampleSuffix: "app/bag" },
  },
  unpaid_cancelled: {
    name: "tomame_unpaid_cancelled",
    category: "UTILITY",
    body: "Hi {{1}}, we closed {{2}} because it wasn't paid within {{3}} hours. Nothing was charged. Paste the link again any time for a fresh quote.",
    samples: ["Akua", "your bag of 3 items", "48"],
    button: { text: "Shop again", sampleSuffix: "app/orders/new" },
  },
  price_drop: {
    name: "tomame_price_drop",
    category: "UTILITY",
    body: "Hi {{1}}, good news: {{2}} has dropped {{3}}%. It now lands in Ghana for GH₵ {{4}}, shipping and fees included.",
    samples: ["Akua", "Sony WH-1000XM5 headphones", "15", "4,120.50"],
    button: { text: "See the price", sampleSuffix: "app/orders/new?url=https%3A%2F%2Fwww.amazon.com%2Fdp%2FB09XS7JWHH" },
  },
  sourcing_available: {
    name: "tomame_sourcing_available",
    category: "UTILITY",
    body: "Hi {{1}}, good news: our buyer found {{2}}. It's priced and waiting in your bag, so you can check out whenever you're ready.",
    samples: ["Efua", "Le Creuset 5.5 qt Dutch oven"],
    button: { text: "Open my bag", sampleSuffix: "app/bag" },
  },
  sourcing_unavailable: {
    name: "tomame_sourcing_unavailable",
    category: "UTILITY",
    body: "Hi {{1}}, our buyer couldn't source {{2}} this time. Their note: {{3}}. Sorry about that. Your bag has been updated.",
    samples: ["Efua", "Le Creuset 5.5 qt Dutch oven", "sold out at every store that ships to us"],
    button: { text: "Open my bag", sampleSuffix: "app/bag" },
  },
  rider_assigned: {
    name: "tomame_rider_assigned",
    category: "UTILITY",
    body: "Hi {{1}}, your delivery rider {{2}} has your package for {{3}} and is on the way. Rider's phone: {{4}}. Live tracking: {{5}}. See you soon!",
    samples: ["Kojo", "Emmanuel", "order TM-10482", "+233 24 412 3456", "https://m.uber.com/ul/?trip=abc123"],
    button: orderButton("Track delivery"),
  },
  quote_ready: {
    name: "tomame_quote_ready",
    category: "UTILITY",
    body: "Hi {{1}}, your quote for {{2}} is ready, priced in cedis with shipping included. Tap below to see it.",
    samples: ["Kojo", "KitchenAid Artisan stand mixer"],
    button: { text: "See my quote", sampleSuffix: "app/orders/review/9d1e2f3a-4b5c-4d6e-8f70-1a2b3c4d5e6f" },
  },
} as const satisfies Record<string, WhatsAppTemplateDef>;

export type WhatsAppTemplateKey = keyof typeof WHATSAPP_TEMPLATES;

/**
 * One message ready to queue: which template, the placeholders AFTER the name
 * ({{2}} onwards — the service prepends {{1}} from the profile), and the path
 * for the button.
 */
export interface WhatsAppMessage {
  template: WhatsAppTemplateKey;
  params: string[];
  /** App path for the URL button, e.g. `/app/orders/<id>`. */
  buttonPath: string | null;
}

/** Count of {{n}} placeholders in a body. */
export function placeholderCount(body: string): number {
  return new Set(body.match(/\{\{\d+\}\}/g) ?? []).size;
}

/** The text the customer will read — for tests, the admin log and the docs. */
export function renderTemplateBody(key: WhatsAppTemplateKey, allParams: readonly string[]): string {
  return WHATSAPP_TEMPLATES[key].body.replace(/\{\{(\d+)\}\}/g, (_m, n: string) => allParams[Number(n) - 1] ?? `{{${n}}}`);
}

export function greetingName(firstName: string | null | undefined): string {
  const first = (firstName ?? "").trim().split(/\s+/)[0];
  return first || "there";
}

/** `1,845.20` — the number part of `GH₵ 1,845.20`. */
export function formatGhsAmount(amount: number): string {
  const safe = Number.isFinite(amount) ? amount : 0;
  return safe.toLocaleString("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const orderPath = (orderId: string) => `/app/orders/${orderId}`;

// ── Builders: one per event, so call sites cannot put {{3}} where {{2}} goes ──

export const whatsappMessages = {
  orderPlaced(d: { orderId: string; productName: string; totalGhs: number; needsReview: boolean }): WhatsAppMessage {
    return d.needsReview
      ? { template: "order_in_review", params: [d.productName], buttonPath: orderPath(d.orderId) }
      : { template: "order_placed", params: [d.productName, formatGhsAmount(d.totalGhs)], buttonPath: orderPath(d.orderId) };
  },

  /** null for a status that has no customer message. */
  orderStatus(d: {
    orderId: string;
    productName: string;
    status: string;
    carrier?: string | null;
    trackingNumber?: string | null;
  }): WhatsAppMessage | null {
    const button = orderPath(d.orderId);
    switch (d.status) {
      case "paid":
        return { template: "order_paid", params: [d.productName], buttonPath: button };
      case "processing":
        return { template: "order_processing", params: [d.productName], buttonPath: button };
      case "in_transit": {
        const tracking = [d.carrier, d.trackingNumber].filter((s) => s && s.trim()).join(" ");
        return { template: "order_shipped", params: [d.productName, tracking || "on your order page"], buttonPath: button };
      }
      case "delivered":
        return { template: "order_delivered", params: [d.productName], buttonPath: button };
      case "cancelled":
        return { template: "order_cancelled", params: [d.productName], buttonPath: button };
      default:
        return null;
    }
  },

  orderReviewed(d: { orderId: string; productName: string; approved: boolean; totalGhs: number; reason?: string | null }): WhatsAppMessage {
    return d.approved
      ? { template: "order_approved", params: [d.productName, formatGhsAmount(d.totalGhs)], buttonPath: orderPath(d.orderId) }
      : {
          template: "order_rejected",
          params: [d.productName, d.reason?.trim() || "our team has left the details on your order page"],
          buttonPath: orderPath(d.orderId),
        };
  },

  parcelPhoto(d: { orderId: string; orderNo: string | null; productName: string }): WhatsAppMessage {
    const what = d.orderNo ? `Order ${d.orderNo} (${d.productName})` : d.productName;
    return { template: "parcel_photo", params: [what], buttonPath: orderPath(d.orderId) };
  },

  paymentExpired(d: { amountGhs: number; reference: string; retryPath: string }): WhatsAppMessage {
    return { template: "payment_expired", params: [formatGhsAmount(d.amountGhs), d.reference], buttonPath: d.retryPath };
  },

  unpaidCancelled(d: { what: string; ttlHours: number }): WhatsAppMessage {
    return { template: "unpaid_cancelled", params: [d.what, String(d.ttlHours)], buttonPath: "/app/orders/new" };
  },

  priceDrop(d: { productName: string; dropPct: number; totalGhs: number | null; productUrl: string }): WhatsAppMessage | null {
    // No landed total means the drop cannot be stated in cedis; email covers it.
    if (d.totalGhs === null || !Number.isFinite(d.totalGhs)) return null;
    return {
      template: "price_drop",
      params: [d.productName, String(Math.round(d.dropPct)), formatGhsAmount(d.totalGhs)],
      buttonPath: `/app/orders/new?url=${encodeURIComponent(d.productUrl)}`,
    };
  },

  sourcingAnswered(d: { productName: string; available: boolean; note?: string | null }): WhatsAppMessage {
    return d.available
      ? { template: "sourcing_available", params: [d.productName], buttonPath: "/app/bag" }
      : {
          template: "sourcing_unavailable",
          params: [d.productName, d.note?.trim() || "it isn't available from a store we can buy from"],
          buttonPath: "/app/bag",
        };
  },

  riderAssigned(d: {
    orderId: string;
    orderNo: string | null;
    productName: string;
    riderName: string | null;
    /** e.g. "Bolt" — names the rider when the admin saved no name. */
    providerName?: string | null;
    riderPhone: string | null;
    trackingUrl: string | null;
  }): WhatsAppMessage {
    return {
      template: "rider_assigned",
      params: [
        d.riderName?.trim() || (d.providerName ? `from ${d.providerName}` : "from Tomame"),
        d.orderNo ? `order ${d.orderNo}` : d.productName,
        d.riderPhone || "on your order page",
        d.trackingUrl || "on your order page",
      ],
      buttonPath: orderPath(d.orderId),
    };
  },

  quoteReady(d: { productName: string; reviewPath: string }): WhatsAppMessage {
    return { template: "quote_ready", params: [d.productName], buttonPath: d.reviewPath };
  },
};
