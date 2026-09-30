import { renderEmail, eyebrow, heading, paragraph, button, summaryCard, muted, link, escapeHtml } from "./layout";

/**
 * "Your package is on its way to you" — the last-mile hand-off (migration 075).
 *
 * The shortest-lived email we send: it is useful for the hour between the rider
 * leaving and the knock on the door. So it leads with the two things someone
 * waiting at home can act on — a number that rings when tapped, and a link that
 * shows the ride — and keeps everything else below them.
 *
 * NO PRICES. The customer has paid; this is about where the parcel is.
 *
 * `phoneE164` / `phoneDisplay` and `trackingUrl` are validated server-side
 * (`courierHandoffSchema`): the number is `+233XXXXXXXXX` and the link is https
 * with no credentials. They are still escaped here, because every value that
 * reaches markup is.
 */
export interface CourierDispatchedEmailData {
  orderNo: string;
  productName: string;
  quantity: number;
  /** Deep link into the customer's own order page. */
  orderUrl: string;
  courierName: string | null;
  phoneE164: string | null;
  /** `+233 24 412 3456`. */
  phoneDisplay: string | null;
  trackingUrl: string | null;
  /** "Uber", "Yango", "Bolt" — or null for an unrecognised tracking site. */
  providerName: string | null;
  /** True when this corrects an earlier message (a new link, a different rider). */
  isUpdate: boolean;
}

export function courierDispatchedTemplate(data: CourierDispatchedEmailData) {
  const product = escapeHtml(data.productName);
  const rider = data.courierName ? escapeHtml(data.courierName) : null;
  const who = rider ?? "Our rider";
  const via = data.providerName ? ` on ${escapeHtml(data.providerName)}` : "";

  const callLine =
    data.phoneE164 && data.phoneDisplay
      ? paragraph(
          `${rider ? `You can reach ${rider}` : "You can reach the rider"} on ${link(`tel:${data.phoneE164}`, escapeHtml(data.phoneDisplay))}. Tap the number to call.`,
        )
      : "";

  const cta = data.trackingUrl
    ? button(data.trackingUrl, data.providerName ? `Track your rider on ${escapeHtml(data.providerName)}` : "Track your rider")
    : button(data.orderUrl, "See your order");

  const subject = data.isUpdate
    ? `Updated rider details for ${data.orderNo}`
    : `Your package is on its way to you: ${data.orderNo}`;

  return renderEmail(subject, {
    preheader: data.trackingUrl
      ? `${data.courierName ?? "A rider"} has your package. Follow the ride live.`
      : `${data.courierName ?? "A rider"} has your package and is heading to you.`,
    body: `
      ${eyebrow(data.isUpdate ? "Rider details updated" : "Out for delivery", "green")}
      ${heading("Your package is on its way to you")}
      ${paragraph(`${who} has your package${via} and is heading to you now.${data.isUpdate ? " These details replace the ones we sent before." : ""}`)}
      ${callLine}
      ${cta}
      ${summaryCard({
        label: "Your order",
        title: product,
        rows: [
          ["Order", escapeHtml(data.orderNo)],
          data.quantity > 1 ? ["Quantity", String(data.quantity)] : null,
          rider ? ["Rider", rider] : null,
          data.phoneDisplay ? ["Rider's phone", escapeHtml(data.phoneDisplay)] : null,
        ],
      })}
      ${data.trackingUrl ? muted(`The tracking link opens ${data.providerName ? escapeHtml(data.providerName) : "the rider's tracking page"}. You can also find it on ${link(data.orderUrl, "your order page")}.`) : muted(`Everything is on ${link(data.orderUrl, "your order page")} too.`)}
    `,
    reason: `You are getting this because your Tomame order is out for delivery. You will still see this in the app if you switch emails off.`,
  });
}
