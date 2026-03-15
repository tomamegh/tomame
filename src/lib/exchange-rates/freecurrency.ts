import { logger } from "@/lib/logger";
import type { ExchangeRateProvider } from "./types";

const FREECURRENCY_API_URL = "https://api.freecurrencyapi.com/v1/latest";

function getApiKey(): string {
  const key = process.env.FREECURRENCY_API_KEY;
  if (!key) {
    throw new Error("Missing required environment variable: FREECURRENCY_API_KEY");
  }
  return key;
}

interface FreeCurrencyResponse {
  data: Record<string, number>;
}

/**
 * FreeCurrencyAPI provider implementation.
 * https://freecurrencyapi.com/docs
 */
export class FreeCurrencyProvider implements ExchangeRateProvider {
  public readonly name = "FreeCurrencyAPI";

  public async getRate(baseCurrency: string): Promise<number> {
    const apiKey = getApiKey();

    const response = await fetch(
      `${FREECURRENCY_API_URL}?apikey=${apiKey}&base_currency=${baseCurrency}&currencies=GHS`
    );

    if (!response.ok) {
      const error = await response.text();
      logger.error(`${this.name} request failed`, {
        baseCurrency,
        status: response.status,
        error,
      });
      throw new Error(`${this.name} error: ${response.status}`);
    }

    const data: FreeCurrencyResponse = await response.json();
    const rate = data.data.GHS;

    if (!rate) {
      throw new Error(`${baseCurrency}→GHS rate not found in response`);
    }

    logger.info(`${this.name} fetched rate`, { baseCurrency, rate });
    return rate;
  }

  public async getRates(baseCurrencies: string[]): Promise<Map<string, number>> {
    const rates = new Map<string, number>();

    // FreeCurrencyAPI free tier doesn't support multiple base currencies in one call
    // So we fetch them sequentially
    for (const currency of baseCurrencies) {
      const rate = await this.getRate(currency);
      rates.set(currency, rate);
    }

    return rates;
  }
}

/** Default singleton instance */
export const freeCurrencyProvider = new FreeCurrencyProvider();
