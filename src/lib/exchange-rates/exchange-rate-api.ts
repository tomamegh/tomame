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

export class ExchangeRateApiProvider implements ExchangeRateProvider {
  public readonly name: string = "ExchangeRateApi";

  public async getRate(baseCurrency: string): Promise<number> {
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
    const rate = data.conversion_rates.GHS;

    if (!rate) {
      throw new Error(`${baseCurrency}→GHS rate not found in response`);
    }

    logger.info(`${this.name} fetched rate`, { baseCurrency, rate });
    return rate;
  }

  public async getRates(baseCurrencies: string[]): Promise<Map<string, number>> {
    const rates = new Map<string, number>();

    for (const currency of baseCurrencies) {
      const rate = await this.getRate(currency);
      rates.set(currency, rate);
    }

    return rates;
  }
}

export const exchangeRateApiProvider = new ExchangeRateApiProvider()
