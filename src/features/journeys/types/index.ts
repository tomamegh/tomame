import type { OrderEventRow } from "@/db/queries/order-events";
import type { OrderPhotoView } from "@/features/order-photos/types";
import type { JourneyTone } from "@/features/orders/services/journey-stage";
import type { JourneyTrack, TrackStopKey } from "@/features/orders/services/journey-track";
import type { OrderPricingBreakdown, OriginCountry } from "@/features/orders/types";

/**
 * The Journeys screens' view models (`v2-journeys`, `v2-detail`).
 *
 * Assembled server-side and handed down as pure props, exactly as Home and the
 * bag do: no component fetches anything of its own, and no component does money
 * arithmetic. Every field below names a column or is derived from one — where
 * the mock shows something with no source, the field simply does not exist here
 * and the element is not drawn.
 */

// ── The list ────────────────────────────────────────────────────────────────

/** The three buckets the filter pills offer. Cancelled orders are in none of them. */
export type JourneyFilterKey = "moving" | "delivered" | "awaiting_payment";

export interface JourneyFilter {
  key: JourneyFilterKey;
  label: string;
  /** A real grouped count over `orders.status`. Zero is shown, not hidden. */
  count: number;
}

/** One dot of the "Where things are" rail, with how many parcels stand on it. */
export interface JourneyStopCount {
  key: TrackStopKey;
  label: string;
  count: number;
}

/** What the row's primary control does. */
export type JourneyCtaKind = "track" | "details" | "pay" | "buy_again";

export interface JourneyRow {
  id: string;
  /** `orders.order_no` — "TM-00042" (050). */
  orderNo: string;
  productName: string;
  productUrl: string;
  productImageUrl: string | null;
  /** Store name from the registry, or the extraction's platform. Null when neither is known. */
  store: string | null;
  createdAt: string;
  quantity: number;
  /** `orders.pricing.total_ghs`, or the admin's override. Null when no priced snapshot exists. */
  totalGhs: number | null;
  status: string;
  /** "In the air", "Being purchased" — from `journey-stage.ts`, one vocabulary. */
  stageLabel: string;
  tone: JourneyTone;
  /** Stage position on the five-stop track, 0–100. Never progress through time. */
  percent: number;
  /**
   * The line under the bar. The newest customer-visible event, else the delivery
   * window, else the stage's own hint — never an invented "lands Sat".
   */
  hint: string | null;
  cta: JourneyCtaKind;
  /** Which pill this row sits behind; null for cancelled orders, which have no pill. */
  filter: JourneyFilterKey | null;
  /** 048: set when this order was one line of a bag. */
  orderGroupId: string | null;
  /** "2 of 3 in this bag" — null unless the order belongs to a group with siblings. */
  groupPosition: { index: number; total: number } | null;
  /** True when this row's "Pay now" can open a transaction (an unpaid group, or a legacy lone order). */
  isPayable: boolean;
}

export interface JourneysViewModel {
  filters: JourneyFilter[];
  stops: JourneyStopCount[];
  /** Newest first; cancelled orders included, behind no pill. */
  rows: JourneyRow[];
  /** Total rows, so the empty state can tell "no orders" from "none in this filter". */
  count: number;
}

// ── The detail ──────────────────────────────────────────────────────────────

/** `orders.carrier` + `orders.tracking_number`, when an admin has entered them. */
export interface JourneyCarrier {
  name: string;
  trackingNumber: string | null;
  /** `order_deliveries.tracking_url` — the carrier's own page. Null when unset. */
  trackingUrl: string | null;
}

export interface JourneyEta {
  from: string | null;
  to: string | null;
  /**
   * `confirmed` — an operator set the window on the `in_transit` transition.
   * `estimated` — the pre-purchase estimate the quote showed
   * (`pricing.delivery_eta_from/to`), which is a forecast and is labelled as one.
   */
  source: "confirmed" | "estimated";
}

/** The order group's address snapshot, struck at checkout and never re-read. */
export interface JourneyDeliverTo {
  /** "Home · East Legon", or the pickup point's zone name. */
  label: string;
  kind: "door" | "pickup";
  /** The remaining address lines, for the detail rail. Empty for a pickup. */
  lines: string[];
}

/** "MTN MoMo · 28 Aug 10:20" — the payment that settled this order. */
export interface JourneyPayment {
  /** The channel's admin-configured label, or Paystack's raw channel when it is not one of ours. */
  channelLabel: string | null;
  paidAt: string;
  reference: string;
}

export interface JourneyItem {
  store: string | null;
  country: OriginCountry | null;
  /** "Black · M" from the listing. Null when the store stated none. */
  variant: string | null;
  weightLbs: number | null;
  quantity: number;
  url: string;
  imageUrl: string | null;
}

export interface JourneyDetailViewModel {
  id: string;
  orderNo: string;
  productName: string;
  status: string;
  stageLabel: string;
  tone: JourneyTone;
  /** When the order was paid, ISO — from the `payment_received` event. Null while unpaid. */
  paidAt: string | null;
  track: JourneyTrack;
  carrier: JourneyCarrier | null;
  eta: JourneyEta | null;
  deliverTo: JourneyDeliverTo | null;
  /** Customer-visible `order_events`, newest first. Empty until something happens. */
  updates: OrderEventRow[];
  /**
   * Warehouse photographs of this parcel, newest first (054) — the first sight
   * the customer gets of what was actually bought. Internal-only pictures are
   * filtered out server-side. EMPTY when nobody has photographed it yet: there
   * is no placeholder, the section is simply not drawn.
   */
  photos: OrderPhotoView[];
  /** `orders.pricing` — what the customer actually paid, as stored. */
  pricing: OrderPricingBreakdown;
  /** An admin override of the total, when one was set. */
  adminTotalGhs: number | null;
  payment: JourneyPayment | null;
  item: JourneyItem;
  /** `orders.special_instructions`. Null when the customer left none. */
  note: string | null;
  /** `https://wa.me/<digits>` from `site_settings.whatsapp_number`, or null. */
  whatsappHref: string | null;
  /** Set when the order is unpaid and can be paid from here. */
  payable: { orderGroupId: string | null } | null;
  /** Siblings bought in the same bag, so the screen can link to them. */
  groupSiblings: { id: string; orderNo: string; productName: string }[];
}
