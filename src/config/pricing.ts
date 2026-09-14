/**
 * NOT PRICING FALLBACKS. Nothing in this file may stand in for a
 * `pricing_constants` row on a path that quotes a customer: an unconfigured
 * constant makes `PricingCalculator` return `needs_review`, never a total
 * built from a literal chosen here.
 *
 * What survives below are illustration figures for pages that must render
 * *something* when the table cannot be read — the marketing copy and the
 * "roughly this much" strip on the public home page. Being approximately
 * wrong in prose is a cosmetic problem; being approximately wrong on a quote
 * is charging the wrong amount.
 */

/** Display-only tax percentage for marketing copy. Real tax comes from `tax_pct_*`. */
export const TAX_PERCENTAGE = parseFloat(process.env.TAX_PERCENTAGE ?? "0.10");

/** Display-only FX buffer for the marketing rate strip. Real buffer is `fx_buffer_pct`. */
export const DEFAULT_FX_BUFFER_PCT = 0.04;

/** Display-only $/lb for the "how pricing works" copy. Real rate is `freight_rate_per_lb`. */
export const DEFAULT_FREIGHT_RATE_PER_LB = 5;

/**
 * `pricing_constants` key holding the price-drop alert threshold (migration
 * 052). Deliberately only the KEY — there is no fallback value here, and that
 * is the point: a drop threshold that lives in code cannot be tuned without a
 * deploy, and a wrong one either spams every customer nightly or silences a
 * real price cut. When the row is absent or out of range the job sends nothing
 * and says so in the log.
 */
export const PRICE_DROP_NOTIFY_PCT_KEY = "price_drop_notify_pct";
