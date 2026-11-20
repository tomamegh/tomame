/**
 * Customer-facing tracking copy (WhatsApp & tracking brief, 2026-11-20),
 * verbatim. Internal stage keys (`shipments/stages.ts`, 098) are unchanged;
 * this is only what a customer reads on /track, in emails and on WhatsApp.
 *
 * Pure: imported by server services, client components and email templates.
 */

/**
 * The brief names six customer stages. Our nine internal steps map onto them:
 * landing in Ghana and the Accra warehouse are both "Arrived in Accra — cleared"
 * (customs is inside freight, so the customer has nothing to clear), and pickup
 * keeps its own words because the brief's sixth stage is door delivery.
 */
export const CUSTOMER_STAGE_NAMES = {
  paid: "Paid — order confirmed",
  purchased: "Purchased from the store",
  hub_received: "Arrived at our US hub",
  departed: "In flight to Accra",
  arrived_country: "Arrived in Accra — cleared",
  ghana_warehouse: "Arrived in Accra — cleared",
  ready_for_pickup: "Ready for pickup",
  out_for_delivery: "Out for delivery",
  delivered: "Delivered",
} as const satisfies Record<string, string>;

export type CustomerStageKey = keyof typeof CUSTOMER_STAGE_NAMES;

/** /track's one answer for a reference or second factor that does not match. Never says which. */
export const TRACK_NOT_FOUND_MESSAGE =
  "We could not find that order. Check the order ID on your payment confirmation, or message us on WhatsApp and we will find it for you.";

/** The button under a tracked order. */
export const TRACK_WHATSAPP_CTA = "Questions about this order? Message us on WhatsApp";

/** The checkout tick. Unticked means no automated WhatsApp for that checkout's orders. */
export const WHATSAPP_OPT_IN_LABEL = "Send me WhatsApp updates about my order";

/** `wa.me/<digits>?text=…` for a site_settings number like "+233 59 442 4746". Null when unusable. */
export function waMeHref(number: string | null | undefined, text?: string | null): string | null {
  let digits = (number ?? "").replace(/\D/g, "");
  // `0XXXXXXXXX`, the national form a Ghanaian writes, is +233.
  if (digits.startsWith("0")) digits = `233${digits.slice(1)}`;
  if (digits.length < 8) return null;
  return `https://wa.me/${digits}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
}

/** The prefilled support message for one order. */
export function orderSupportMessage(reference: string): string {
  return `Hi Tomame, I have a question about my order ${reference}.`;
}
