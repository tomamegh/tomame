import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";
import type { ExchangeRate, ExchangeRateProvider } from "./types";
import { exchangeRateApiProvider } from "./exchange-rate-api";
import { freeCurrencyProvider } from "./freecurrency";

/** Currencies the stores we support list prices in. */
export const RATE_CURRENCIES = ["USD", "GBP", "CNY"] as const;

// ── DB queries ────────────────────────────────────────────────────────────────

export async function getRate(baseCurrency: string): Promise<ExchangeRate | null> {
  const client = createAdminClient();

  const { data, error } = await client
    .from("exchange_rates")
    .select("*")
    .eq("base_currency", baseCurrency.toUpperCase())
    .eq("target_currency", "GHS")
    .maybeSingle();

  if (error) {
    logger.error("getRate failed", { baseCurrency, error: error.message });
    return null;
  }

  return data as ExchangeRate;
}

export async function getAllRates(): Promise<ExchangeRate[]> {
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

  return (data ?? []) as ExchangeRate[];
}

async function upsertRate(baseCurrency: string, rate: number, provider: string): Promise<ExchangeRate | null> {
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
      { onConflict: "base_currency,target_currency" },
    )
    .select()
    .single();

  if (error) {
    logger.error("upsertRate failed", { baseCurrency, error: error.message });
    return null;
  }

  return data as ExchangeRate;
}

// ── Service functions ─────────────────────────────────────────────────────────

/**
 * Providers in priority order. exchangerate-api.com is primary; FreeCurrencyAPI
 * is a fallback that only participates when its key is configured.
 */
export function defaultProviders(): ExchangeRateProvider[] {
  const providers: ExchangeRateProvider[] = [];
  if (process.env.EXCHANGE_RATE_API_KEY) providers.push(exchangeRateApiProvider);
  if (process.env.FREECURRENCY_API_KEY) providers.push(freeCurrencyProvider);
  return providers;
}

/**
 * Fetch rates and store them. For each currency the providers are tried in
 * order; the first that answers wins. A currency fails only when every
 * provider fails for it — and the others are still stored.
 */
export async function fetchAndStoreRates(
  providers: ExchangeRateProvider | ExchangeRateProvider[] = defaultProviders(),
): Promise<{ success: boolean; updated: string[]; errors: string[] }> {
  const chain = Array.isArray(providers) ? providers : [providers];
  const updated: string[] = [];
  const errors: string[] = [];

  if (chain.length === 0) {
    return { success: false, updated, errors: ["No exchange-rate provider configured (EXCHANGE_RATE_API_KEY / FREECURRENCY_API_KEY)"] };
  }

  for (const currency of RATE_CURRENCIES) {
    const attempts: string[] = [];
    let stored = false;

    for (const provider of chain) {
      try {
        const rate = await provider.getRate(currency);
        const result = await upsertRate(currency, rate, provider.name);
        if (!result) {
          attempts.push(`${provider.name}: DB upsert failed`);
          continue;
        }
        updated.push(currency);
        logger.info("Exchange rate updated", { currency, rate, provider: provider.name });
        stored = true;
        break;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        attempts.push(`${provider.name}: ${message}`);
        logger.warn("Exchange rate provider failed, trying next", { currency, provider: provider.name, error: message });
      }
    }

    if (!stored) {
      errors.push(`${currency}: ${attempts.join("; ")}`);
      logger.error("Failed to fetch/store rate from every provider", { currency, attempts });
    }
  }

  return { success: errors.length === 0, updated, errors };
}

export async function getGhsRate(baseCurrency: string): Promise<number | null> {
  const rate = await getRate(baseCurrency);
  return rate?.rate ?? null;
}

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
