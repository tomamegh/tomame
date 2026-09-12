import "server-only";

import {
  getSiteContentByKind,
  getSiteContentByKinds,
  type SiteContentKind,
  type SiteContentRow,
} from "@/db/queries/site-content";
import { getSiteSettingsMap } from "@/db/queries/site-settings";
import { listRegions } from "@/db/queries/regions";
import {
  listActiveDeliveryZones,
  type DeliveryZoneRow,
} from "@/db/queries/delivery-zones";
import { getPricingConstantsMap } from "@/db/queries/pricing-constants";
import {
  getAllPricingGroups,
  type PricingGroupRow,
} from "@/db/queries/pricing-groups";
import { getGhsRate } from "@/lib/exchange-rates/service";
import {
  DEFAULT_FX_BUFFER_PCT,
  DEFAULT_FREIGHT_RATE_PER_LB,
  TAX_PERCENTAGE,
} from "@/config/pricing";
import { logger } from "@/lib/logger";
import { isSchemaMissingError } from "@/lib/supabase/errors";
import {
  formatGhs,
  formatGhsCompact,
  formatPercent,
  formatPercentDelta,
  formatUsd,
  formatUsdCompact,
  roundTo2,
} from "../format";
import type {
  FeeLine,
  LandingContent,
  MarketingFigures,
  MarketingSettings,
  MarketingValueSource,
  RegionsContent,
  ResolvedFigure,
} from "../types";

// ── Live figure resolution ───────────────────────────────────────────────────

/** Kept in one place so `getLandingContent` and `getFeeLines` agree. */
const LANDING_KINDS: readonly SiteContentKind[] = [
  "faq",
  "testimonial",
  "process_step",
  "value_prop",
  "feature_card",
  "stat",
  "trust_chip",
];

interface FigureInputs {
  constants: Record<string, number>;
  groups: PricingGroupRow[];
  zones: DeliveryZoneRow[];
  /** Mid-market USD→GHS, or null when no rate is stored. */
  midMarketRate: number | null;
}

/**
 * Resolve every `value_source` the seeded content names.
 *
 * One round of loads feeds all five figures, so the Fees page costs four
 * queries plus the FX read, not one per row.
 */
export async function resolveMarketingFigures(): Promise<MarketingFigures> {
  const [constants, groups, zones, midMarketRate] = await Promise.all([
    getPricingConstantsMap().catch((error: unknown) => {
      rethrowIfSchemaMissing(error);
      logger.warn("Marketing: pricing constants unavailable, using defaults", {
        error: String(error),
      });
      return {} as Record<string, number>;
    }),
    getAllPricingGroups().catch((error: unknown) => {
      rethrowIfSchemaMissing(error);
      logger.warn("Marketing: pricing groups unavailable", {
        error: String(error),
      });
      return [] as PricingGroupRow[];
    }),
    listActiveDeliveryZones().catch((error: unknown) => {
      rethrowIfSchemaMissing(error);
      logger.warn("Marketing: delivery zones unavailable", {
        error: String(error),
      });
      return [] as DeliveryZoneRow[];
    }),
    safeGhsRate("USD"),
  ]);

  const inputs: FigureInputs = { constants, groups, zones, midMarketRate };

  return {
    value_fee_pct: resolveServiceFee(inputs),
    tax_pct_usa: resolveTaxPct(inputs),
    freight_rate_per_lb: resolveFreightRate(inputs),
    fx_buffer_pct: resolveFxBuffer(inputs),
    delivery_from_ghs: resolveDeliveryFrom(inputs),
  };
}

/**
 * The headline service fee.
 *
 * There is no single "the fee" in the engine. `pricing_groups.value_percentage`
 * is 4–8% by category, and each group may drop to `value_percentage_high`
 * above `value_threshold_usd` (seeds 030 and 032). The only admin-set scalar is
 * `pricing_constants.default_value_fee_pct` (migration 035, 0.05), which the
 * calculator uses when a fixed-freight item matches no pricing group
 * (`src/lib/pricing/calculator.ts`).
 *
 * Choice: publish `default_value_fee_pct` as the headline, and carry the real
 * min/max off the active groups in `range` plus a "from X%" note. A flat "5%"
 * on its own would be false for a 4% or an 8% category; "5%, from 4%" is true
 * of the engine as configured and stays true when an admin edits either the
 * constant or a group.
 */
function resolveServiceFee({ constants, groups }: FigureInputs): ResolvedFigure {
  const defaultPct = constants.default_value_fee_pct ?? 0.05;

  const percentages: number[] = [];
  for (const group of groups) {
    percentages.push(group.value_percentage);
    if (group.value_percentage_high != null) {
      percentages.push(group.value_percentage_high);
    }
  }

  const range =
    percentages.length > 0
      ? { min: Math.min(...percentages), max: Math.max(...percentages) }
      : null;

  const note =
    range && range.min < defaultPct ? `from ${formatPercent(range.min)}` : null;

  return {
    source: "value_fee_pct",
    display: formatPercent(defaultPct),
    secondary: null,
    note,
    value: defaultPct,
    unit: "percent",
    range,
  };
}

/**
 * US sales tax. The engine charges `tax_pct_usa` of the subtotal with a
 * `minimum_tax_usd` floor — it is not a pass-through of the store's actual
 * charge, so the note carries the floor rather than the copy claiming "at cost".
 */
function resolveTaxPct({ constants }: FigureInputs): ResolvedFigure {
  const pct = constants.tax_pct_usa ?? TAX_PERCENTAGE;
  const minimumTax = constants.minimum_tax_usd;

  return {
    source: "tax_pct_usa",
    display: formatPercent(pct),
    secondary: null,
    note:
      minimumTax != null && minimumTax > 0
        ? `${formatUsdCompact(minimumTax)} minimum`
        : null,
    value: pct,
    unit: "percent",
    range: null,
  };
}

/**
 * Freight, as the GH₵/lb the customer actually pays: the admin's USD rate at
 * today's buffered rate. GH₵ leads, the USD rate is the echo.
 */
function resolveFreightRate({
  constants,
  midMarketRate,
}: FigureInputs): ResolvedFigure {
  const ratePerLbUsd =
    constants.freight_rate_per_lb ?? DEFAULT_FREIGHT_RATE_PER_LB;
  const appliedRate = appliedFxRate(midMarketRate, constants);
  const minimumWeight = constants.minimum_chargeable_weight_lbs;

  const note =
    minimumWeight != null && minimumWeight > 0
      ? `${trimNumber(minimumWeight)} lb minimum`
      : null;

  // No stored FX rate: print the USD rate rather than a made-up cedi figure.
  if (appliedRate == null) {
    return {
      source: "freight_rate_per_lb",
      display: `${formatUsdCompact(ratePerLbUsd)}/lb`,
      secondary: null,
      note,
      value: ratePerLbUsd,
      unit: "ghs_per_lb",
      range: null,
    };
  }

  const ghsPerLb = roundTo2(ratePerLbUsd * appliedRate);
  return {
    source: "freight_rate_per_lb",
    display: `${formatGhsCompact(Math.round(ghsPerLb))}/lb`,
    secondary: `${formatUsdCompact(ratePerLbUsd)}/lb`,
    note,
    value: ghsPerLb,
    unit: "ghs_per_lb",
    range: null,
  };
}

function resolveFxBuffer({ constants }: FigureInputs): ResolvedFigure {
  const buffer = constants.fx_buffer_pct ?? DEFAULT_FX_BUFFER_PCT;
  return {
    source: "fx_buffer_pct",
    display: formatPercentDelta(buffer),
    secondary: null,
    note: "on the mid-market rate",
    value: buffer,
    unit: "percent",
    range: null,
  };
}

/**
 * Ghana-side delivery. "free" whenever any active zone costs nothing (Accra
 * door and the Osu pickup are both 0 in the seed); the note carries the
 * cheapest-to-dearest paid band so "free" is not read as "free everywhere".
 */
function resolveDeliveryFrom({ zones }: FigureInputs): ResolvedFigure {
  const paidFees = zones.map((zone) => zone.fee_ghs).filter((fee) => fee > 0);
  const hasFreeZone = zones.some((zone) => zone.fee_ghs === 0);
  const min = paidFees.length > 0 ? Math.min(...paidFees) : 0;
  const max = paidFees.length > 0 ? Math.max(...paidFees) : 0;

  const band =
    paidFees.length === 0
      ? null
      : min === max
        ? `${formatGhsCompact(min)} elsewhere`
        : `${formatGhsCompact(min)}–${formatGhsCompact(max)} elsewhere`;

  return {
    source: "delivery_from_ghs",
    display: hasFreeZone ? "free" : band != null ? formatGhsCompact(min) : "—",
    secondary: null,
    note: hasFreeZone ? band : null,
    value: min,
    unit: "ghs",
    range: paidFees.length > 0 ? { min, max } : null,
  };
}

// ── Fee lines ────────────────────────────────────────────────────────────────

/** The Fees-page rows, each carrying its resolved live figure. */
export async function getFeeLines(): Promise<FeeLine[]> {
  const [rows, figures] = await Promise.all([
    getSiteContentByKind("fee_line"),
    resolveMarketingFigures(),
  ]);

  return rows.map((row) => {
    const source = readValueSource(row);
    return {
      slug: row.slug,
      title: row.title ?? "",
      body: row.body ?? "",
      icon: readString(row.data.icon),
      accent: row.data.accent === true,
      positive: row.data.positive === true,
      figure: source ? figures[source] : null,
    };
  });
}

// ── Page payloads ────────────────────────────────────────────────────────────

/**
 * Everything the landing page renders from `site_content`, in ONE query.
 * Seven kinds, seven sequential selects avoided.
 */
export async function getLandingContent(): Promise<LandingContent> {
  const byKind = await getSiteContentByKinds(LANDING_KINDS);
  return {
    faqs: byKind.faq,
    testimonials: byKind.testimonial,
    processSteps: byKind.process_step,
    valueProps: byKind.value_prop,
    featureCards: byKind.feature_card,
    stats: byKind.stat,
    trustChips: byKind.trust_chip,
  };
}

/** "Where we buy": lanes, Ghana delivery, and the shared delivery figure. */
export async function getRegionsContent(): Promise<RegionsContent> {
  const [regions, deliveryZones, figures] = await Promise.all([
    listRegions(),
    listActiveDeliveryZones(),
    resolveMarketingFigures(),
  ]);
  return { regions, deliveryZones, deliveryFrom: figures.delivery_from_ghs };
}

/** `site_settings` JSONB narrowed to the shapes the footer needs. */
export async function getMarketingSettings(): Promise<MarketingSettings> {
  const settings = await getSiteSettingsMap().catch((error: unknown) => {
    rethrowIfSchemaMissing(error);
    logger.warn("Marketing: site settings unavailable", {
      error: String(error),
    });
    return {} as Record<string, unknown>;
  });

  return {
    whatsappNumber: readString(settings.whatsapp_number),
    supportHours: readString(settings.support_hours),
    companyAddress: readString(settings.company_address),
    paymentChannels: readStringArray(settings.payment_channels),
  };
}

/** Soft-fallback guard: let a missing relation through, swallow everything else. */
function rethrowIfSchemaMissing(error: unknown): void {
  if (isSchemaMissingError(error)) throw error;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const VALUE_SOURCE_SET: ReadonlySet<string> = new Set<MarketingValueSource>([
  "value_fee_pct",
  "tax_pct_usa",
  "freight_rate_per_lb",
  "fx_buffer_pct",
  "delivery_from_ghs",
]);

function readValueSource(row: SiteContentRow): MarketingValueSource | null {
  const raw = row.data.value_source;
  if (typeof raw !== "string" || !VALUE_SOURCE_SET.has(raw)) {
    if (raw != null) {
      logger.warn("Marketing: unknown value_source on site_content row", {
        slug: row.slug,
        value_source: String(raw),
      });
    }
    return null;
  }
  return raw as MarketingValueSource;
}

function appliedFxRate(
  midMarketRate: number | null,
  constants: Record<string, number>,
): number | null {
  if (midMarketRate == null) return null;
  const buffer = constants.fx_buffer_pct ?? DEFAULT_FX_BUFFER_PCT;
  return roundTo2(midMarketRate * (1 + buffer));
}

async function safeGhsRate(currency: string): Promise<number | null> {
  try {
    return await getGhsRate(currency);
  } catch (error: unknown) {
    rethrowIfSchemaMissing(error);
    logger.warn("Marketing: exchange rate unavailable", {
      currency,
      error: String(error),
    });
    return null;
  }
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];
}

function trimNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : String(roundTo2(value));
}

// ── Landing feature-card demonstrations ──────────────────────────────────────

/**
 * The illustrative figures behind the "One box, less freight" and "Price watch"
 * cards on the landing page.
 *
 * These are marketing ILLUSTRATIONS, not a user's real bag — signed out there is
 * no bag to read. Every number is still derived from live admin values
 * (`consolidation_saving_pct`, `box_capacity_lbs`, `freight_rate_per_lb` and the
 * buffered FX rate), so the example moves when an admin changes the knobs and can
 * never contradict what the app charges. The example weights come from the
 * seeded card rows, so they are editable too.
 *
 * Phase 4 computes the real per-bag saving from the customer's actual items.
 */
export interface FeatureDemos {
  freightBox: {
    fillPct: number;
    weightLbs: number;
    capacityLbs: number;
    savingDisplay: string;
  } | null;
  priceWatch: {
    title: string;
    dropDisplay: string;
    landedDisplay: string;
  } | null;
}

export async function getFeatureDemos(
  cards: readonly SiteContentRow[],
): Promise<FeatureDemos> {
  const [constants, ghsRate] = await Promise.all([
    getPricingConstantsMap().catch((error: unknown) => {
      rethrowIfSchemaMissing(error);
      return {} as Record<string, number>;
    }),
    getGhsRate("USD").catch((error: unknown) => {
      rethrowIfSchemaMissing(error);
      return null;
    }),
  ]);

  const capacity = constants.box_capacity_lbs ?? 0;
  const savingPct = constants.consolidation_saving_pct ?? 0;
  const ratePerLb = constants.freight_rate_per_lb ?? 0;
  const fx = ghsRate ? ghsRate * (1 + (constants.fx_buffer_pct ?? 0)) : null;

  const boxRow = cards.find((c) => c.slug === "one-box-less-freight");
  const boxWeight = numberFrom(boxRow?.data, "example_weight_lbs");

  let freightBox: FeatureDemos["freightBox"] = null;
  if (boxWeight != null && capacity > 0 && fx != null && ratePerLb > 0) {
    // Freight already committed to this box, and the share consolidation saves.
    const boxFreightGhs = boxWeight * ratePerLb * fx;
    freightBox = {
      fillPct: Math.min(100, Math.round((boxWeight / capacity) * 100)),
      weightLbs: boxWeight,
      capacityLbs: capacity,
      savingDisplay: formatGhs(boxFreightGhs * savingPct),
    };
  }

  const watchRow = cards.find((c) => c.slug === "price-watch");
  const watchTitle = stringFrom(watchRow?.data, "example_product");
  const dropUsd = numberFrom(watchRow?.data, "example_drop_usd");
  const nowUsd = numberFrom(watchRow?.data, "example_price_usd");

  let priceWatch: FeatureDemos["priceWatch"] = null;
  if (watchTitle && dropUsd != null && nowUsd != null && fx != null) {
    priceWatch = {
      title: watchTitle,
      dropDisplay: formatUsd(dropUsd),
      landedDisplay: formatGhs(nowUsd * fx),
    };
  }

  return { freightBox, priceWatch };
}

function numberFrom(data: unknown, key: string): number | null {
  if (!data || typeof data !== "object") return null;
  const v = (data as Record<string, unknown>)[key];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function stringFrom(data: unknown, key: string): string | null {
  if (!data || typeof data !== "object") return null;
  const v = (data as Record<string, unknown>)[key];
  return typeof v === "string" && v.length > 0 ? v : null;
}
