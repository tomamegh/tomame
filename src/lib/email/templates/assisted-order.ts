import { appUrl, button, callout, divider, escapeHtml, eyebrow, fallbackLink, heading, muted, paragraph, renderEmail, summaryCard } from "./layout";

/**
 * Staff ordered for the customer (Buy for a customer). The customer may never
 * have opened the site, so this says what was ordered — every item with the
 * size and colour we will buy — and how to sign in: the email it came to, a
 * code, no password. Two versions:
 *
 * - `paid`: they already paid us; this is their receipt and the way in to follow it.
 * - `pay`: staff priced it; the button signs them in to the order, where they pay.
 */
export interface AssistedOrderEmailData {
  kind: "paid" | "pay";
  firstName: string;
  email: string;
  items: Array<{ name: string; quantity: number; options: string | null }>;
  totalGhs: number;
  /** `paid`: how they paid us ("Mobile Money", "cash"), or "". */
  paidWith?: string;
  /** `pay`: the order page they land on after signing in, path only. */
  orderPath?: string;
  /** `pay`: hours before an unpaid order is cancelled. */
  payWithinHours?: number;
  /** A new account was made for them with this email. */
  newAccount: boolean;
}

const ghs = (n: number) => `GH₵${n.toLocaleString("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function itemsCard(data: AssistedOrderEmailData) {
  return summaryCard({
    label: "Your order",
    rows: data.items.map(
      (i) =>
        [
          `${escapeHtml(i.name.length > 70 ? `${i.name.slice(0, 67)}…` : i.name)}${i.options ? `<br /><span style="font-weight:400;">${escapeHtml(i.options)}</span>` : ""}`,
          `× ${i.quantity}`,
        ] as const,
    ),
    total: [data.kind === "paid" ? "Total paid" : "Total to pay", ghs(data.totalGhs)],
  });
}

function accountLine(data: AssistedOrderEmailData) {
  return data.newAccount
    ? `We made a Tomame account for you with <strong>${escapeHtml(data.email)}</strong>. Sign in with that email and we'll send you a code. There's no password to remember.`
    : `It's on your Tomame account, <strong>${escapeHtml(data.email)}</strong>. Sign in with that email to see it with your other orders.`;
}

export function assistedOrderTemplate(data: AssistedOrderEmailData) {
  const name = escapeHtml(data.firstName);
  const count = data.items.reduce((n, i) => n + i.quantity, 0);
  const items = `${count} item${count === 1 ? "" : "s"}`;
  const checkOptions = callout("Check the size and colour above. If anything is wrong, reply to this email or message us on WhatsApp before we buy it.", "amber");

  if (data.kind === "pay") {
    const next = data.orderPath ?? "/app/orders";
    const payUrl = `${appUrl()}/auth/login?next=${encodeURIComponent(next)}`;
    const hours = data.payWithinHours ?? 48;
    return renderEmail("Your Tomame order is ready to pay", {
      preheader: `We've priced ${items} for you: ${ghs(data.totalGhs)} all in. Sign in with ${data.email} to pay.`,
      body: `
        ${eyebrow("Ready to pay", "coral")}
        ${heading(`Your order is ready, ${name}`)}
        ${paragraph("Our team priced these items for you and checked the details. The total covers everything: the item, tax, our fee, shipping to Ghana and delivery.")}
        ${itemsCard(data)}
        ${paragraph(accountLine(data))}
        ${button(payUrl, "Sign in and pay")}
        ${fallbackLink(payUrl)}
        ${paragraph(`Pay with Mobile Money or a card. We hold this price for ${hours} hours; after that the order is cancelled and we'd price it again.`)}
        ${checkOptions}
        ${muted("Once you've paid, we buy it from the store and email you at every step.")}
      `,
      reason: "You are getting this because Tomame prepared an order for you with this email address.",
    });
  }

  const signIn = `${appUrl()}/auth/login?next=${encodeURIComponent("/app/orders")}`;
  return renderEmail("Your Tomame order is placed and paid", {
    preheader: `We've ordered ${items} for you. Sign in with ${data.email} to follow it.`,
    body: `
      ${eyebrow("Order placed", "green")}
      ${heading(`We've placed your order, ${name}`)}
      ${paragraph(
        `Thanks for paying us${data.paidWith ? ` by ${escapeHtml(data.paidWith)}` : ""}. Our team placed this order for you, and our buyers will now get it from the store.`,
      )}
      ${itemsCard(data)}
      ${paragraph("We'll email you at each step: when we buy it, when it ships, and when it's ready for you.")}
      ${divider()}
      ${heading("Follow your order")}
      ${paragraph(accountLine(data))}
      ${button(signIn, "See my order")}
      ${fallbackLink(signIn)}
      ${checkOptions}
      ${muted("Tomame buys from stores in the USA, UK and China and delivers to you in Ghana.")}
    `,
    reason: "You are getting this because Tomame placed an order for you with this email address.",
  });
}
