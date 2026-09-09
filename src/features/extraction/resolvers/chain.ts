import { logger } from "@/lib/logger";
import { EXTRACTION, type ExtractionSource } from "@/config/extraction";
import { emptyProduct, getScraperByPlatform, type SupportedPlatform } from "../scrapers";
import type { Region } from "../url";
import { fetchProductHtml, type FetchHtmlOptions } from "./html-source";
import { hasRequiredFields, hasWeight, mergeResult, type MergeState } from "./merge";
import { platformHtmlResolver } from "./platform-html.resolver";
import { structuredDataResolver } from "./structured-data.resolver";
import { llmResolver } from "./llm.resolver";
import { apifyResolver } from "./apify.resolver";
import { rainforestResolver } from "./rainforest.resolver";
import { scraperApiResolver } from "./scraperapi.resolver";
import type { ChainOutcome, ExtractionResolver, HtmlFetch, ResolveContext } from "./types";

/** Cheapest → costliest. */
export const DEFAULT_RESOLVERS: ExtractionResolver[] = [
  scraperApiResolver,
  rainforestResolver,
  platformHtmlResolver,
  structuredDataResolver,
  llmResolver,
  apifyResolver,
];

/** Resolvers that only read the already-fetched HTML. Free to re-run. */
const FREE_PARSERS = new Set<ExtractionSource>(["platform-html", "structured-data"]);

export type HtmlFetcher = (url: string, opts?: FetchHtmlOptions) => Promise<HtmlFetch | null>;

export interface ResolveInput {
  url: string;
  platform: SupportedPlatform;
  region: Region | null;
  /**
   * Fast mode: return as soon as title, price and currency are known, even if
   * weight is not. The caller can finish the job later with `continueResolve`
   * (the outcome lists the resolvers that did not run yet).
   */
  stopWhenRequired?: boolean;
  /** Resume from a previous outcome instead of an empty product. */
  seed?: Pick<ChainOutcome, "product" | "confidence" | "fieldSources">;
  /** HTML already fetched by a previous run; avoids paying for it twice. */
  initialHtml?: HtmlFetch | null;
  /** Override for tests. */
  resolvers?: ExtractionResolver[];
  /** Override for tests. */
  fetchHtml?: HtmlFetcher;
  budgetMs?: number;
}

/**
 * Run the resolver chain. Never throws. Each resolver contributes what it can;
 * the merge keeps the highest-confidence value per field; the chain stops once
 * the required fields (and, unless in fast mode, weight) are known.
 */
export async function resolveProduct(input: ResolveInput): Promise<ChainOutcome> {
  const started = Date.now();
  const deadline = started + (input.budgetMs ?? EXTRACTION.totalBudgetMs);
  const scraper = getScraperByPlatform(input.platform);
  const resolvers = input.resolvers ?? DEFAULT_RESOLVERS;
  const fetcher: HtmlFetcher = input.fetchHtml ?? ((u, o) => fetchProductHtml(u, scraper, deadline, o));

  const state: MergeState = input.seed
    ? { product: { ...input.seed.product }, confidence: { ...input.seed.confidence }, sources: { ...input.seed.fieldSources } }
    : { product: emptyProduct(), confidence: {}, sources: {} };
  const messages: string[] = [];
  const ran: ExtractionSource[] = [];
  const skipped: ExtractionSource[] = [];

  // A previous run's page is reused; a previous run that never fetched (e.g.
  // Rainforest answered without the browser) leaves fetching available.
  const html: { attempted: boolean; result: HtmlFetch | null; promise: Promise<HtmlFetch | null> | null } = {
    attempted: !!input.initialHtml,
    result: input.initialHtml ?? null,
    promise: input.initialHtml ? Promise.resolve(input.initialHtml) : null,
  };
  const startFetch = (opts?: FetchHtmlOptions) => {
    html.attempted = true;
    html.promise = fetcher(input.url, opts)
      .then((r) => {
        html.result = r;
        return r;
      })
      .catch((err) => {
        logger.warn("chain: html fetch threw", { url: input.url, error: err instanceof Error ? err.message : String(err) });
        return null;
      });
    return html.promise;
  };
  const getHtml = () => html.promise ?? startFetch();

  const ctx: ResolveContext = {
    url: input.url,
    platform: input.platform,
    scraper,
    region: input.region,
    deadline,
    getHtml,
    htmlState: () => (!html.attempted ? "unfetched" : html.result ? "ready" : "none"),
    current: state.product,
  };

  const runResolver = async (resolver: ExtractionResolver) => {
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
  };

  // Fast mode ends once pricing can be shown: title, price, currency and a
  // category (or the LLM has had its say on the category). Weight is deferred.
  const done = () =>
    hasRequiredFields(state.product) &&
    (input.stopWhenRequired ? state.product.category != null || ran.includes("llm") : hasWeight(state.product));

  let refetchedDirect = false;
  for (let i = 0; i < resolvers.length; i++) {
    const resolver = resolvers[i]!;
    if (Date.now() >= deadline) {
      messages.push("Extraction ran out of time; some details may be missing.");
      skipped.push(...resolvers.slice(i).map((r) => r.name));
      break;
    }
    if (!resolver.available(ctx)) continue;
    if (!resolver.shouldRun(ctx)) continue;

    // Fast mode: once the listing is known, do not launch a browser for the
    // nice-to-haves — those tiers run in background enrichment instead.
    if (input.stopWhenRequired && hasRequiredFields(state.product) && resolver.needsHtml && html.attempted === false) {
      skipped.push(resolver.name);
      continue;
    }

    // Before spending on a paid tier: if the free parsers read a directly
    // fetched page and still have no price, the page was a stripped variant
    // (Amazon does this for datacenter IPs). Refetch through the browser tier
    // and give the free parsers one more pass.
    if (!FREE_PARSERS.has(resolver.name) && !refetchedDirect && !hasRequiredFields(state.product) && html.result?.source === "direct") {
      refetchedDirect = true;
      logger.info("chain: direct page parsed to nothing, refetching via browser", { url: input.url });
      await startFetch({ skipDirect: true });
      for (const parser of resolvers.filter((r) => FREE_PARSERS.has(r.name) && r.available(ctx))) {
        await runResolver(parser);
      }
      if (done()) break;
    }

    await runResolver(resolver);
    if (done()) {
      skipped.push(...resolvers.slice(i + 1).filter((r) => r.available(ctx)).map((r) => r.name));
      break;
    }
  }

  if (!hasRequiredFields(state.product)) {
    if (html.attempted && !html.result) messages.push("We could not load this product page. You can still continue and enter the details yourself.");
    else if (!state.product.title) messages.push("Product name could not be read from the page.");
    else if (state.product.price == null) messages.push("Price could not be read from the page. Enter it below and our team will verify it.");
  }
  if (hasRequiredFields(state.product) && !hasWeight(state.product) && skipped.length === 0) {
    messages.push("Weight not listed by the store — shipping will be confirmed when we receive your item.");
  }

  const primarySource = state.sources.title ?? (ran[0] ?? null);

  return {
    product: state.product,
    confidence: state.confidence,
    fieldSources: state.sources,
    ran,
    skipped,
    primarySource,
    htmlSource: html.result?.source ?? null,
    html: html.result,
    messages: Array.from(new Set(messages)),
    durationMs: Date.now() - started,
  };
}

/**
 * Finish a fast-mode run: execute the resolvers it skipped, seeded with what it
 * found and reusing its HTML. Used for background enrichment (weight, etc.).
 */
export async function continueResolve(
  input: Omit<ResolveInput, "stopWhenRequired" | "seed" | "initialHtml">,
  previous: ChainOutcome,
): Promise<ChainOutcome> {
  const all = input.resolvers ?? DEFAULT_RESOLVERS;
  const remaining = all.filter((r) => previous.skipped.includes(r.name));
  if (remaining.length === 0) return previous;
  return resolveProduct({
    ...input,
    resolvers: remaining,
    seed: previous,
    initialHtml: previous.html,
  });
}
