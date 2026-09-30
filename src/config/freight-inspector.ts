/**
 * Freight inspector tunables (server-side). The inspector is a Haiku pass that
 * checks the calculator's freight decision once per product at extraction time
 * and may correct its INPUTS (category, weight, fixed-freight item) — never a
 * price. See `src/features/pricing/services/freight-inspector.service.ts`.
 */
export const FREIGHT_INSPECTOR = {
  /** Small, fast model; the prompt is a few hundred tokens. */
  model: "claude-haiku-4-5",
  /** Hard deadline on the model call. On timeout the product prices deterministically. */
  timeoutMs: 3_500,
  /**
   * Only a decision with a risk signal costs a model call (see `riskSignals`).
   * Freight above this multiple of the item's GHS value is one of them.
   */
  maxFreightToItemRatio: 3,
  /** A listed weight outside these bounds, in pounds, is one too. */
  plausibleWeightLbs: { min: 0.05, max: 150 },
  /** A correction below this confidence is ignored (the decision stands). */
  minConfidence: 0.7,
  /** Bounds on a model-supplied weight, in pounds. */
  minWeightLbs: 0.01,
  maxWeightLbs: 300,
  /** Cap on fixed-freight items listed in the prompt. */
  maxFixedItemsInPrompt: 80,
  maxOutputTokens: 300,
} as const;
