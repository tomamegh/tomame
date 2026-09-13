import type { AdminPricingGroupRow } from "@/db/queries/admin-money";
import { formatGhsCompact, formatPercent, formatUsdCompact } from "@/features/marketing/format";

/**
 * Saying, in a table cell, what a pricing group will actually do.
 *
 * The columns are `flat_rate_ghs`, `flat_rate_expression`, `default_weight_lbs`
 * and `requires_weight`, and the relationship between them is not obvious from
 * the row: `flat_rate_expression` does not hold a formula any more — since the
 * constants moved into `pricing_constants` it only MARKS the group as
 * weight-based, and the rate and handling fee come from the admin constants
 * (see the weight branch of `PricingCalculator.calculate`). An admin reading a
 * list of groups needs that translated, not the raw columns.
 *
 * Pure and tested: a group that cannot price is the single most expensive thing
 * to get wrong on this screen, because the customer sees "needs review" instead
 * of a price.
 */

export type FreightShape = "flat" | "weight" | "unpriceable";

export function freightShape(group: AdminPricingGroupRow): FreightShape {
  if (group.flat_rate_expression != null && group.flat_rate_expression !== "") return "weight";
  if (group.flat_rate_ghs != null) return "flat";
  // Neither column set: the calculator falls through to `needs_review`, and
  // anything in this group goes to a human instead of getting a price.
  return "unpriceable";
}

export function describeFreight(group: AdminPricingGroupRow): string {
  switch (freightShape(group)) {
    case "flat":
      return `${formatGhsCompact(group.flat_rate_ghs!)} per item`;
    case "weight": {
      const fallback =
        group.default_weight_lbs != null
          ? `, ${group.default_weight_lbs} lb assumed when none is listed`
          : group.requires_weight
            ? ", and refuses to price without one"
            : ", with no fallback weight";
      return `By weight${fallback}`;
    }
    case "unpriceable":
      return "No freight set — everything in this group goes to review";
  }
}

/** "5%", or "5% up to $500, then 3%" when the group is tiered. */
export function describeValueFee(group: AdminPricingGroupRow): string {
  const base = formatPercent(group.value_percentage);
  if (group.value_percentage_high == null || group.value_threshold_usd == null) return base;
  return `${base} up to ${formatUsdCompact(group.value_threshold_usd)}, then ${formatPercent(group.value_percentage_high)}`;
}

/**
 * The sentence a deactivation confirmation shows.
 *
 * Deactivating a group with categories still pointing at it does not move those
 * categories anywhere — `getCategoryPricingMap` stops returning the group, the
 * lookup misses, and every product in those categories starts coming back as
 * "needs review". That consequence has to be stated in the categories' own
 * numbers, not as a generic warning.
 */
export function deactivationConsequence(group: AdminPricingGroupRow): string {
  if (group.category_count === 0) {
    return `No category routes to ${group.name}, so deactivating it changes no prices today. It stops being available to route to.`;
  }
  return `${group.category_count} ${group.category_count === 1 ? "category still routes" : "categories still route"} to ${group.name}. Deactivating it does not move them — every product in ${group.category_count === 1 ? "that category" : "those categories"} will come back unpriced, as "needs review", until they are pointed at another group.`;
}
