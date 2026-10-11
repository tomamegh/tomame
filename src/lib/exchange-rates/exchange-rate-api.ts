import { logger } from "../logger";
import { getApiKey } from "../utils";
import { ExchangeRateProvider } from "./types";

const EXCHANGE_RATE_API_URL = "https://v6.exchangerate-api.com/v6";

interface ExchangeRateAPIResponse {
  result: string;
  documentation: string;
  terms_of_use: string;
  time_last_update_unix: number;
  time_last_update_utc: string;
  time_next_update_unix: number;
  time_next_update_utc: string;
  base_code: string;
  conversion_rates: Record<string, number>;
}

/**
 * Every X→GHS rate from ONE USD-based table: USD→GHS directly, the rest as
 * GHS-per-USD ÷ X-per-USD. The provider's own `latest/GBP` is the same cross
 * computed on their side, so nothing is priced differently; it just costs one
 * request per refresh instead of one per currency. The free plan is 1,500
 * requests a month shared by dev and prod, and six currencies six times a day
 * on two deployments spent it by mid-month.
 */
export function crossRatesToGhs(usdTable: Record<string, number>, baseCurrencies: string[]): Map<string, number> {
  const ghsPerUsd = usdTable.GHS;
  const rates = new Map<string, number>();
  if (!(typeof ghsPerUsd === "number" && Number.isFinite(ghsPerUsd) && ghsPerUsd > 0)) return rates;
  for (const currency of baseCurrencies) {
    const code = currency.toUpperCase();
    if (code === "USD") {
      rates.set(code, ghsPerUsd);
      continue;
    }
    const perUsd = usdTable[code];
    if (typeof perUsd === "number" && Number.isFinite(perUsd) && perUsd > 0) rates.set(code, ghsPerUsd / perUsd);
  }
  return rates;
}

export class ExchangeRateApiProvider implements ExchangeRateProvider {
  public readonly name: string = "ExchangeRateApi";

  private async fetchTable(baseCurrency: string): Promise<Record<string, number>> {
    const apiKey = getApiKey("EXCHANGE_RATE_API_KEY");

    const res = await fetch(
      `${EXCHANGE_RATE_API_URL}/${apiKey}/latest/${baseCurrency}`,
    );

    if (!res.ok) {
      const error = await res.text();
      logger.error(`${this.name} request failed`, {
        baseCurrency,
        status: res.status,
        error,
      });
      throw new Error(`${this.name} error: ${res.status}`);
    }

    const data: ExchangeRateAPIResponse = await res.json();
    if (!data.conversion_rates || typeof data.conversion_rates !== "object") {
      throw new Error(`${this.name}: no conversion table for ${baseCurrency}`);
    }
    return data.conversion_rates;
  }

  public async getRate(baseCurrency: string): Promise<number> {
    const rate = (await this.fetchTable(baseCurrency)).GHS;

    if (!rate) {
      throw new Error(`${baseCurrency}→GHS rate not found in response`);
    }

    logger.info(`${this.name} fetched rate`, { baseCurrency, rate });
    return rate;
  }

  /** One request for every currency: the USD table, crossed to GHS. */
  public async getRates(baseCurrencies: string[]): Promise<Map<string, number>> {
    const rates = crossRatesToGhs(await this.fetchTable("USD"), baseCurrencies);
    if (rates.size === 0) throw new Error(`${this.name}: USD→GHS rate not found in response`);
    logger.info(`${this.name} fetched rates`, { currencies: [...rates.keys()], requests: 1 });
    return rates;
  }
}

export const exchangeRateApiProvider = new ExchangeRateApiProvider()
