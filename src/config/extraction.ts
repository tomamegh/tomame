/**
 * Extraction pipeline tunables. Everything here is server-side.
 *
 * The chain runs cheapest → costliest and stops as soon as the required
 * fields (title, price, currency) and weight are known:
 *
 *   0. Rainforest product API for Amazon (1 credit, 1–6 s, no browser — optional)
 *   1. direct fetch of the page (free)          ┐ HTML sources — first one that
 *   2. Browserless /unblock (headless Chrome)    ┘ returns a real product page wins
 *   → platform Cheerio parser + generic JSON-LD/OpenGraph parser (free)
 *   → Claude structured extraction over the page text (cents)
 *   → Apify community actor (cents, slow — optional, last resort)
 */
export const EXTRACTION = {
  /** Total wall-clock budget for one extraction. Vercel route maxDuration is set above this. */
  totalBudgetMs: 90_000,
  /** Direct HTTP fetch of the product page. */
  directFetchTimeoutMs: 12_000,
  /** Browserless headless-Chrome fetch. */
  browserlessTimeoutMs: 35_000,
  /** Claude extraction call. */
  llmTimeoutMs: 45_000,
  /** Apify sync actor run (seconds, Apify-side). */
  apifyRunTimeoutSeconds: 90,
  /** Rainforest product request. Documented 1–6 s; leave room for a slow one. */
  rainforestTimeoutMs: 15_000,

  /** Model used for the LLM tier. Structured output over stripped page text. */
  llmModel: "claude-opus-5",
  /** Upper bound on page text handed to the model (characters). */
  llmMaxInputChars: 120_000,

  /** Cache TTL when the extraction is complete (title + price + currency). */
  cacheTtlCompleteMs: 6 * 60 * 60 * 1000,
  /** Cache TTL when extraction is partial — retry sooner rather than pin a bad result. */
  cacheTtlPartialMs: 15 * 60 * 1000,
} as const;

export type ExtractionSource = "rainforest" | "platform-html" | "structured-data" | "llm" | "apify";
