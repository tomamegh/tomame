import { renderEmail, eyebrow, heading, paragraph, summaryCard, button, escapeHtml } from "./layout";

/**
 * "Your delivery is changed" (Seamless Roadmap, Initiative 5): the customer
 * changed where a paid checkout goes, themselves. One email for the whole
 * checkout, with the new destination and how long it can still be changed.
 */
export interface DeliveryDetailsChangedEmailData {
  deliverTo: { label: string; kind: "door" | "pickup"; lines: string[] } | null;
  /** The number the rider calls, already formatted; null for pickup. */
  phone: string | null;
  items: Array<{ orderNo: string; productName: string }>;
  /** ISO time the change closes (its flight's cutoff), or null while no flight is booked yet. */
  until: string | null;
  journeyUrl: string;
}

/** "Thu 26 Nov, 00:00" in Accra (UTC). */
export function untilText(iso: string): string {
  const d = new Date(iso);
  const day = d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
  return `${day}, ${d.toISOString().slice(11, 16)}`;
}

export function deliveryDetailsChangedTemplate(data: DeliveryDetailsChangedEmailData) {
  const first = data.items[0];
  const what = data.items.length === 1 && first ? first.productName : `${data.items.length} of your orders`;
  const where = data.deliverTo?.label ?? "your new choice";
  const rows: Array<readonly [string, string]> = [
    ["Deliver to", escapeHtml(where)],
    ...(data.deliverTo?.lines ?? []).map((line) => ["", escapeHtml(line)] as const),
    ...(data.phone ? [["Rider calls", escapeHtml(data.phone)] as const] : []),
    ...data.items.map((item) => [escapeHtml(item.orderNo), escapeHtml(item.productName)] as const),
  ];
  const deadline = data.until
    ? `You can still change it until ${untilText(data.until)} (Accra time), when the box for its flight closes.`
    : "You can change it again until its flight is booked. We will tell you the deadline then.";

  return renderEmail(`Delivery changed: ${what}`, {
    preheader: `It now goes to ${where}.`,
    body: `
      ${eyebrow("Delivery", "green")}
      ${heading("Your delivery is changed")}
      ${paragraph(`It now goes to <strong>${escapeHtml(where)}</strong>. ${escapeHtml(deadline)}`)}
      ${summaryCard({ label: data.items.length === 1 ? "Your order" : "Your orders", title: escapeHtml(what), rows })}
      ${button(data.journeyUrl, "See your order")}
    `,
    reason: "You are getting this because you changed the delivery on your order. If that was not you, reply or message us on WhatsApp.",
  });
}
