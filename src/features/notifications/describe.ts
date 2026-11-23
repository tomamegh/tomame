/**
 * What a notification says to the customer: one plain title, one line of
 * detail naming the order or product, and where it leads. Pure; the bell, the
 * account page and the pop-up all read it, so a notification reads the same
 * everywhere and never as a machine slug ("Order placed admin",
 * "Parcel photo added", "Sourcing available").
 */
export interface NotificationCopy {
  title: string;
  detail: string | null;
  href: string | null;
}

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v)) ? Number(v) : null);
const ghs = (v: unknown): string | null => {
  const n = num(v);
  return n == null ? null : `GH₵${n.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};
const short = (s: string | null, max = 60): string | null => (s && s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s);
const join = (...parts: Array<string | null | false | undefined>): string | null => {
  const kept = parts.filter((p): p is string => !!p);
  return kept.length ? kept.join(" · ") : null;
};
const dayLabel = (iso: string): string =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Same-origin paths only: a JSON field must never send someone off the site. */
function safeHref(v: unknown): string | null {
  const href = str(v);
  return href && href.startsWith("/") && !href.startsWith("//") ? href : null;
}

export function describeNotification(event: string, payload: Record<string, unknown> | null | undefined): NotificationCopy {
  const p = payload ?? {};
  const product = short(str(p.product_name) ?? str(p.productName));
  const orderNo = str(p.order_no);
  const host = str(p.store_host);
  const count = num(p.order_count) ?? 0;
  const many = count > 1;
  const href = safeHref(p.href);

  switch (event) {
    case "announcement":
      return { title: str(p.title) ?? "A message from Tomame", detail: short(str(p.body), 120), href };
    case "order_placed":
      return {
        title: "Order confirmed",
        detail: join(product, ghs(p.totalGhs) && `${ghs(p.totalGhs)} paid`),
        href: href ?? (str(p.orderId) ? `/app/orders/${p.orderId}` : null),
      };
    case "order_placed_admin":
      return {
        title: "New order (staff copy)",
        detail: join(product, ghs(p.totalGhs)),
        href: str(p.orderId) ? `/admin/orders/${p.orderId}` : null,
      };
    case "payment_expired":
      return { title: "Your payment did not go through", detail: join(ghs(p.amount_ghs), "You were not charged. You can pay again from your bag."), href };
    case "order_expired_unpaid": {
      const items = num(p.item_count);
      return { title: "We closed an unpaid order", detail: join(items != null && plural(items, "item"), ghs(p.amount_ghs), "Nothing was charged"), href };
    }
    case "order_repriced":
      return { title: "The total of your unpaid order changed", detail: join(orderNo, "See the new total before you pay"), href };
    case "parcel_photo_added": {
      const photos = num(p.photo_count);
      const lbs = num(p.weight_lbs);
      return {
        title: product ? `Your ${product} is at our US hub` : "Your parcel is at our US hub",
        detail: join(orderNo, photos != null && `${plural(photos, "photo")} to check`, lbs != null && `weighed ${lbs} lb`),
        href,
      };
    }
    case "shipment_update": {
      const stage = str(p.stage_title);
      return {
        title: stage ? (many ? `${stage}: ${count} of your orders` : `${stage}${orderNo ? `: ${orderNo}` : ""}`) : "Your parcel moved",
        detail: short(str(p.message), 110),
        href,
      };
    }
    case "shipment_delay":
      return { title: orderNo && !many ? `${orderNo} is running late` : "Your parcel is running late", detail: short(str(p.message), 110), href };
    case "store_tracking_added":
      return {
        title: many ? `The store has shipped ${count} of your orders` : `The store has shipped${orderNo ? ` ${orderNo}` : " your order"}`,
        detail: str(p.delivery_on) ? `At your door by ${dayLabel(str(p.delivery_on)!)}` : "It is on its way to our US hub",
        href,
      };
    case "delivery_date_changed": {
      const on = str(p.delivery_on);
      return {
        title: many ? `New delivery date for ${count} of your orders` : `New delivery date${orderNo ? `: ${orderNo}` : ""}`,
        detail: on ? `${many ? "Their" : "Its"} flight ${p.change === "cancelled" ? "was cancelled" : "moved"}. Now by ${dayLabel(on)}` : null,
        href,
      };
    }
    case "delivery_details_changed": {
      const to = str(p.deliver_to);
      return { title: `Delivery changed${orderNo && !many ? `: ${orderNo}` : ""}`, detail: to ? `It now goes to ${to}` : null, href };
    }
    case "courier_dispatched":
      return { title: p.is_update === true ? "Your rider's details changed" : "A rider has your package", detail: orderNo, href };
    case "paste_priced":
      return { title: host ? `Your ${host} link is priced` : "Your link is priced", detail: product, href };
    case "paste_unreadable":
      return { title: host ? `We couldn't read your ${host} link` : "We couldn't read your link", detail: "Paste it again, or ask a buyer to find it", href };
    case "price_drop": {
      const drop = num(p.drop_pct);
      return {
        title: product ? `Price drop: ${product}` : "A price you're watching dropped",
        detail: join(ghs(p.current_total_ghs) && `Now ${ghs(p.current_total_ghs)} landed`, drop != null && `down ${Math.round(drop * (drop < 1 ? 100 : 1))}%`),
        href: href ?? "/app/watches",
      };
    }
    case "sourcing_available":
      return { title: product ? `We found ${product}` : "We found what you asked for", detail: short(str(p.note), 110) ?? "A buyer can get it for you. See the price.", href: href ?? "/app/watches" };
    case "sourcing_unavailable":
      return { title: product ? `We couldn't find ${product}` : "We couldn't find what you asked for", detail: short(str(p.note), 110), href: href ?? "/app/watches" };
    case "car_enquiry_answered":
      return { title: "We have answered you about a car", detail: short(str(p.carLabel)), href };
    case "car_enquiry_accepted":
      return { title: "Your offer on a car was accepted", detail: short(str(p.carLabel)), href };
    case "car_enquiry_declined":
      return { title: "Your offer on a car was declined", detail: short(str(p.carLabel)), href };
    default: {
      const words = event.replace(/_admin$/, "").replace(/_/g, " ").trim();
      return { title: words ? words.charAt(0).toUpperCase() + words.slice(1) : "Notification", detail: product, href };
    }
  }
}
