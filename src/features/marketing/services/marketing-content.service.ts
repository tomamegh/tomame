import "server-only";

import {
  getSiteContentByKind,
  getSiteContentByKinds,
  getSiteContentBySlug,
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
  getCategoryPricingMap,
  type PricingGroupRow,
} from "@/db/queries/pricing-groups";
import { PricingCalculator, type PricingConstants } from "@/lib/pricing";
import { FREIGHT_LABEL, FREIGHT_ROW_SUBLINE, PRICE_FAQS, feeRowLabel } from "@/config/price-story";
import { getGhsRate } from "@/lib/exchange-rates/service";
import { DEFAULT_FX_BUFFER_PCT, TAX_PERCENTAGE } from "@/config/pricing";
import { logger } from "@/lib/logger";
import { isSchemaMissingError } from "@/lib/supabase/errors";
import {
  formatGhs,
  formatGhsCompact,
  formatPercent,
  formatPercentDelta,
  formatUsd,
  formatUsdCompact,
} from "../format";
import {
  fillContentTokens,
  fillRowTokens,
  fillRowsTokens,
  contentTokenValues,
  shippingMethodsMarkdown,
  type ContentTokenValues,
} from "../content-tokens";
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
  /** Category → pricing group, for the freight examples priced by the engine. */
  categories: Map<string, PricingGroupRow>;
}

/**
 * Resolve every `value_source` the seeded content names.
 *
 * One round of loads feeds all five figures, so the Fees page costs four
 * queries plus the FX read, not one per row.
 */
export async function resolveMarketingFigures(): Promise<MarketingFigures> {
  const [constants, groups, zones, midMarketRate, categories] = await Promise.all([
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
    getCategoryPricingMap().catch((error: unknown) => {
      rethrowIfSchemaMissing(error);
      logger.warn("Marketing: category pricing unavailable, freight examples skipped", {
        error: String(error),
      });
      return new Map<string, PricingGroupRow>();
    }),
  ]);

  const inputs: FigureInputs = { constants, groups, zones, midMarketRate, categories };

  return {
    value_fee_pct: resolveServiceFee(inputs),
    tax_pct_usa: resolveTaxPct(inputs),
    freight_rate_per_lb: await resolveFreightExamples(inputs),
    fx_buffer_pct: resolveFxBuffer(inputs),
    delivery_from_ghs: resolveDeliveryFrom(inputs),
  };
}

/**
 * The headline service fee: `default_value_fee_pct`, published as "4% flat".
 *
 * The page promises "Tomame fee – 4% flat on the item price. No category
 * tiers." (`config/price-story.ts`). There is no "x%–y%, depending on the
 * category" qualifier any more: prod set every group to the default on
 * 2026-11-19, and a group that drifts from it is flagged in the admin pricing
 * console (`features/settings/fee-promise.ts`) rather than re-worded here.
 * `range` still carries the real spread of the active groups.
 */
function resolveServiceFee({ constants, groups }: FigureInputs): ResolvedFigure {
  const defaultPct = constants.default_value_fee_pct ?? 0.05;

  const percentages: number[] = [];
  for (const group of groups) {
    if (group.is_active === false) continue;
    percentages.push(group.value_percentage);
    if (group.value_percentage_high != null) {
      percentages.push(group.value_percentage_high);
    }
  }

  return {
    source: "value_fee_pct",
    display: formatPercent(defaultPct),
    secondary: null,
    note: "flat on the item price",
    value: defaultPct,
    unit: "percent",
    range:
      percentages.length > 0
        ? { min: Math.min(...percentages), max: Math.max(...percentages) }
        : null,
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

/** The category the per-lb worked example prefers, when its group is weight-based. */
const WEIGHT_EXAMPLE_CATEGORY = "Headphones";
/** The flat-rate group the second worked example prefers. */
const FLAT_EXAMPLE_GROUP = "baby_kids";

/**
 * Freight, as worked examples rather than a per-lb claim.
 *
 * No single per-lb figure is true for most quotes: a few groups price by
 * weight ($/lb x lb + handling per item, with a minimum weight), a dozen charge
 * a flat GH₵ rate, and the rest an expression. "GH₵74/lb" was the rate alone,
 * without the handling fee, so it was below what a 1 lb item actually pays.
 * The figure is now two quotes the real engine prices: a 1 lb item in a
 * weight-based group and one flat-rate group. Nothing is hard-coded: change a
 * constant, a group or today's rate and the examples move.
 */
async function resolveFreightExamples(inputs: FigureInputs): Promise<ResolvedFigure> {
  const { constants, categories, midMarketRate } = inputs;
  const empty: ResolvedFigure = {
    source: "freight_rate_per_lb",
    display: "On every quote",
    secondary: null,
    note: FREIGHT_ROW_SUBLINE,
    value: 0,
    unit: "ghs",
    range: null,
  };
  if (midMarketRate == null || categories.size === 0) return empty;

  const calculator = new PricingCalculator();
  calculator.setConstants(constants as Partial<PricingConstants>);
  if (calculator.missingConstants.length > 0) return empty;
  calculator.setCategoryPricing(categories);
  calculator.useGhsRates({ USD: midMarketRate });

  const entries = [...categories.entries()].filter(([, group]) => group.is_active !== false);
  const weightEntry =
    entries.find(([category, group]) => category === WEIGHT_EXAMPLE_CATEGORY && group.flat_rate_expression != null) ??
    entries.find(([, group]) => group.flat_rate_expression != null);
  const isFlat = (group: PricingGroupRow) => group.flat_rate_ghs != null && group.flat_rate_expression == null;
  const flatEntry =
    entries.find(([, group]) => group.slug === FLAT_EXAMPLE_GROUP && isFlat(group)) ??
    entries.find(([, group]) => isFlat(group));

  const freightFor = async (category: string, weightLbs: number | null): Promise<number | null> => {
    try {
      const breakdown = await calculator.calculate(
        { itemPriceUsd: 50, quantity: 1, category, weightLbs, region: "usa", fixedFreightItemId: null },
        null,
      );
      return breakdown.pricing_method === "needs_review" ? null : breakdown.flat_rate_ghs;
    } catch (error: unknown) {
      logger.warn("Marketing: freight example could not be priced", { category, error: String(error) });
      return null;
    }
  };

  const [weightGhs, flatGhs] = await Promise.all([
    weightEntry ? freightFor(weightEntry[0], 1) : Promise.resolve(null),
    flatEntry ? freightFor(flatEntry[0], null) : Promise.resolve(null),
  ]);

  const weightLine =
    weightEntry && weightGhs != null ? `1 lb ${weightEntry[0].toLowerCase()}: ${formatGhs(weightGhs)}` : null;
  const flatLine =
    flatEntry && flatGhs != null ? `${flatEntry[1].name}: flat ${formatGhsCompact(flatGhs)}` : null;
  if (!weightLine && !flatLine) return empty;

  return {
    source: "freight_rate_per_lb",
    display: "By category & weight",
    secondary: weightLine ?? flatLine,
    note: weightLine ? flatLine : null,
    value: weightGhs ?? flatGhs ?? 0,
    unit: "ghs",
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
 * door and the Weija pickup are both 0 in the seed); the note carries the
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
    display: hasFreeZone ? "free" : band != null ? formatGhsCompact(min) : "–",
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
    getPublishedContent("fee_line"),
    resolveMarketingFigures(),
  ]);

  return rows.map((row) => {
    const source = readValueSource(row);
    return {
      slug: row.slug,
      title: priceStoryTitle(source, row.title ?? "", figures),
      body: source === "freight_rate_per_lb" ? FREIGHT_ROW_BODY : (row.body ?? ""),
      icon: readString(row.data.icon),
      accent: row.data.accent === true,
      positive: row.data.positive === true,
      figure: source ? figures[source] : null,
    };
  });
}

/** The freight row's body: the headline's rule, in a sentence. */
const FREIGHT_ROW_BODY =
  "Set by category and weight, shown on every quote before you pay. Boxes consolidate, so freight per item falls as you add.";

/**
 * The fee and freight rows' titles are the shared price-story copy, not the
 * admin's `site_content` title: the wording is fixed and verbatim everywhere,
 * and the fee's percentage comes from the engine.
 */
function priceStoryTitle(
  source: MarketingValueSource | null,
  title: string,
  figures: MarketingFigures,
): string {
  if (source === "freight_rate_per_lb") return FREIGHT_LABEL;
  if (source === "value_fee_pct") return feeRowLabel(figures.value_fee_pct.value);
  return title;
}

// ── Page payloads ────────────────────────────────────────────────────────────

/**
 * Everything the landing page renders from `site_content`, in ONE query.
 * Seven kinds, seven sequential selects avoided.
 */
export async function getLandingContent(): Promise<LandingContent> {
  const [byKind, tokens] = await Promise.all([
    getSiteContentByKinds(LANDING_KINDS),
    resolveContentTokens(),
  ]);
  const fill = (rows: SiteContentRow[]) => fillRowsTokens(rows, tokens);
  return {
    faqs: withPriceFaqs(fill(byKind.faq)),
    testimonials: fill(byKind.testimonial),
    processSteps: fill(byKind.process_step),
    valueProps: fill(byKind.value_prop),
    featureCards: fill(byKind.feature_card),
    stats: fill(byKind.stat),
    trustChips: fill(byKind.trust_chip),
  };
}

/**
 * The two price questions, word for word (`config/price-story.ts`), ahead of
 * the admin's own FAQ rows. They are code, not `site_content`, because the
 * wording is a fixed promise: a row with the same slug is replaced by it rather
 * than allowed to drift. Pure; exported for its test.
 */
export function withPriceFaqs(rows: readonly SiteContentRow[]): SiteContentRow[] {
  const fixed = PRICE_FAQS.map(
    (faq, index): SiteContentRow => ({
      id: `price-faq-${faq.slug}`,
      kind: "faq",
      slug: faq.slug,
      locale: "en",
      title: faq.question,
      body: faq.answer,
      data: {},
      sort_order: index - PRICE_FAQS.length,
    }),
  );
  const slugs = new Set(PRICE_FAQS.map((faq) => faq.slug));
  return [...fixed, ...rows.filter((row) => !slugs.has(row.slug))];
}

// ── Content tokens ───────────────────────────────────────────────────────────

/**
 * Live values for the `{delivery_window}`-style tokens admins write into
 * content (`../content-tokens.ts`). A regions outage leaves every token
 * unresolved, which drops the rows that use one rather than printing a hole.
 */
export async function resolveContentTokens(): Promise<ContentTokenValues> {
  const [regions, settings] = await Promise.all([
    listRegions().catch((error: unknown) => {
      rethrowIfSchemaMissing(error);
      logger.warn("Marketing: regions unavailable, content tokens unresolved", {
        error: String(error),
      });
      return [];
    }),
    getSiteSettingsMap().catch((error: unknown) => {
      rethrowIfSchemaMissing(error);
      logger.warn("Marketing: site settings unavailable, content tokens unresolved", {
        error: String(error),
      });
      return {} as Record<string, unknown>;
    }),
  ]);
  return contentTokenValues(regions, settings);
}

/**
 * Published rows of one kind with their tokens filled — what a marketing page
 * reads instead of the raw query, so a stated delivery time always comes from
 * the region's transit days.
 */
export async function getPublishedContent(kind: SiteContentKind): Promise<SiteContentRow[]> {
  const [rows, tokens] = await Promise.all([getSiteContentByKind(kind), resolveContentTokens()]);
  return fillRowsTokens(rows, tokens);
}

/** One published row by kind + slug with its tokens filled, or null. */
export async function getPublishedContentBySlug(
  kind: SiteContentKind,
  slug: string,
): Promise<SiteContentRow | null> {
  const [row, tokens] = await Promise.all([getSiteContentBySlug(kind, slug), resolveContentTokens()]);
  return row ? fillRowTokens(row, tokens) : null;
}

/** What a policy's tokens are filled from. */
export interface PolicyTokens {
  values: ContentTokenValues;
  /** Published `shipping_method` rows, already filled. */
  shippingMethods: SiteContentRow[];
}

export async function resolvePolicyTokens(): Promise<PolicyTokens> {
  const [values, shippingMethods] = await Promise.all([
    resolveContentTokens(),
    getPublishedContent("shipping_method"),
  ]);
  return { values, shippingMethods };
}

/**
 * Policy markdown with its tokens filled: `{shipping_methods}` becomes the
 * published methods as a list (Content → Shipping methods), then
 * `{delivery_window}` the live region's window. A legal page is never
 * dropped, so a region with no transit days reads as a vague phrase instead of
 * a number.
 */
export function fillPolicyTokens(content: string, tokens: PolicyTokens): string {
  const withMethods = content.replace(/\{shipping_methods\}\n?/g, () => {
    const list = shippingMethodsMarkdown(tokens.shippingMethods);
    return list ? `${list}\n` : "";
  });
  return (
    fillContentTokens(withMethods, {
      delivery_window: tokens.values.delivery_window ?? "a few days",
      pickup_point: tokens.values.pickup_point ?? "our hub",
    }) ?? withMethods
  );
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
    supportEmail: readString(settings.support_email),
    supportReplyTime: readString(settings.support_reply_time),
    refundPromiseTitle: readString(settings.refund_promise_title),
    refundPromiseDetail: readString(settings.refund_promise_detail),
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

/**
 * Plain strings, or objects carrying a string `label` — `payment_channels`
 * became objects in 048 so the bag can pass `paystack_channel` to Paystack,
 * while the footer keeps showing the labels.
 */
function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const entry of value) {
    if (typeof entry === "string") out.push(entry);
    else if (entry && typeof entry === "object" && typeof (entry as { label?: unknown }).label === "string") {
      out.push((entry as { label: string }).label);
    }
  }
  return out;
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
