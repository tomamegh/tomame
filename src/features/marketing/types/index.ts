import type { PricingBreakdown } from "@/lib/pricing";
import type { SiteContentRow } from "@/db/queries/site-content";
import type { RegionRow } from "@/db/queries/regions";
import type { DeliveryZoneRow } from "@/db/queries/delivery-zones";

// ── Live figures ─────────────────────────────────────────────────────────────

/**
 * `site_content.data->>'value_source'` values. Each names a live, admin-owned
 * figure that the marketing page must resolve at render time rather than print
 * from copy. Seeded on the `fee_line` rows in 037_seed_marketing_content.sql.
 */
export const MARKETING_VALUE_SOURCES = [
  "value_fee_pct",
  "tax_pct_usa",
  "freight_rate_per_lb",
  "fx_buffer_pct",
  "delivery_from_ghs",
] as const;

export type MarketingValueSource = (typeof MARKETING_VALUE_SOURCES)[number];

export type MarketingFigureUnit = "percent" | "ghs_per_lb" | "ghs";

/**
 * One resolved figure, ready to render. `display` is the big number in the
 * design's idiom; `secondary` is the USD echo (GH₵ always leads, $ second);
 * `note` is the qualifier the copy needs to stay honest ("from 4%", "1 lb
 * minimum"); `value` is the raw number for anyone who needs to compute.
 */
export interface ResolvedFigure {
  source: MarketingValueSource;
  display: string;
  secondary: string | null;
  note: string | null;
  value: number;
  unit: MarketingFigureUnit;
  /** Present when a single headline number is a simplification of a range. */
  range: { min: number; max: number } | null;
}

export type MarketingFigures = Record<MarketingValueSource, ResolvedFigure>;

// ── Fee lines ────────────────────────────────────────────────────────────────

/** A `fee_line` row with its `value_source` already resolved. */
export interface FeeLine {
  slug: string;
  title: string;
  body: string;
  icon: string | null;
  /** Renders in the accent colour (the Tomame fee row). */
  accent: boolean;
  /** Renders in the positive/green colour (the free-delivery row). */
  positive: boolean;
  figure: ResolvedFigure | null;
}

// ── Settings ─────────────────────────────────────────────────────────────────

/** `site_settings` narrowed from JSONB into the shapes the footer needs. */
export interface MarketingSettings {
  whatsappNumber: string | null;
  supportHours: string | null;
  companyAddress: string | null;
  paymentChannels: string[];
}

// ── Page payloads ────────────────────────────────────────────────────────────

export interface LandingContent {
  faqs: SiteContentRow[];
  testimonials: SiteContentRow[];
  processSteps: SiteContentRow[];
  valueProps: SiteContentRow[];
  /** "Three things only a personal shopper can do" — distinct from valueProps (About). */
  featureCards: SiteContentRow[];
  stats: SiteContentRow[];
  trustChips: SiteContentRow[];
}

export interface RegionsContent {
  regions: RegionRow[];
  deliveryZones: DeliveryZoneRow[];
  /** The delivery figure the fee rows and region page share. */
  deliveryFrom: ResolvedFigure;
}

// ── Worked example (Fees page) ───────────────────────────────────────────────

/**
 * The INPUT to the Fees-page worked example. Only the input is authored; every
 * figure on the page comes back from `calculatePricing`.
 */
export interface WorkedExampleInput {
  /** "pair of headphones from the US" — the price is composed in, never typed. */
  subject: string;
  item_price_usd: number;
  quantity: number;
  category: string;
  product_title: string;
  /** Key into PRODUCT_IMAGES. null renders the striped placeholder. */
  product_image_key: string | null;
  weight_lbs: number | null;
  region: "usa" | "uk" | "china";
  /** The price chips above the table. The first is the one being priced. */
  price_presets_usd: number[];
}

export type WorkedExampleRowKey =
  | "item"
  | "tax"
  | "fee"
  | "freight"
  | "exchange_rate";

export interface WorkedExampleRow {
  key: WorkedExampleRowKey;
  /** "US sales tax 10%", "Freight · 1.2 lb, US" — percentages come from the breakdown. */
  label: string;
  /** "$298.00", "GH₵250.00 (≈ $17.32)" — GH₵ leads where the charge is in GH₵. */
  value: string;
  /** Bar width the design draws, 0–100, as a share of the item subtotal. */
  bar_pct: number;
  tone: "ink" | "muted" | "accent";
}

export interface WorkedExample {
  input: WorkedExampleInput;
  /** "A $298 pair of headphones from the US" — composed from the priced input. */
  headline: string;
  breakdown: PricingBreakdown;
  rows: WorkedExampleRow[];
  /** "GH₵5,041.16" */
  total_ghs_display: string;
  /** "≈ $349.36" */
  total_usd_display: string;
  /** "of which Tomame keeps $14.90" */
  tomame_keeps_display: string;
  /** ["$298", "$50", "$1,200"] */
  price_preset_displays: string[];
  /**
   * True when the engine could not price this input (no pricing group, missing
   * weight). Freight/total rows are meaningless then — render the fallback.
   */
  needs_review: boolean;
}

// ── Waitlist ─────────────────────────────────────────────────────────────────

export interface WaitlistJoinInput {
  email: string;
  phone?: string | null;
  regionCode: string;
  userId?: string | null;
}

export interface WaitlistJoinResult {
  status: "joined" | "already_joined";
  regionCode: string;
  regionName: string;
}
