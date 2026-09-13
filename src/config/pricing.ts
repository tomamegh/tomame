/** Static tax percentage — configurable via TAX_PERCENTAGE env var (default 10%) */
export const TAX_PERCENTAGE = parseFloat(process.env.TAX_PERCENTAGE ?? "0.10");

/** FX buffer percentage (4%) applied on top of mid-market rate */
export const DEFAULT_FX_BUFFER_PCT = 0.04;

/** Fallbacks for weight-based freight when pricing_constants cannot be read. Admin values live in the DB. */
export const DEFAULT_FREIGHT_RATE_PER_LB = 5;
export const DEFAULT_HANDLING_FEE_USD = 3;

/**
 * `pricing_constants` key holding the price-drop alert threshold (migration
 * 052). Deliberately only the KEY — there is no fallback value here, and that
 * is the point: a drop threshold that lives in code cannot be tuned without a
 * deploy, and a wrong one either spams every customer nightly or silences a
 * real price cut. When the row is absent or out of range the job sends nothing
 * and says so in the log.
 */
export const PRICE_DROP_NOTIFY_PCT_KEY = "price_drop_notify_pct";
