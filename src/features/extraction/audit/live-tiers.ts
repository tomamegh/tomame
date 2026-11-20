import { RESOLVERS, resolveProduct } from "../resolvers/chain";
import { fetchProductHtml } from "../resolvers/html-source";
import { getScraperForStore } from "../scrapers";
import { storeForUrl } from "../stores";
import { regionForUrl } from "../url";
import type { ExtractionSource } from "@/config/extraction";
import type { HtmlFetch } from "../resolvers/types";
import type { AuditSample, TierReading } from "./accuracy-audit";

/**
 * The real tiers for the accuracy audit (A0c). Imported only by the script's
 * live mode: it pulls in every vendor client and `@/lib/env`.
 *
 * Every vendor tier for the store, Oxylabs included on Amazon even though the
 * live plan dropped it (2026-11-20) — measuring it is how it earns its way
 * back. The two page parsers share one fetched page per URL.
 */
const AUDIT_TIERS: Record<string, ExtractionSource[]> = {
  amazon: ["scraperapi", "amazon-offers", "oxylabs", "zyte", "rainforest", "platform-html", "structured-data"],
  walmart: ["oxylabs", "zyte", "structured-data"],
  ebay: ["ebay", "scraperapi", "platform-html", "structured-data"],
};

export function liveTiersFor(platform: string): string[] {
  return AUDIT_TIERS[platform] ?? ["zyte", "structured-data"];
}

/** The page parsers after the first are free: the page is fetched once per URL. */
export function liveIsPaid(tier: string): boolean {
  return tier !== "structured-data";
}

const pages = new Map<string, Promise<HtmlFetch | null>>();

export async function runLiveTier(sample: AuditSample, tier: string): Promise<TierReading> {
  const t0 = Date.now();
  const store = storeForUrl(sample.url);
  const resolver = RESOLVERS[tier as ExtractionSource];
  if (!store || !resolver) return { tier, price: null, currency: null, ms: 0, error: "unknown store or tier" };
  const scraper = getScraperForStore(store);
  const deadline = () => Date.now() + 25_000;
  const fetchHtml = (url: string) => {
    if (!pages.has(url)) pages.set(url, fetchProductHtml(url, scraper, deadline()));
    return pages.get(url)!;
  };
  try {
    const outcome = await resolveProduct({
      url: sample.url,
      platform: store.slug,
      region: store.region ?? regionForUrl(sample.url),
      store,
      resolvers: [{ ...resolver, resolve: resolver.resolve.bind(resolver) }],
      fetchHtml,
      budgetMs: 25_000,
    });
    if (!outcome.ran.includes(resolver.name)) return { tier, price: null, currency: null, ms: Date.now() - t0, error: "not available (key missing?)" };
    const read = outcome.priceReads.find((r) => r.source === resolver.name) ?? null;
    return { tier, price: read?.price ?? null, currency: read?.currency ?? null, ms: Date.now() - t0 };
  } catch (error) {
    return { tier, price: null, currency: null, ms: Date.now() - t0, error: error instanceof Error ? error.message : String(error) };
  }
}
