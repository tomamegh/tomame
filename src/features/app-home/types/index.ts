import type { PricingBreakdown } from "@/lib/pricing";
import type { JourneyView } from "@/features/orders/services/journey-stage";
import type { WatchListResponse } from "@/features/watches/types";

/**
 * The Home screen view model. One typed object, assembled server-side, handed to
 * components as pure props — no component fetches anything of its own.
 */

export type TimeOfDay = "Morning" | "Afternoon" | "Evening";

export interface HomeGreeting {
  /** `profiles.first_name`, or null when the customer has not set one. */
  firstName: string | null;
  /** "Morning" | "Afternoon" | "Evening" — Accra is GMT year-round. */
  timeOfDay: TimeOfDay;
  /** Orders in `paid` | `processing` | `in_transit`. Zero is a real answer. */
  movingCount: number;
}

export interface HomeJourney {
  id: string;
  productName: string;
  productUrl: string;
  /** Raw `orders.status`, for links and analytics. Display comes from `stage`. */
  status: string;
  /** Label, stop, stage position, tone and ETA — all derived, never invented. */
  stage: JourneyView;
  /** `orders.pricing.total_ghs`; null when the order predates a priced snapshot. */
  totalGhs: number | null;
  createdAt: string;
}

/** "Live receipt · last link you pasted". */
export interface HomeReceipt {
  /** `extraction_requests.product_url`. */
  productUrl: string;
  /** Hostname without `www.`, e.g. "amazon.com". */
  storeHost: string;
  /** `extraction_requests.updated_at` — when this customer last pasted it. */
  pastedAt: string;
  productName: string | null;
  productImageUrl: string | null;
  /** Priced server-side for quantity 1 from the shared extraction snapshot. */
  pricing: PricingBreakdown | null;
  /** Why `pricing` is null (price unreadable, region unsupported, …). */
  pricingUnavailableReason: string | null;
  extractionCacheId: string | null;
}

/**
 * "Shipping from the USA" — the lane card.
 *
 * Every word is derived from `regions` rows in `home.service.ts`, never
 * written here: the heading names the live lanes, the body carries their real
 * transit band, and the waitlist clause names whichever lanes are `soon`. An
 * admin flipping UK to `live` rewrites this card with no code change.
 */
export interface HomeLanes {
  /** "Shipping from the USA". */
  heading: string;
  /** "Any US store, 14–18 days to Accra. UK and China lanes are coming soon — get notified." */
  body: string;
  /** Null when no lane is `soon` — there is then nothing to join a waitlist for. */
  waitlist: HomeLaneWaitlist | null;
}

export interface HomeLaneWaitlist {
  /** "Join the UK / China waitlist" — the arrow is the component's. */
  label: string;
  /** The existing Phase 1 waitlist forms, one per unopened lane. */
  href: string;
}

/** "Ask a buyer" — how a customer reaches a human. */
export interface HomeAskBuyer {
  /** `https://wa.me/<digits>` from `site_settings.whatsapp_number`, or null. */
  whatsappHref: string | null;
  /** `site_settings.support_hours`, e.g. "8am–10pm". Null when unset. */
  supportHours: string | null;
}

export interface HomeViewModel {
  greeting: HomeGreeting;
  /** Newest first, cancelled orders excluded. Empty array when there are none. */
  journeys: HomeJourney[];
  /** Null when the customer has pasted nothing, or the extraction has been pruned. */
  receipt: HomeReceipt | null;
  /** Null when no lane is open — there is then no truthful "shipping from" claim. */
  lanes: HomeLanes | null;
  /** Always present: the card falls back to /contact when no number is configured. */
  askBuyer: HomeAskBuyer;
  /**
   * The customer's active price watches with their derived stats. The Home card
   * shows the first few; `watching_count` is the true total behind "N watching".
   */
  watches: WatchListResponse;
  /**
   * Hours a quoted rate is held (`pricing_constants.rate_lock_hours`). Null when
   * the constant cannot be read — the "Rate locked Nh" chip is then not shown,
   * because an unbacked number is a false promise.
   */
  rateLockHours: number | null;
}
