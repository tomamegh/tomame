import "server-only";

import { HERO_PRODUCTS, heroOrderForSlot, heroSlot, titleMatchesHero, type HeroProductSpec } from "@/config/hero-products";
import { searchCatalogProducts } from "@/db/queries/catalog";
import { hubDestinationFor } from "@/features/extraction/hub-destination";
import { isOutlierListing } from "@/features/finder/price-outlier";
import { listingFromCatalogHit, listingFromEbaySummary } from "@/features/finder/services/finder-search.service";
import { postFilterListings, type FinderListing } from "@/features/finder/shortlist";
import { calculatePricing } from "@/features/pricing/services/pricing.service";
import { searchEbayItems } from "@/lib/ebay/browse";
import { isEbayConfigured } from "@/lib/ebay/config";
import { logger } from "@/lib/logger";
import { CACHE_TAGS, sharedCache } from "@/lib/shared-cache";

import type { WorkedExample } from "../types";
import { buildWorkedExample } from "./worked-example.service";

export interface HeroProduct {
  example: WorkedExample;
  imageUrl: string | null;
  storeName: string;
}

const STORE_NAME: Record<string, string> = { amazon: "Amazon", walmart: "Walmart", ebay: "eBay" };

/** A real listing for one product: new, exact, from a store and seller we would buy from. Null when none. */
async function findListing(spec: HeroProductSpec): Promise<FinderListing | null> {
  const asked = { product: spec.query, searchQuery: spec.query };
  let rows: FinderListing[] = [];
  if (spec.source === "catalogue") {
    const hits = await searchCatalogProducts({ q: spec.query, limit: 24 });
    rows = hits.map(listingFromCatalogHit).filter((l) => l.store === "amazon" || l.store === "walmart");
  } else if (isEbayConfigured()) {
    const shipTo = await hubDestinationFor("USA");
    const items = await searchEbayItems(spec.query, { marketplace: "EBAY_US", shipTo, limit: 50, timeoutMs: 8_000 });
    rows = items.flatMap((i) => listingFromEbaySummary(i) ?? []);
  }
  const { kept } = postFilterListings(
    rows.filter((l) => l.imageUrl && titleMatchesHero(l.title, spec)),
    asked,
    new Set(["amazon", "walmart", "ebay"] as const),
  );
  // Amazon first, then cheapest; a price far below the rest is a doubtful listing, not an advert.
  const prices = kept.map((l) => l.priceUsd ?? 0);
  const rank = (l: FinderListing) => (l.store === "amazon" ? 0 : l.store === "walmart" ? 1 : 2);
  return [...kept].filter((l) => !isOutlierListing(l.priceUsd, prices)).sort((a, b) => rank(a) - rank(b) || a.priceUsd! - b.priceUsd!)[0] ?? null;
}

/** The product for one two-hour window, priced by the calculator. Never throws; null when nothing qualifies. */
async function resolveHeroProduct(slot: number): Promise<HeroProduct | null> {
  for (const spec of heroOrderForSlot(slot, HERO_PRODUCTS)) {
    try {
      const listing = await findListing(spec);
      if (!listing?.priceUsd) continue;
      const input = {
        subject: spec.query,
        item_price_usd: listing.priceUsd,
        quantity: 1,
        category: spec.category,
        product_title: listing.title,
        product_image_key: null,
        weight_lbs: null,
        region: "usa" as const,
        price_presets_usd: [listing.priceUsd],
      };
      const breakdown = await calculatePricing(
        { itemPriceUsd: input.item_price_usd, quantity: 1, category: input.category, weightLbs: null, productTitle: input.product_title, region: "usa" },
        null,
      );
      if (breakdown.pricing_method === "needs_review" || !(breakdown.total_ghs > 0)) continue;
      return { example: buildWorkedExample(input, breakdown), imageUrl: listing.imageUrl, storeName: STORE_NAME[listing.store] ?? listing.store };
    } catch (error) {
      logger.warn("hero product: could not resolve", { query: spec.query, error: error instanceof Error ? error.message : String(error) });
    }
  }
  return null;
}

// One resolve per window for every visitor: the slot is the cache key, and the entry outlives its window by nothing.
const cachedHeroProduct = sharedCache(resolveHeroProduct, ["hero-product-v1"], {
  tags: [CACHE_TAGS.catalog],
  revalidateSeconds: 2 * 60 * 60,
});

/** The landing hero's product right now: a different popular item every two hours. */
export async function getHeroProduct(now: number = Date.now()): Promise<HeroProduct | null> {
  try {
    return await cachedHeroProduct(heroSlot(now));
  } catch (error) {
    logger.warn("hero product: cache read failed", { error: error instanceof Error ? error.message : String(error) });
    return null;
  }
}
