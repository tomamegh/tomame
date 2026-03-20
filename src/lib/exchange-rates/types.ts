// ── Database row type ─────────────────────────────────────────────────────────

export interface DbExchangeRate {
  id: string;
  base_currency: string;
  target_currency: string;
  rate: number;
  provider: string;
  fetched_at: string;
  created_at: string;
  updated_at: string;
}

/**
 * Exchange rate provider interface.
 * Implement this to add new providers (e.g., ExchangeRateAPI, CurrencyLayer, etc.)
 */
export interface ExchangeRateProvider {
  readonly name: string;

  /**
   * Fetch the exchange rate from a base currency to GHS.
   * @param baseCurrency - The source currency code (e.g., "USD", "GBP", "CNY")
   * @returns The exchange rate (1 baseCurrency = X GHS)
   */
  getRate(baseCurrency: string): Promise<number>;

  /**
   * Fetch multiple exchange rates to GHS in a single call (if supported).
   * @param baseCurrencies - Array of source currency codes
   * @returns Map of currency code to GHS rate
   */
  getRates(baseCurrencies: string[]): Promise<Map<string, number>>;
}

/** Standard rates needed for pricing */
export interface PricingRates {
  USD_GHS: number;
  GBP_GHS: number;
  CNY_GHS: number;
}
