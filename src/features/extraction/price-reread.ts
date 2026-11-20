import type { ExtractionSource } from "@/config/extraction";
import { emptyProduct } from "./scrapers";
import { resolveProduct, type ExtractionResolver } from "./resolvers";
import { resolversForStore } from "./resolvers/chain";
import { HTML_TIERS, type PriceRead } from "./price-confidence";
import { regionForUrl } from "./url";
import { storeForUrl } from "./stores";

/**
 * Tiers that can independently re-read a price: every vendor tier in the
 * store's plan except the one that produced the quote, plus the page's own
 * JSON-LD offer. Never the model tier or our own Cheerio parse — a re-read
 * that agrees because it repeated the same mistake proves nothing.
 */
export function rereadTiers(plan: readonly ExtractionResolver[], originalSource: string | null): ExtractionResolver[] {
  return plan.filter((r) => {
    if (r.name === originalSource || r.name === "category-map") return false;
    if (r.name === "structured-data") return true;
    return !HTML_TIERS.has(r.name);
  });
}

export interface RereadInput {
  url: string;
  title: string | null;
  category: string | null;
  originalSource: string | null;
  budgetMs: number;
  /** Tests. */
  resolvers?: ExtractionResolver[];
}

/** One chain run over the re-read tiers. Never throws; an empty list means nothing could read it. */
export async function rereadPrice(input: RereadInput): Promise<PriceRead[]> {
  const store = storeForUrl(input.url);
  if (!store) return [];
  const resolvers = input.resolvers ?? rereadTiers(resolversForStore(store), input.originalSource);
  if (resolvers.length === 0) return [];
  // Seeded with the title and category so the chain stops as soon as a price lands.
  const seed = { ...emptyProduct(), title: input.title, category: (input.category as never) ?? null };
  try {
    const outcome = await resolveProduct({
      url: input.url,
      platform: store.slug,
      region: store.region ?? regionForUrl(input.url),
      store,
      resolvers,
      stopWhenRequired: true,
      budgetMs: input.budgetMs,
      seed: { product: seed, confidence: {}, fieldSources: {} },
    });
    return outcome.priceReads.filter((r) => r.source !== (input.originalSource as ExtractionSource | null));
  } catch {
    return [];
  }
}
