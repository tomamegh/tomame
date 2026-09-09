import { logger } from "@/lib/logger";
import { EXTRACTION } from "@/config/extraction";
import { emptyProduct, getScraperByPlatform, type SupportedPlatform } from "../scrapers";
import type { Region } from "../url";
import { fetchProductHtml } from "./html-source";
import { hasRequiredFields, hasWeight, mergeResult, type MergeState } from "./merge";
import { platformHtmlResolver } from "./platform-html.resolver";
import { structuredDataResolver } from "./structured-data.resolver";
import { llmResolver } from "./llm.resolver";
import { apifyResolver } from "./apify.resolver";
import type { ChainOutcome, ExtractionResolver, HtmlFetch, ResolveContext } from "./types";

/** Cheapest → costliest. */
export const DEFAULT_RESOLVERS: ExtractionResolver[] = [
  platformHtmlResolver,
  structuredDataResolver,
  llmResolver,
  apifyResolver,
];

export interface ResolveInput {
  url: string;
  platform: SupportedPlatform;
  region: Region | null;
  /** Override for tests. */
  resolvers?: ExtractionResolver[];
  /** Override for tests. */
  fetchHtml?: (url: string) => Promise<HtmlFetch | null>;
  budgetMs?: number;
}

/**
 * Run the resolver chain. Never throws. Each resolver contributes what it can;
 * the merge keeps the highest-confidence value per field; the chain stops once
 * the required fields and weight are known.
 */
export async function resolveProduct(input: ResolveInput): Promise<ChainOutcome> {
  const started = Date.now();
  const deadline = started + (input.budgetMs ?? EXTRACTION.totalBudgetMs);
  const scraper = getScraperByPlatform(input.platform);
  const resolvers = input.resolvers ?? DEFAULT_RESOLVERS;

  const state: MergeState = { product: emptyProduct(), confidence: {}, sources: {} };
  const messages: string[] = [];
  const ran: ChainOutcome["ran"] = [];

  let htmlPromise: Promise<HtmlFetch | null> | null = null;
  const html: { attempted: boolean; result: HtmlFetch | null } = { attempted: false, result: null };
  const getHtml = () => {
    if (!htmlPromise) {
      html.attempted = true;
      const fetcher = input.fetchHtml ?? ((u: string) => fetchProductHtml(u, scraper, deadline));
      htmlPromise = fetcher(input.url)
        .then((r) => {
          html.result = r;
          return r;
        })
        .catch((err) => {
          logger.warn("chain: html fetch threw", { url: input.url, error: err instanceof Error ? err.message : String(err) });
          return null;
        });
    }
    return htmlPromise;
  };

  const ctx: ResolveContext = {
    url: input.url,
    platform: input.platform,
    scraper,
    region: input.region,
    deadline,
    getHtml,
    current: state.product,
  };

  for (const resolver of resolvers) {
    if (Date.now() >= deadline) {
      messages.push("Extraction ran out of time; some details may be missing.");
      break;
    }
    if (!resolver.available(ctx)) continue;
    if (!resolver.shouldRun(ctx)) continue;

    const t0 = Date.now();
    try {
      const result = await resolver.resolve(ctx);
      ran.push(resolver.name);
      mergeResult(state, resolver.name, result, resolver.defaultConfidence);
      if (result.messages?.length) messages.push(...result.messages);
      logger.info("chain: resolver done", {
        url: input.url,
        resolver: resolver.name,
        ms: Date.now() - t0,
        hasRequired: hasRequiredFields(state.product),
        hasWeight: hasWeight(state.product),
      });
    } catch (err) {
      // Resolvers must not throw; this is belt-and-braces.
      ran.push(resolver.name);
      logger.error("chain: resolver threw", { resolver: resolver.name, error: err instanceof Error ? err.message : String(err) });
    }

    if (hasRequiredFields(state.product) && hasWeight(state.product)) break;
  }

  if (!hasRequiredFields(state.product)) {
    if (html.attempted && !html.result) messages.push("We could not load this product page. You can still continue and enter the details yourself.");
    else if (!state.product.title) messages.push("Product name could not be read from the page.");
    else if (state.product.price == null) messages.push("Price could not be read from the page. Enter it below and our team will verify it.");
  }
  if (hasRequiredFields(state.product) && !hasWeight(state.product)) {
    messages.push("Weight not listed by the store — shipping will be confirmed when we receive your item.");
  }

  const primarySource = state.sources.title ?? (ran[0] ?? null);

  return {
    product: state.product,
    confidence: state.confidence,
    fieldSources: state.sources,
    ran,
    primarySource,
    htmlSource: html.result?.source ?? null,
    messages: Array.from(new Set(messages)),
    durationMs: Date.now() - started,
  };
}
