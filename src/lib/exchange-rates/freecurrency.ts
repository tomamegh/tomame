import { logger } from "@/lib/logger";
import { crossRatesToGhs } from "./exchange-rate-api";
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

  private async fetchTable(baseCurrency: string, currencies: string[]): Promise<Record<string, number>> {
    const apiKey = getApiKey();

    const response = await fetch(
      `${FREECURRENCY_API_URL}?apikey=${apiKey}&base_currency=${baseCurrency}&currencies=${currencies.join(",")}`
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
    if (!data.data || typeof data.data !== "object") throw new Error(`${this.name}: no rates for ${baseCurrency}`);
    return data.data;
  }

  public async getRate(baseCurrency: string): Promise<number> {
    const rate = (await this.fetchTable(baseCurrency, ["GHS"])).GHS;

    if (!rate) {
      throw new Error(`${baseCurrency}→GHS rate not found in response`);
    }

    logger.info(`${this.name} fetched rate`, { baseCurrency, rate });
    return rate;
  }

  /**
   * One request: the free tier allows a single base currency per call but any
   * number of targets, so ask for GHS plus every base against USD and cross.
   */
  public async getRates(baseCurrencies: string[]): Promise<Map<string, number>> {
    const targets = Array.from(new Set(["GHS", ...baseCurrencies.map((c) => c.toUpperCase()).filter((c) => c !== "USD")]));
    const rates = crossRatesToGhs(await this.fetchTable("USD", targets), baseCurrencies);
    if (rates.size === 0) throw new Error(`${this.name}: USD→GHS rate not found in response`);
    logger.info(`${this.name} fetched rates`, { currencies: [...rates.keys()], requests: 1 });
    return rates;
  }
}

/** Default singleton instance */
export const freeCurrencyProvider = new FreeCurrencyProvider();
