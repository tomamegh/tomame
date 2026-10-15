/**
 * Freight inspector tunables (server-side). The inspector checks the
 * calculator's freight decision once per product, in the background after the
 * quote is shown, and may correct its INPUTS (category, weight, fixed-freight
 * item) — never a price. See `src/features/pricing/services/freight-inspector.service.ts`.
 */
export const FREIGHT_INSPECTOR = {
  /**
   * The primary model, through OpenRouter (`OPENROUTER_API_KEY`). Flash-Lite
   * with a web search found real listings for eBay car parts that Haiku had
   * rubber-stamped at a 1 lb placeholder (2026-10-15 probe: ~$0.008 a check,
   * 4–9 s). The fallbacks are tried by OpenRouter when the first is rate-limited.
   */
  openRouterModels: ["google/gemini-3.1-flash-lite", "google/gemini-2.5-flash-lite"],
  /**
   * OpenRouter's web plugin. Exa at 3 results is ~5x cheaper than the model's
   * native Google grounding and found the same class of listings in the probe.
   * Only used when the store listed no weight (or one out of range): a listed,
   * plausible weight is sanity-checked without a search.
   */
  webSearch: { engine: "exa", maxResults: 3 },
  /** Used only when OpenRouter is not configured. It has no web search. */
  fallbackModel: "claude-haiku-4-5",
  /** Deadline on one background check, search included. */
  timeoutMs: 25_000,
  /**
   * Freight above this multiple of the item's GHS value is a risk signal for a
   * flat-rate decision. Weight-priced decisions are always checked.
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
  maxOutputTokens: 600,
  /** Source URLs kept on the stored inspection, for admins. */
  maxSources: 5,
} as const;
