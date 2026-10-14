import { logger } from "@/lib/logger";
import { EXTRACTION, type ExtractionSource } from "@/config/extraction";
import { emptyProduct, getScraperForStore } from "../scrapers";
import { GENERIC_STORE, STORES, type StoreDefinition } from "../stores";
import type { Region } from "../url";
import { fetchProductHtml, type FetchHtmlOptions } from "./html-source";
import { hasRequiredFields, hasWeight, mergeResult, type MergeState } from "./merge";
import { platformHtmlResolver } from "./platform-html.resolver";
import { structuredDataResolver } from "./structured-data.resolver";
import { llmResolver } from "./llm.resolver";
import { apifyResolver } from "./apify.resolver";
import { rainforestResolver } from "./rainforest.resolver";
import { scraperApiResolver } from "./scraperapi.resolver";
import { oxylabsResolver } from "./oxylabs.resolver";
import { zyteResolver } from "./zyte.resolver";
import { categoryResolver } from "./category.resolver";
import { ebayResolver } from "./ebay.resolver";
import { shopifyResolver } from "./shopify.resolver";
import type { ChainOutcome, ExtractionResolver, HtmlFetch, ResolveContext } from "./types";
import { WEIGHT_NOT_LISTED_MESSAGE } from "./messages";
import { PAGE_OFFER_CONFIDENCE } from "./structured-data.resolver";

/** Every resolver, by name. A store's `providers` list picks and orders them. */
export const RESOLVERS: Record<ExtractionSource, ExtractionResolver> = {
  ebay: ebayResolver,
  shopify: shopifyResolver,
  scraperapi: scraperApiResolver,
  oxylabs: oxylabsResolver,
  zyte: zyteResolver,
  rainforest: rainforestResolver,
  "category-map": categoryResolver,
  "platform-html": platformHtmlResolver,
  "structured-data": structuredDataResolver,
  llm: llmResolver,
  apify: apifyResolver,
};

/** Cheapest → costliest, when no store plan applies. */
export const DEFAULT_RESOLVERS: ExtractionResolver[] = [
  ebayResolver,
  scraperApiResolver,
  oxylabsResolver,
  zyteResolver,
  rainforestResolver,
  categoryResolver,
  platformHtmlResolver,
  structuredDataResolver,
  llmResolver,
];

export function resolversForStore(store: StoreDefinition): ExtractionResolver[] {
  return store.providers.map((entry) => {
    if (typeof entry === "string") return RESOLVERS[entry];
    const base = RESOLVERS[entry.name];
    if (entry.startWhen === "html-ready") {
      // Runs only on a page already in hand (one a vendor handed over), never
      // paying for a fetch of its own: the Etsy shipping read off Zyte's page.
      return { ...base, startWhen: (ctx) => ctx.htmlState() === "ready", resolve: base.resolve.bind(base) };
    }
    return entry.startAfterMs == null ? base : { ...base, startAfterMs: entry.startAfterMs, resolve: base.resolve.bind(base) };
  });
}

/** Resolvers that only read the already-fetched HTML. Free to re-run. */
const FREE_PARSERS = new Set<ExtractionSource>(["platform-html", "structured-data"]);

export type HtmlFetcher = (url: string, opts?: FetchHtmlOptions) => Promise<HtmlFetch | null>;

export interface ResolveInput {
  url: string;
  /** Store slug. */
  platform: string;
  region: Region | null;
  /** Registry entry; looked up by slug when omitted. */
  store?: StoreDefinition;
  /**
   * Fast mode: return as soon as title, price, currency and category are
   * known, even if weight is not. The caller can finish the job later with
   * `continueResolve` (the outcome lists the resolvers that did not run).
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

function storeFor(input: ResolveInput): StoreDefinition {
  return input.store ?? STORES.find((s) => s.slug === input.platform) ?? GENERIC_STORE;
}

/** Resolves after `ms`, or never if ms is Infinity. Cleared by the caller via the returned handle. */
function timer(ms: number): { promise: Promise<"timer">; clear: () => void } {
  let handle: ReturnType<typeof setTimeout> | null = null;
  const promise = new Promise<"timer">((resolve) => {
    if (!Number.isFinite(ms)) return;
    handle = setTimeout(() => resolve("timer"), Math.max(0, ms));
  });
  return { promise, clear: () => { if (handle) clearTimeout(handle); } };
}

/**
 * Run the resolver chain as a hedged race. Never throws.
 *
 * Tiers start in order. A tier with `startAfterMs` starts as soon as the
 * earlier tiers answer OR that many ms have passed — a slow vendor cannot hold
 * up a fast one. A tier with `startWhen` starts the moment its precondition is
 * met. A tier with neither waits for everything before it (costly tiers). Each
 * result is merged as it lands (highest confidence per field wins); once the
 * required fields (and, unless in fast mode, weight) are known the remaining
 * requests are aborted.
 */
export async function resolveProduct(input: ResolveInput): Promise<ChainOutcome> {
  const started = Date.now();
  const store = storeFor(input);
  const deadline = started + (input.budgetMs ?? store.budgetMs ?? EXTRACTION.totalBudgetMs);
  const scraper = getScraperForStore(store);
  const resolvers = input.resolvers ?? resolversForStore(store);
  const fetcher: HtmlFetcher = input.fetchHtml ?? ((u, o) => fetchProductHtml(u, scraper, deadline, o));

  const state: MergeState = input.seed
    ? { product: { ...input.seed.product }, confidence: { ...input.seed.confidence }, sources: { ...input.seed.fieldSources } }
    : { product: emptyProduct(), confidence: {}, sources: {} };
  const messages: string[] = [];
  const ran: ExtractionSource[] = [];
  const skipped: ExtractionSource[] = [];
  const timings: ChainOutcome["timings"] = {};
  const controller = new AbortController();
  let closed = false;

  const html: { attempted: boolean; offered: boolean; result: HtmlFetch | null; promise: Promise<HtmlFetch | null> | null } = {
    attempted: !!input.initialHtml,
    offered: false,
    result: input.initialHtml ?? null,
    promise: input.initialHtml ? Promise.resolve(input.initialHtml) : null,
  };
  const startFetch = (opts?: FetchHtmlOptions) => {
    html.attempted = true;
    html.promise = fetcher(input.url, opts)
      .then((r) => {
        // A page offered meanwhile (Zyte's) is not replaced by a later or empty fetch.
        if (!html.offered) html.result = r;
        return html.result;
      })
      .catch((err) => {
        logger.warn("chain: html fetch threw", { url: input.url, error: err instanceof Error ? err.message : String(err) });
        return html.offered ? html.result : null;
      });
    return html.promise;
  };
  // A page handed over by a tier that got it for free (Zyte returns the page
  // with its product record). Whoever is waiting on the fetch gets it at once.
  let resolveOffered: ((h: HtmlFetch) => void) | null = null;
  const offered = new Promise<HtmlFetch>((resolve) => { resolveOffered = resolve; });
  const getHtml = () => {
    if (html.result) return Promise.resolve(html.result);
    return Promise.race([html.promise ?? startFetch(), offered]);
  };
  const offerHtml = (page: string, source: HtmlFetch["source"]) => {
    if (html.result || closed) return;
    html.attempted = true;
    html.offered = true;
    html.result = { html: page, source };
    resolveOffered?.(html.result);
    // The free parsers may have already read a worse page, or none: one more pass
    // on the page we were given, unless the price is already the page's own.
    if (!priceVerified()) {
      for (const parser of resolvers.filter((r) => FREE_PARSERS.has(r.name) && r.available(ctx) && !pending.has(r.name) && ran.includes(r.name))) {
        void runResolver(parser);
      }
    }
  };

  const ctx: ResolveContext = {
    url: input.url,
    platform: input.platform,
    store,
    scraper,
    region: input.region,
    deadline,
    signal: controller.signal,
    getHtml,
    htmlState: () => (!html.attempted ? "unfetched" : html.result ? "ready" : "none"),
    offerHtml,
    current: state.product,
  };

  const pending = new Map<ExtractionSource, Promise<void>>();
  const runResolver = (resolver: ExtractionResolver): Promise<void> => {
    const t0 = Date.now();
    const p = (async () => {
      try {
        const result = await resolver.resolve(ctx);
        if (closed) return; // lost the race; the outcome is already sealed
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
        if (closed) return;
        ran.push(resolver.name);
        logger.error("chain: resolver threw", { resolver: resolver.name, error: err instanceof Error ? err.message : String(err) });
      } finally {
        timings[resolver.name] = Date.now() - t0;
        pending.delete(resolver.name);
      }
    })();
    pending.set(resolver.name, p);
    return p;
  };

  // Fast mode ends once pricing can be shown: title, price, currency and a
  // category (or the classifiers have had their say). Weight is deferred.
  // A store that told us the item is unavailable has no price to find; more
  // tiers would only spend money confirming it.
  const availabilityPhrase = () =>
    state.product.availability ?? (typeof state.product.metadata.availability === "string" ? state.product.metadata.availability : null);
  const unavailable = () => {
    const phrase = availabilityPhrase();
    return !!state.product.title && state.product.price == null && !!phrase && /out ?of ?stock|unavailable|discontinued|sold out|no longer available/i.test(phrase);
  };

  // The price is the page's own offer for this URL (confidence above any AI
  // read) — nothing in flight can improve on it.
  const priceVerified = () => (state.confidence.price ?? 0) >= PAGE_OFFER_CONFIDENCE;
  // Zyte's AI read of a page may pick another variant's price (LG's 85-inch
  // for the 43-inch page, 2026-10-12). While that is the price on the table
  // and the page's own offer has not been read, the quote is not sealed: the
  // structured-data tier runs first (on the page Zyte handed over, usually at
  // no cost), bounded by the fetch timeouts and the chain deadline. Prices
  // from per-item vendor endpoints (ScraperAPI, Oxylabs) are exact and are
  // not held.
  const priceCheckTier = () => resolvers.find((r) => r.name === "structured-data" && r.available(ctx));
  const awaitingPriceCheck = () =>
    state.sources.price === "zyte" && !priceVerified() && !ran.includes("structured-data") && !!priceCheckTier();

  const done = () =>
    unavailable() ||
    (hasRequiredFields(state.product) &&
      !awaitingPriceCheck() &&
      (input.stopWhenRequired
        ? state.product.category != null || ran.includes("llm") || ran.includes("category-map")
        : hasWeight(state.product)));

  /** Wait on the pending tiers according to `resolver`'s start policy. */
  const waitFor = async (resolver: ExtractionResolver) => {
    const arrivedAt = Date.now();
    while (pending.size > 0 && !done()) {
      if (resolver.startWhen && resolver.startWhen(ctx)) return;
      const hedge = resolver.startAfterMs != null ? resolver.startAfterMs - (Date.now() - arrivedAt) : Infinity;
      if (hedge <= 0) return;
      const t = timer(Math.min(hedge, deadline - Date.now()));
      try {
        await Promise.race([...pending.values(), t.promise]);
      } finally {
        t.clear();
      }
      if (resolver.startAfterMs != null && Date.now() - arrivedAt >= resolver.startAfterMs) return;
    }
  };

  let refetchedDirect = false;
  for (let i = 0; i < resolvers.length; i++) {
    const resolver = resolvers[i]!;
    if (Date.now() >= deadline) {
      messages.push("Extraction ran out of time; some details may be missing.");
      skipped.push(...resolvers.slice(i).map((r) => r.name));
      break;
    }
    if (!resolver.available(ctx)) continue;

    await waitFor(resolver);

    if (done()) {
      skipped.push(...resolvers.slice(i).filter((r) => r.available(ctx)).map((r) => r.name));
      break;
    }
    if (!resolver.shouldRun(ctx)) continue;

    // Fast mode: once the listing is known, do not launch a browser for the
    // nice-to-haves — those tiers run in background enrichment instead. The
    // page's own offer is not a nice-to-have while an AI price is unverified.
    const verifiesPrice = resolver.name === "structured-data" && awaitingPriceCheck();
    if (input.stopWhenRequired && hasRequiredFields(state.product) && resolver.needsHtml && html.attempted === false && !verifiesPrice) {
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
      if (done()) {
        skipped.push(...resolvers.slice(i).filter((r) => r.available(ctx)).map((r) => r.name));
        break;
      }
    }

    void runResolver(resolver);
  }

  // Drain: the last tiers started may still be in flight.
  while (pending.size > 0 && !done() && Date.now() < deadline) {
    const t = timer(deadline - Date.now());
    try {
      await Promise.race([...pending.values(), t.promise]);
    } finally {
      t.clear();
    }
  }

  // A `startWhen` tier whose precondition only became true after the loop
  // passed it (e.g. the category classifier once a hedged vendor answered).
  for (const resolver of resolvers) {
    if (!resolver.startWhen || ran.includes(resolver.name) || pending.has(resolver.name)) continue;
    if (Date.now() >= deadline || done() || !resolver.available(ctx) || !resolver.shouldRun(ctx) || !resolver.startWhen(ctx)) continue;
    await runResolver(resolver);
  }

  closed = true;
  controller.abort();
  // Started but not finished → treat as not run, so enrichment can retry them.
  skipped.push(...[...pending.keys()].filter((n) => !skipped.includes(n)));

  if (unavailable()) {
    messages.push("The store lists this item as unavailable right now. You can still enter a price and our team will check it.");
  } else if (!hasRequiredFields(state.product)) {
    if (html.attempted && !html.result) messages.push("We could not load this product page. You can still continue and enter the details yourself.");
    else if (!state.product.title) messages.push("Product name could not be read from the page.");
    else if (state.product.price == null) messages.push("Price could not be read from the page. Enter it below and our team will verify it.");
  }
  if (hasRequiredFields(state.product) && !hasWeight(state.product) && skipped.length === 0) {
    messages.push(WEIGHT_NOT_LISTED_MESSAGE);
  }

  const primarySource = state.sources.title ?? (ran[0] ?? null);

  return {
    product: state.product,
    confidence: state.confidence,
    fieldSources: state.sources,
    ran,
    skipped: Array.from(new Set(skipped)),
    primarySource,
    htmlSource: html.result?.source ?? null,
    html: html.result,
    messages: Array.from(new Set(messages)),
    durationMs: Date.now() - started,
    timings,
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
  const all = input.resolvers ?? resolversForStore(storeFor(input));
  const remaining = all.filter((r) => previous.skipped.includes(r.name));
  if (remaining.length === 0) return previous;
  return resolveProduct({
    ...input,
    resolvers: remaining,
    seed: previous,
    initialHtml: previous.html,
  });
}
