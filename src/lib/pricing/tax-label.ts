/**
 * What the sales-tax line on a receipt is allowed to say.
 *
 * THE BUG THIS EXISTS TO STOP. `PricingBreakdown` carries two tax fields that
 * disagree whenever the floor binds: `tax_percentage` is the NOMINAL rate the
 * calculator started from, and `tax_usd` is what was actually charged after
 * `Math.max(rawTax, minimum_tax_usd)` (calculator.ts). Six surfaces — the
 * live receipt, the bag, the quote review, the paid-order rows, the homepage
 * worked example and the order email — each built their own label out of
 * `tax_percentage`, so a $6.78 item was billed $2.00 under a line that read
 * "10% sales tax". That is 29.5%, on the screen where money is taken, on a
 * brand whose promise is "every one of them is on your receipt before you
 * pay". Release QA, 2026-09-15, called it the one blocker in the release and
 * was right to.
 *
 * NOTHING NEW IS STORED. Whether the floor bound is DERIVED from the two
 * fields every breakdown already has, so this reads correctly for orders paid
 * before the fix as well as for quotes struck after it — `orders.pricing` is a
 * JSONB snapshot and a new field would have been absent from every historical
 * row, which is exactly where an honest receipt matters most.
 *
 * WHAT IT DOES NOT DO. The floor is still described as tax, and a minimum is
 * not a pass-through of what the store charged. Whether it belongs in the
 * Tomame fee instead is a pricing decision for the business, not a labelling
 * one; this module only stops the screen from claiming a percentage that was
 * not applied. `/fees` already published the floor (`resolveTaxPct` in
 * marketing-content.service.ts) — the marketing page was honest and the
 * receipt was not.
 */

/** The three fields the decision needs. Any breakdown or stored order has them. */
export interface TaxFacts {
  subtotal_usd: number;
  tax_percentage: number;
  tax_usd: number;
}

/**
 * Did the minimum decide this charge, rather than the rate?
 *
 * Compares the charge against the rate applied to the subtotal, ROUNDED THE
 * WAY THE CALCULATOR ROUNDS IT, then allows half a cent for float noise. The
 * half cent is not slop: it makes the answer "no" in the boundary case where
 * the rate and the floor land on the same figure — 10% of $19.95 is $2.00, the
 * floor changes nothing, and "10% sales tax" is the true label there.
 *
 * Returns false on a non-finite or zero subtotal rather than guessing: with
 * nothing to take a percentage of there is no floor to detect.
 *
 * A ZERO RATE IS NOT AN EXIT. The floor is `max(rate, minimum)`, so a lane
 * configured with no sales tax at all still charges $2.00, and that is the
 * case where claiming a percentage is most obviously wrong — "0% sales tax"
 * printed beside $2.00. The guard is therefore `rate >= 0`: at zero, `byRate`
 * is zero and the comparison below does exactly the right thing.
 */
export function taxFloorApplied(pricing: TaxFacts): boolean {
  const { subtotal_usd: subtotal, tax_percentage: rate, tax_usd: charged } = pricing;
  if (!Number.isFinite(subtotal) || !Number.isFinite(rate) || !Number.isFinite(charged)) return false;
  if (!(subtotal > 0) || !(rate >= 0)) return false;
  const byRate = Math.round(subtotal * rate * 100) / 100;
  return charged - byRate > 0.005;
}

/**
 * The minimum itself, read back off a line the floor bound.
 *
 * When the floor binds, `tax_usd` IS the minimum — that is what `Math.max`
 * returning the floor means — so the figure can be printed without the
 * constant being plumbed through to the browser. Null when no line was
 * floored, which is the caller's signal to print the rate instead.
 */
export function taxFloorUsd(lines: readonly TaxFacts[]): number | null {
  const floored = lines.find(taxFloorApplied);
  return floored ? floored.tax_usd : null;
}

/**
 * The label for a single line's tax row.
 *
 * `noun` is the surface's own wording — "sales tax", "US sales tax", "tax" —
 * so each screen keeps its voice; only the QUALIFIER is decided here, and it
 * is decided once.
 *
 * A non-finite rate drops the percentage rather than printing "NaN%": a row
 * can carry a real charge with no usable rate beside it, and the bare noun is
 * the honest thing to show there.
 */
export function taxRowLabel(pricing: TaxFacts, noun: string): string {
  if (taxFloorApplied(pricing)) {
    return `${capitalise(noun)} (min. ${formatUsd(pricing.tax_usd)})`;
  }
  if (!Number.isFinite(pricing.tax_percentage)) return capitalise(noun);
  return `${formatPercent(pricing.tax_percentage)} ${noun}`;
}

/**
 * The label for a tax row summed over several lines — the bag, and a
 * consolidated order.
 *
 * A group is the case the single-line form cannot cover honestly: two items
 * where one was floored and one was not add up to a figure that is neither the
 * rate nor the minimum (QA's example: $49.47 of items, "Sales tax 10%",
 * $6.00 charged, 12.1% effective). So when ANY line was floored the label
 * states the whole rule — "10%, min. $2.00 per product" — which is true of
 * every line in the group whichever side of the floor it fell.
 *
 * "PER PRODUCT", NOT "PER ITEM", and the difference is money. The calculator
 * compares the floor against `subtotal_usd`, which is already price ×
 * quantity, so the minimum is charged ONCE for a line however many units it
 * holds. The bag counts "items" as sum(quantity), so "min. $2.00 per item"
 * beside a line of three would have a customer expecting $6.00 of tax where
 * $2.00 was charged.
 *
 * `percentage` is the rate shared by the lines, or null when they disagree;
 * the caller already works that out to decide its own row.
 */
export function taxGroupRowLabel(
  lines: readonly TaxFacts[],
  percentage: number | null,
  noun: string,
): string {
  const floor = taxFloorUsd(lines);
  if (floor == null) {
    if (percentage == null || !Number.isFinite(percentage)) return capitalise(noun);
    return `${formatPercent(percentage)} ${noun}`;
  }
  const rule =
    percentage != null && Number.isFinite(percentage)
      ? `${formatPercent(percentage)}, min. ${formatUsd(floor)} per product`
      : `min. ${formatUsd(floor)} per product`;
  return `${capitalise(noun)} (${rule})`;
}

// ── Formatting ───────────────────────────────────────────────────────────────
// Local rather than imported: this module is pulled in by an email template
// that runs outside React and by browser components, so it stays dependency
// free. These two are the same shapes the rest of the app prints.

/** 0.1 → "10%", 0.075 → "7.5%". Trailing zeros trimmed. */
function formatPercent(fraction: number): string {
  const pct = fraction * 100;
  return `${Number.isInteger(pct) ? pct : Number(pct.toFixed(2))}%`;
}

/** 2 → "$2.00". */
function formatUsd(value: number): string {
  return `$${value.toFixed(2)}`;
}

function capitalise(noun: string): string {
  return noun.charAt(0).toUpperCase() + noun.slice(1);
}
