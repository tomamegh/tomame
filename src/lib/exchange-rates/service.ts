import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";
import type { ExchangeRate, ExchangeRateProvider } from "./types";
import { exchangeRateApiProvider } from "./exchange-rate-api";
import { freeCurrencyProvider } from "./freecurrency";

/**
 * Currencies the stores we support list prices in. EUR, CAD and AUD are for
 * eBay: a listing from a seller abroad is priced in the seller's currency even
 * on ebay.com, and a currency with no rate cannot be priced at all.
 */
export const RATE_CURRENCIES = ["USD", "GBP", "CNY", "EUR", "CAD", "AUD"] as const;

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
 * Fetch rates and store them, one provider request per refresh. Providers are
 * tried in order; each is asked for every currency still missing in a single
 * call, and what it returns is stored before the next provider is consulted.
 * A currency fails only when every provider fails for it — and the others are
 * still stored. (Six per-currency requests a run is what spent the primary
 * provider's 1,500-a-month allowance by mid-month across dev and prod.)
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

  const attempts = new Map<string, string[]>(RATE_CURRENCIES.map((c) => [c, []]));
  let missing: string[] = [...RATE_CURRENCIES];

  for (const provider of chain) {
    if (missing.length === 0) break;
    let rates: Map<string, number>;
    try {
      rates = await provider.getRates(missing);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      for (const currency of missing) attempts.get(currency)?.push(`${provider.name}: ${message}`);
      logger.warn("Exchange rate provider failed, trying next", { provider: provider.name, currencies: missing, error: message });
      continue;
    }

    const stillMissing: string[] = [];
    for (const currency of missing) {
      const rate = rates.get(currency);
      if (!(typeof rate === "number" && Number.isFinite(rate) && rate > 0)) {
        attempts.get(currency)?.push(`${provider.name}: no ${currency}→GHS rate`);
        stillMissing.push(currency);
        continue;
      }
      const result = await upsertRate(currency, rate, provider.name);
      if (!result) {
        attempts.get(currency)?.push(`${provider.name}: DB upsert failed`);
        stillMissing.push(currency);
        continue;
      }
      updated.push(currency);
      logger.info("Exchange rate updated", { currency, rate, provider: provider.name });
    }
    missing = stillMissing;
  }

  for (const currency of missing) {
    const tried = attempts.get(currency) ?? [];
    errors.push(`${currency}: ${tried.join("; ")}`);
    logger.error("Failed to fetch/store rate from every provider", { currency, attempts: tried });
  }

  return { success: errors.length === 0, updated, errors };
}

/**
 * Every stored X→GHS rate keyed by base currency (USD included), in one SELECT.
 * A quote lock snapshots this at mint so a non-USD listing is frozen too.
 * Throws on a failed read: a lock minted with a partial snapshot would be void
 * for every currency it missed.
 */
export async function listGhsRates(): Promise<Record<string, number>> {
  const client = createAdminClient();
  const { data, error } = await client
    .from("exchange_rates")
    .select("base_currency, rate")
    .eq("target_currency", "GHS");

  if (error) throw new Error(`Failed to load exchange rates: ${error.message}`);

  const rates: Record<string, number> = {};
  for (const row of data ?? []) {
    const rate = Number(row.rate);
    if (typeof row.base_currency === "string" && Number.isFinite(rate)) rates[row.base_currency.toUpperCase()] = rate;
  }
  return rates;
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
