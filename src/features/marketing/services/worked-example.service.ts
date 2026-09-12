import "server-only";

import { calculatePricing } from "@/features/pricing/services/pricing.service";
import type { PricingBreakdown } from "@/lib/pricing";
import { getSiteSettingsMap } from "@/db/queries/site-settings";
import { logger } from "@/lib/logger";
import { workedExampleInputSchema } from "../schema";
import {
  formatGhs,
  formatPercent,
  formatUsd,
  formatUsdCompact,
  toBarPct,
} from "../format";
import type {
  WorkedExample,
  WorkedExampleInput,
  WorkedExampleRow,
} from "../types";

/**
 * The Fees-page worked example.
 *
 * The mock prints a static $298 table. Everything below the input line is a
 * real `calculatePricing` call instead, so the page cannot drift from the
 * engine: change a pricing group, a constant or the FX rate and the table
 * moves with it.
 *
 * Only the INPUT is authored. It defaults to the constant here and is
 * overridden by `site_settings.fees_worked_example` once an admin sets one.
 */
export const DEFAULT_WORKED_EXAMPLE_INPUT: WorkedExampleInput = {
  subject: "pair of headphones from the US",
  item_price_usd: 298,
  quantity: 1,
  // Maps to the `phone_accessories` pricing group (030_seed_pricing_groups.sql).
  category: "Headphones",
  product_title: "Wireless noise-cancelling headphones",
  product_image_key: null,
  weight_lbs: 1.2,
  region: "usa",
  price_presets_usd: [298, 50, 1200],
};

/** `site_settings` key holding an admin-authored override of the input above. */
export const WORKED_EXAMPLE_SETTING_KEY = "fees_worked_example";

const REGION_TAX_LABEL: Record<WorkedExampleInput["region"], string> = {
  usa: "US sales tax",
  uk: "UK VAT",
  china: "Store tax",
};

const REGION_SHORT: Record<WorkedExampleInput["region"], string> = {
  usa: "US",
  uk: "UK",
  china: "CN",
};

/**
 * Price the example and lay out the rows the design draws.
 *
 * @param priceUsdOverride one of the price chips, when the visitor picks a
 *   different one. Ignored unless it is a positive number.
 */
export async function getFeesWorkedExample(
  priceUsdOverride?: number,
): Promise<WorkedExample> {
  const authored = await loadWorkedExampleInput();
  const input: WorkedExampleInput =
    priceUsdOverride != null && priceUsdOverride > 0
      ? { ...authored, item_price_usd: priceUsdOverride }
      : authored;

  const breakdown = await calculatePricing({
    itemPriceUsd: input.item_price_usd,
    quantity: input.quantity,
    category: input.category,
    weightLbs: input.weight_lbs,
    productTitle: input.product_title,
    region: input.region,
  }, null);

  return buildWorkedExample(input, breakdown);
}

// ── Layout ───────────────────────────────────────────────────────────────────

/** Pure: breakdown → display rows. Exported so it is testable without the DB. */
export function buildWorkedExample(
  input: WorkedExampleInput,
  breakdown: PricingBreakdown,
): WorkedExample {
  const needsReview = breakdown.pricing_method === "needs_review";
  const subtotalUsd = breakdown.subtotal_usd;

  // Freight is a GHS charge added after conversion (calculator.ts). Weight-based
  // groups also report the pre-conversion USD; flat/fixed groups do not, so we
  // derive the USD echo from the applied rate.
  const freightUsd =
    breakdown.freight_usd ??
    (breakdown.exchange_rate > 0
      ? breakdown.flat_rate_ghs / breakdown.exchange_rate
      : 0);

  // Everything charged in USD, converted: total minus the GHS-side freight.
  const usdComponentGhs = breakdown.total_ghs - breakdown.flat_rate_ghs;

  const rows: WorkedExampleRow[] = [
    {
      key: "item",
      label: "Item",
      value: formatUsd(subtotalUsd),
      bar_pct: 100,
      tone: "ink",
    },
    {
      key: "tax",
      label: `${REGION_TAX_LABEL[input.region]} ${formatPercent(breakdown.tax_percentage)}`,
      value: formatUsd(breakdown.tax_usd),
      bar_pct: toBarPct(breakdown.tax_usd, subtotalUsd),
      tone: "muted",
    },
    {
      key: "fee",
      label: `Tomame fee ${formatPercent(breakdown.value_fee_percentage)}`,
      value: formatUsd(breakdown.value_fee_usd),
      bar_pct: toBarPct(breakdown.value_fee_usd, subtotalUsd),
      tone: "accent",
    },
    {
      key: "freight",
      label: freightLabel(input, breakdown),
      value: `${formatGhs(breakdown.flat_rate_ghs)} (≈ ${formatUsd(freightUsd)})`,
      bar_pct: toBarPct(freightUsd, subtotalUsd),
      tone: "muted",
    },
    {
      key: "exchange_rate",
      label: `Rate · 1 USD = ${breakdown.exchange_rate}`,
      value: `${formatGhs(usdComponentGhs)} + freight`,
      // The rate is not a charge — the design draws an empty track here.
      bar_pct: 0,
      tone: "muted",
    },
  ];

  const totalUsd =
    breakdown.exchange_rate > 0
      ? breakdown.total_ghs / breakdown.exchange_rate
      : 0;

  return {
    input,
    headline: `A ${formatUsdCompact(input.item_price_usd)} ${input.subject}`,
    breakdown,
    rows,
    total_ghs_display: formatGhs(breakdown.total_ghs),
    total_usd_display: `≈ ${formatUsd(totalUsd)}`,
    tomame_keeps_display: `of which Tomame keeps ${formatUsd(breakdown.value_fee_usd)}`,
    price_preset_displays: input.price_presets_usd.map(formatUsdCompact),
    needs_review: needsReview,
  };
}

function freightLabel(
  input: WorkedExampleInput,
  breakdown: PricingBreakdown,
): string {
  const weight = breakdown.weight_lbs ?? input.weight_lbs;
  const region = REGION_SHORT[input.region];
  return weight != null ? `Freight · ${weight} lb, ${region}` : `Freight · ${region}`;
}

// ── Input loading ────────────────────────────────────────────────────────────

async function loadWorkedExampleInput(): Promise<WorkedExampleInput> {
  let raw: unknown;
  try {
    const settings = await getSiteSettingsMap();
    raw = settings[WORKED_EXAMPLE_SETTING_KEY];
  } catch (error: unknown) {
    logger.warn("Marketing: site settings unavailable for worked example", {
      error: String(error),
    });
    return DEFAULT_WORKED_EXAMPLE_INPUT;
  }

  if (raw == null) return DEFAULT_WORKED_EXAMPLE_INPUT;

  const parsed = workedExampleInputSchema.safeParse(raw);
  if (!parsed.success) {
    logger.warn("Marketing: invalid fees_worked_example setting, using default", {
      issue: parsed.error.issues[0]?.message ?? "invalid",
    });
    return DEFAULT_WORKED_EXAMPLE_INPUT;
  }

  const value = parsed.data;
  return {
    ...value,
    price_presets_usd:
      value.price_presets_usd.length > 0
        ? value.price_presets_usd
        : [value.item_price_usd],
  };
}
