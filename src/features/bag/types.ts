import type { PricingBreakdown } from "@/lib/pricing";
import type { OriginCountry } from "@/features/orders/types";

/**
 * A line whose product is still being read (049).
 *
 * The customer added a link before anyone knew what it was, which is the point:
 * they can walk away. The line holds its place in the bag, shows the URL it came
 * from, and prices itself the moment the extraction lands.
 */
export interface BagLinePending {
  request_id: string;
  /** `failed` is a dead end the screen answers with the describe-it form. */
  status: "pending" | "running" | "failed";
  /** Customer-readable; set only when `status` is `failed`. */
  error: string | null;
  /** When the paste was queued, ISO. The screen strikes its 5 s / 20 s marks from this, not from its own mount. */
  queued_at: string;
  /**
   * True when the customer has already described this link to a buyer and that
   * request is still open. The row then says so and stops offering the form.
   */
  assisted_open: boolean;
}

/**
 * A line held for a person to answer (065).
 *
 * The item could not be priced by the engine — an unknown store, an unsupported
 * region, a category with no freight rule — so instead of a dead "Pay GH₵0.00"
 * the line sits here while a buyer looks it up. `available` means the buyer
 * attached a price and the line now prices like any other; nothing else in the
 * bag needs to know that a human filled the gap.
 */
export interface BagLineSourcing {
  watch_id: string;
  status: "requested" | "available" | "unavailable";
  /** The buyer's message to the customer: what they found, or why not. */
  note: string | null;
  /** When a buyer answered, ISO. Null while it is still in the queue. */
  reviewed_at: string | null;
}

/** One line of the bag, re-priced on every read from the server-owned snapshot. */
export interface BagLine {
  id: string;
  /** Null until the paste has been read; `pending` then says where it has got to. */
  extraction_cache_id: string | null;
  /** Non-null while the product is still unknown. */
  pending: BagLinePending | null;
  quantity: number;
  special_instructions: string | null;
  product: {
    title: string | null;
    image: string | null;
    url: string;
    /** Store slug from the extraction (`ExtractionResult.platform`). */
    store: string | null;
    /** Colour/size text from the listing, or null. Never invented. */
    variant: string | null;
    weight_lbs: number | null;
    country: OriginCountry | null;
  };
  /** Null when the line cannot be priced right now; `pricing_unavailable_reason` says why. */
  pricing: PricingBreakdown | null;
  pricing_unavailable_reason: string | null;
  /** The quote screen's gap-fillers, echoed so the bag can show what the customer supplied. */
  gap_price_usd: number | null;
  gap_origin_country: OriginCountry | null;
  /**
   * A buyer's verified item price (065). Outranks the snapshot, which is what
   * separates it from `gap_price_usd`; checkout hands it to order intake so the
   * ORDER is struck on the same number the bag showed.
   */
  sourced_price_usd: number | null;
  /** Non-null when a buyer is (or was) answering this line by hand. */
  sourcing: BagLineSourcing | null;
}

/** One consolidation box in the bag, as the customer sees it. All derived server-side. */
export interface BagBox {
  id: string;
  /** "Box 1" — from `consolidation_boxes.label`. */
  label: string;
  region_code: string;
  region_name: string;
  /** ISO; when the box flies. Null when the region has no departure schedule. */
  departs_at: string | null;
  cutoff_at: string | null;
  capacity_lbs: number;
  weight_lbs: number;
  fill_pct: number;
  headroom_lbs: number;
  line_ids: string[];
  /** Freight (ex handling) the box carries, GHS. */
  freight_ghs: number;
  saving_ghs: number;
  /** What one more line like the ones already in it would add to the saving. 0 when it would not fit. */
  marginal_saving_ghs: number;
  /** Σ quantity over the box's lines — "2 items · 5.4 lb of 9 lb". */
  item_count: number;
  /** How many of the box's lines have no listed weight; the copy says "one"/"two"/"N items". */
  unweighed_line_count: number;
  has_unweighed_lines: boolean;
}

/** Where the bag goes, as chosen on the cart (`carts.delivery_address_id` / `delivery_zone_id`). */
export interface BagDelivery {
  kind: "door" | "pickup";
  /** Door only: the `delivery_addresses` row. */
  address_id: string | null;
  zone_id: string;
  zone_name: string;
  /** "Home · East Legon" or the pickup zone's name. */
  label: string;
  fee_ghs: number;
}

/** A checked-out bag whose payment has not gone through yet — offered again on an empty bag. */
export interface PendingGroupSummary {
  id: string;
  item_count: number;
  total_ghs: number;
}

/** What `POST /api/cart/checkout` returns: the group one payment buys. */
export interface CheckoutResult {
  order_group_id: string;
  order_ids: string[];
  item_count: number;
  total_ghs: number;
  total_pesewas: number;
  status: "pending" | "paid" | "cancelled";
}

export interface BagView {
  /** The chosen delivery, or null when the customer has not picked one yet. */
  delivery: BagDelivery | null;
  /** The zone's fee, charged once per checkout. 0 when no delivery is chosen. */
  delivery_fee_ghs: number;
  cart_id: string | null;
  lines: BagLine[];
  /** Lines packed into boxes by region, in bag order. */
  boxes: BagBox[];
  /** Lines that could not be boxed (no price or no region). */
  unboxed_line_ids: string[];
  /** Σ box savings, already subtracted from `total_ghs`. */
  consolidation_saving_ghs: number;
  /** `consolidation_saving_pct`, for the label. */
  consolidation_saving_pct: number;
  /** `sum(quantity)` — the nav badge. */
  item_count: number;
  /** Money roll-ups over the priced lines. `total_ghs` is net of the box saving and includes `delivery_fee_ghs`. */
  subtotal_usd: number;
  tax_usd: number;
  fee_usd: number;
  freight_ghs: number;
  /** Σ chargeable weight over the boxes, for "1 box, 5.4 lb". */
  boxed_weight_lbs: number;
  total_ghs: number;
  total_usd: number;
  /** Earliest lock expiry across the lines, ISO; null when nothing is locked. */
  rate_locked_until: string | null;
  /** True when at least one line has no pricing. */
  has_unpriced_lines: boolean;
  /** True while any line is still being read. Checkout is refused until it clears. */
  has_pending_lines: boolean;
  /**
   * True while a line is waiting on a buyer, or a buyer has said we cannot get
   * it. Checkout is refused either way, and separately from `has_unpriced_lines`
   * so the screen can say which of the two is true — "a person is looking at
   * this" and "we could not price this" are different promises.
   */
  has_sourcing_lines: boolean;
}

export interface AddToBagResult {
  line: BagLine;
  item_count: number;
  /** False when the product was already in the bag and its quantity was raised. */
  created: boolean;
}
