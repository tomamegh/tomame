import { renderEmail, eyebrow, heading, paragraph, button, summaryCard, callout, escapeHtml } from "./layout";

/**
 * "Your parcel moved" and "your parcel is late" (098).
 *
 * One email per customer per move. A package holding three of one customer's
 * orders sends one message listing all three, not three messages.
 *
 * The contact is printed only when staff set one for the step. A number in an
 * email is what makes "where is my parcel" a phone call instead of a support
 * queue, which is the point of the feature.
 *
 * NO MONEY and NO CARRIER NUMBERS: the customer is tracked by the Tomame order
 * number alone.
 */
export interface ShipmentUpdateEmailData {
  kind: "stage" | "delay";
  /** "Arrived in Ghana" for a stage; ignored for a delay. */
  stageTitle: string;
  /** What is happening: the stage's description, or the delay's explanation. */
  description: string;
  /** Staff's extra words on a stage move, when different from the description. */
  message: string | null;
  /** Delay only: the revised date, already formatted ("Fri 14 Nov"). */
  expectedOn: string | null;
  items: Array<{ orderNo: string; productName: string }>;
  contact: { name: string | null; phone: string; hours: string | null } | null;
  /** Deep link to the first order's journey. */
  journeyUrl: string;
}

export function shipmentUpdateTemplate(data: ShipmentUpdateEmailData) {
  const first = data.items[0];
  const what =
    data.items.length === 1 && first ? first.productName : `${data.items.length} of your orders`;
  const subject =
    data.kind === "delay" ? `A delay on ${what}` : `${data.stageTitle}: ${what}`;

  const rows = data.items.map(
    (item) => [escapeHtml(item.orderNo), escapeHtml(item.productName)] as [string, string],
  );
  if (data.expectedOn) rows.push(["New estimate", escapeHtml(data.expectedOn)]);

  const contactLine = data.contact
    ? `Questions about this step? Call or WhatsApp ${
        data.contact.name ? `<strong>${escapeHtml(data.contact.name)}</strong> on ` : ""
      }<strong>${escapeHtml(data.contact.phone)}</strong>${
        data.contact.hours ? ` (${escapeHtml(data.contact.hours)})` : ""
      }.`
    : null;

  return renderEmail(subject, {
    preheader: data.kind === "delay" ? data.description : `${data.stageTitle}. ${data.description}`,
    body: `
      ${eyebrow(data.kind === "delay" ? "Delay" : "Tracking update")}
      ${heading(data.kind === "delay" ? "Your parcel is running late" : escapeHtml(data.stageTitle))}
      ${paragraph(escapeHtml(data.description))}
      ${data.message && data.message !== data.description ? paragraph(escapeHtml(data.message)) : ""}
      ${summaryCard({ label: data.items.length === 1 ? "Your order" : "Your orders", title: escapeHtml(what), rows })}
      ${contactLine ? callout(contactLine) : ""}
      ${button(data.journeyUrl, "Track your order")}
    `,
    reason: `You are getting this because it is your order. Every step also shows on your order page, and in the app if you switch emails off.`,
  });
}
