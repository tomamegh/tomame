import { renderEmail, eyebrow, heading, paragraph, summaryCard, button, escapeHtml } from "./layout";

/**
 * "Your delivery date has changed" (Seamless Roadmap, Initiative 2): the flight
 * an order was booked on moved or was cancelled. One email per customer, every
 * affected order listed with its new door date. Dates arrive already worded
 * ("Tue 2 Dec").
 */
export interface DeliveryDateChangedEmailData {
  change: "moved" | "cancelled";
  /** The flight the orders ride now, already worded: "Delta Cargo JFK → Accra, Sat 29 Nov". */
  flight: string;
  items: Array<{ orderNo: string; productName: string; deliveryOn: string }>;
  journeyUrl: string;
}

export function deliveryDateChangedTemplate(data: DeliveryDateChangedEmailData) {
  const first = data.items[0];
  const what = data.items.length === 1 && first ? first.productName : `${data.items.length} of your orders`;
  const why =
    data.change === "cancelled"
      ? `The flight your ${data.items.length === 1 ? "order was" : "orders were"} booked on was cancelled. ${data.items.length === 1 ? "It" : "They"} now ${data.items.length === 1 ? "flies" : "fly"} on ${data.flight}.`
      : `The flight your ${data.items.length === 1 ? "order is" : "orders are"} booked on has moved. ${data.items.length === 1 ? "It" : "They"} now ${data.items.length === 1 ? "flies" : "fly"} on ${data.flight}.`;
  const rows = data.items.map((item) => [`${escapeHtml(item.orderNo)} · ${escapeHtml(item.productName)}`, `By ${escapeHtml(item.deliveryOn)}`] as const);

  return renderEmail(`New delivery date: ${what}`, {
    preheader: why,
    body: `
      ${eyebrow("Delivery date", "amber")}
      ${heading("Your delivery date has changed")}
      ${paragraph(escapeHtml(why))}
      ${summaryCard({ label: "At your door", title: escapeHtml(what), rows })}
      ${button(data.journeyUrl, "Track your order")}
    `,
    reason: "You are getting this because it is your order. The new date also shows on your order page.",
  });
}
