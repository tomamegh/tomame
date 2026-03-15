import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";
import type { DbExchangeRate } from "@/types/db";
import type { ExchangeRateProvider } from "./types";
import { freeCurrencyProvider } from "./freecurrency";

// ── DB queries ────────────────────────────────────────────────────────────────

/**
 * Get exchange rate from DB by base currency.
 */
export async function getRate(baseCurrency: string): Promise<DbExchangeRate | null> {
  const client = createAdminClient();

  const { data, error } = await client
    .from("exchange_rates")
    .select("*")
    .eq("base_currency", baseCurrency.toUpperCase())
    .eq("target_currency", "GHS")
    .single();

  if (error) {
    logger.error("getRate failed", { baseCurrency, error: error.message });
    return null;
  }

  return data as DbExchangeRate;
}

/**
 * Get all exchange rates from DB.
 */
export async function getAllRates(): Promise<DbExchangeRate[]> {
  const client = createAdminClient();

  const { data, error } = await client
    .from("exchange_rates")
    .select("*")
    .eq("target_currency", "GHS")
    .order("base_currency");

  if (error) {
    logger.error("getAllRates failed", { error: error.message });
    return [];
  }

  return (data ?? []) as DbExchangeRate[];
}

/**
 * Upsert an exchange rate in the DB.
 */
async function upsertRate(
  baseCurrency: string,
  rate: number,
  provider: string
): Promise<DbExchangeRate | null> {
  const client = createAdminClient();
  const now = new Date().toISOString();

  const { data, error } = await client
    .from("exchange_rates")
    .upsert(
      {
        base_currency: baseCurrency.toUpperCase(),
        target_currency: "GHS",
        rate,
        provider,
        fetched_at: now,
        updated_at: now,
      },
      { onConflict: "base_currency,target_currency" }
    )
    .select()
    .single();

  if (error) {
    logger.error("upsertRate failed", { baseCurrency, error: error.message });
    return null;
  }

  return data as DbExchangeRate;
}

// ── Service functions ─────────────────────────────────────────────────────────

/**
 * Fetch rates from provider and store them in the DB.
 * Call this from cron job.
 */
export async function fetchAndStoreRates(
  provider: ExchangeRateProvider = freeCurrencyProvider
): Promise<{ success: boolean; updated: string[]; errors: string[] }> {
  const currencies = ["USD", "GBP", "CNY"];
  const updated: string[] = [];
  const errors: string[] = [];

  for (const currency of currencies) {
    try {
      const rate = await provider.getRate(currency);
      const result = await upsertRate(currency, rate, provider.name);

      if (result) {
        updated.push(currency);
        logger.info("Exchange rate updated", { currency, rate, provider: provider.name });
      } else {
        errors.push(`${currency}: DB upsert failed`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push(`${currency}: ${message}`);
      logger.error("Failed to fetch/store rate", { currency, error: message });
    }
  }

  return {
    success: errors.length === 0,
    updated,
    errors,
  };
}

/**
 * Get the GHS rate for a currency from DB.
 * Returns null if not found.
 */
export async function getGhsRate(baseCurrency: string): Promise<number | null> {
  const rate = await getRate(baseCurrency);
  return rate?.rate ?? null;
}

/**
 * Get all pricing rates from DB.
 * Returns null values for missing rates.
 */
export async function getPricingRates(): Promise<{
  USD_GHS: number | null;
  GBP_GHS: number | null;
  CNY_GHS: number | null;
}> {
  const rates = await getAllRates();

  const rateMap = new Map(rates.map((r) => [r.base_currency, r.rate]));

  return {
    USD_GHS: rateMap.get("USD") ?? null,
    GBP_GHS: rateMap.get("GBP") ?? null,
    CNY_GHS: rateMap.get("CNY") ?? null,
  };
}
