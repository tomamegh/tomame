/**
 * Extraction pipeline tunables. Everything here is server-side.
 *
 * The chain is a hedged race, cheapest → costliest (see resolvers/chain.ts):
 *
 *   structured tiers (no browser) — started in order; the next one starts as
 *   soon as the previous answers OR `hedgeAfterMs` elapses, so a slow vendor
 *   never blocks a fast one:
 *     · ScraperAPI structured endpoints — Amazon + eBay (2–5 s)
 *     · Oxylabs realtime parsed targets — Amazon, Walmart (2–6 s)
 *     · Zyte automatic product extraction — any store (1–5 s on plain HTTP)
 *     · Rainforest — Amazon (optional)
 *   category-map — store breadcrumb → Tomame category (DB lookup, Haiku on miss)
 *   HTML tiers — platform Cheerio + generic JSON-LD/OpenGraph over the page
 *   Claude structured extraction over the page text — last resort / enrichment
 *
 * Fast mode returns as soon as title + price + currency + category are known;
 * weight enrichment runs after the response.
 */
export const EXTRACTION = {
  /** Total wall-clock budget for one extraction. Vercel route maxDuration is set above this. */
  totalBudgetMs: 25_000,
  /** Structured tiers: start the next vendor if this one has not answered within this window. */
  hedgeAfterMs: 2_000,
  /** Direct HTTP fetch of the product page. */
  directFetchTimeoutMs: 8_000,
  /** Browserless headless-Chrome fetch. */
  browserlessTimeoutMs: 20_000,
  /** Zyte browser-rendered HTML fetch. */
  zyteBrowserTimeoutMs: 20_000,
  /** Zyte automatic product extraction (plain HTTP source). Etsy measured 17 s, SHEIN 42 s. */
  zyteProductTimeoutMs: 22_000,
  /** Oxylabs realtime parsed request. */
  oxylabsTimeoutMs: 12_000,
  /** Claude extraction call. */
  llmTimeoutMs: 20_000,
  /** Category classifier call (Haiku, ~1 s). */
  classifierTimeoutMs: 8_000,
  /** Apify sync actor run (seconds, Apify-side). Not in any default plan. */
  apifyRunTimeoutSeconds: 90,
  /** Rainforest product request. Documented 1–6 s; leave room for a slow one. */
  rainforestTimeoutMs: 12_000,
  /** ScraperAPI structured endpoint. Measured 2–5 s; their hard limit is 70 s. */
  scraperApiTimeoutMs: 12_000,

  /** Model used for the full-page LLM tier. Structured output over stripped page text. */
  llmModel: "claude-opus-5",
  /** Model used for category classification from title + breadcrumbs. Small prompt, must be fast. */
  classifierModel: "claude-haiku-4-5",
  /** Upper bound on page text handed to the model (characters). */
  llmMaxInputChars: 120_000,

  /** Cache TTL when the extraction is complete (title + price + currency). */
  cacheTtlCompleteMs: 6 * 60 * 60 * 1000,
  /** Cache TTL when extraction is partial — retry sooner rather than pin a bad result. */
  cacheTtlPartialMs: 15 * 60 * 1000,
} as const;

export type ExtractionSource =
  | "scraperapi"
  | "oxylabs"
  | "zyte"
  | "rainforest"
  | "category-map"
  | "platform-html"
  | "structured-data"
  | "llm"
  | "apify";
