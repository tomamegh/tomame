/** Static tax percentage — configurable via TAX_PERCENTAGE env var (default 10%) */
export const TAX_PERCENTAGE = parseFloat(process.env.TAX_PERCENTAGE ?? "0.10");

/** FX buffer percentage (4%) applied on top of mid-market rate */
export const DEFAULT_FX_BUFFER_PCT = 0.04;

/** Fallbacks for weight-based freight when pricing_constants cannot be read. Admin values live in the DB. */
export const DEFAULT_FREIGHT_RATE_PER_LB = 5;
export const DEFAULT_HANDLING_FEE_USD = 3;
