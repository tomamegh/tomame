/** Static tax percentage — configurable via TAX_PERCENTAGE env var (default 10%) */
export const TAX_PERCENTAGE = parseFloat(process.env.TAX_PERCENTAGE ?? "0.10");

/** FX buffer percentage (4%) applied on top of mid-market rate */
export const DEFAULT_FX_BUFFER_PCT = 0.04;
