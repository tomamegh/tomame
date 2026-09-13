import "server-only";

import { getActiveFixedFreightItems } from "@/db/queries/fixed-freight-items";
import { getPricingConstantsMap } from "@/db/queries/pricing-constants";
import { getCategoryPricingMap } from "@/db/queries/pricing-groups";
import { buildWorkedExample } from "@/features/marketing/services/worked-example.service";
import type { WorkedExample, WorkedExampleInput } from "@/features/marketing/types";
import { APIError } from "@/lib/auth/api-helpers";
import { PricingCalculator, type PricingConstants } from "@/lib/pricing";
import { collectMissingConstants } from "./pricing-constant-keys";

/**
 * "What would this change do?" — the pricing console's answer.
 *
 * WHY IT EXISTS. Every row in `pricing_constants` is a multiplier on the price
 * of every future quote, and the old settings screen let an admin type a new
 * number into a box and press save with no idea what it would do to a real
 * basket. This prices the Fees page's worked example — a genuine
 * `calculatePricing` run, the same engine the customer is quoted by — against
 * a set of *proposed* constants that have not been saved, so the consequence
 * of a change can be read before it is made.
 *
 * NOTHING HERE WRITES. It is a projection: the overrides live only for the
 * duration of one call.
 *
 * NO DEFAULTS. `pricing.service.ts` fills a missing constant with a literal
 * (`map.freight_rate_per_lb ?? 5`) so the customer flow keeps working; this
 * deliberately does the opposite and refuses, because the console's whole job
 * is to tell an admin the truth about the configuration. A screen that quietly
 * priced a missing row at 5 would hide exactly the gap it exists to surface.
 */

/** Builds the calculator's constants block, refusing rather than substituting. */
function toConstants(values: Record<string, number>): PricingConstants {
  const missing = collectMissingConstants(values);
  if (missing.length > 0) {
    throw new APIError(
      409,
      `Cannot price anything: ${missing.join(", ")} ${missing.length === 1 ? "has" : "have"} no value in pricing_constants. Set ${missing.length === 1 ? "it" : "them"} before relying on a quote.`,
    );
  }

  return {
    freight_rate_per_lb: values.freight_rate_per_lb!,
    handling_fee_usd: values.handling_fee_usd!,
    minimum_tax_usd: values.minimum_tax_usd!,
    fx_buffer_pct: values.fx_buffer_pct!,
    tax_pct_usa: values.tax_pct_usa!,
    tax_pct_uk: values.tax_pct_uk!,
    tax_pct_china: values.tax_pct_china!,
    minimum_chargeable_weight_lbs: values.minimum_chargeable_weight_lbs!,
    default_value_fee_pct: values.default_value_fee_pct!,
  };
}

/**
 * Price `input` with the stored constants, overridden by `overrides`.
 *
 * The groups, the category map, the fixed-freight items and the FX rate are all
 * the live ones — only the constants move — because an admin comparing two
 * numbers needs everything else to be held still.
 */
export async function previewWorkedExample(
  input: WorkedExampleInput,
  overrides: Record<string, number> = {},
): Promise<WorkedExample> {
  const [stored, categoryMap, fixedItems] = await Promise.all([
    getPricingConstantsMap(),
    getCategoryPricingMap(),
    getActiveFixedFreightItems(),
  ]);

  const calculator = new PricingCalculator();
  calculator.setConstants(toConstants({ ...stored, ...overrides }));
  calculator.setCategoryPricing(categoryMap);
  calculator.setFixedFreightItems(fixedItems);

  const breakdown = await calculator.calculate(
    {
      itemPriceUsd: input.item_price_usd,
      quantity: input.quantity,
      category: input.category,
      weightLbs: input.weight_lbs,
      productTitle: input.product_title,
      region: input.region,
    },
    // Always the live rate: a console projection is about today's pricing, not
    // about a rate some customer's quote lock froze.
    null,
  );

  return buildWorkedExample(input, breakdown);
}
