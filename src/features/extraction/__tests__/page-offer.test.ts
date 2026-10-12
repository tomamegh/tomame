import { describe, it, expect, vi } from "vitest";
import * as cheerio from "cheerio";

vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/env", () => ({
  env: { extraction: { anthropicApiKey: null, apifyApiToken: null, browserlessApiKey: null, rainforestApiKey: null, scraperApiKey: null, oxylabsUsername: null, oxylabsPassword: null, zyteApiKey: "z" } },
}));

import { PAGE_OFFER_CONFIDENCE, extractFromJsonLd, parseJsonLd, pickProductNode, sameProductUrl, structuredDataResolver } from "../resolvers/structured-data.resolver";
import { zyteResolver } from "../resolvers/zyte.resolver";
import { resolveProduct } from "../resolvers/chain";
import { emptyProduct, getScraperForStore } from "../scrapers";
import { GENERIC_STORE, storeForUrl } from "../stores";
import type { ExtractionResolver, HtmlFetch, ResolveContext } from "../resolvers/types";
import { TomameCategory as C } from "@/config/categories/tomame_category";

const PAGE_URL = "https://www.lg.com/us/tvs/lg-43qned74bua-qned-4k-tv";

/** LG's page: every size of the series as its own Product node, the 85-inch first. */
const LG_HTML = `<!doctype html><html><head><title>43 Inch Class LG QNED74B | LG USA</title>
<script type="application/ld+json">{"@context":"https://schema.org","@type":"Product","name":"85 Inch Class LG QNED AI QNED74B","sku":"85QNED74BUA",
 "offers":{"@type":"Offer","url":"https://www.lg.com/us/tvs/lg-85qned74bua-qned-4k-tv","priceCurrency":"USD","price":849.99,"availability":"https://schema.org/InStock"}}</script>
<script type="application/ld+json">{"@context":"https://schema.org","@type":"Product","name":"50 Inch Class LG QNED AI QNED74B","sku":"50QNED74BUA",
 "offers":{"@type":"Offer","url":"https://www.lg.com/us/tvs/lg-50qned74bua-qned-4k-tv","priceCurrency":"USD","price":299.99,"availability":"https://schema.org/InStock"}}</script>
<script type="application/ld+json">{"@context":"https://schema.org","@type":"Product","name":"43 Inch Class LG QNED AI QNED74B Mini LED 4K Smart TV 2026","sku":"43QNED74BUA","brand":{"@type":"Brand","name":"LG"},
 "offers":{"@type":"Offer","url":"https://www.lg.com/us/tvs/lg-43qned74bua-qned-4k-tv?utm=x","priceCurrency":"USD","price":249.99,"availability":"https://schema.org/InStock",
 "priceSpecification":[{"@type":"UnitPriceSpecification","priceType":"https://schema.org/StrikethroughPrice","price":329.99,"priceCurrency":"USD"}]}}</script>
</head><body><h1>43 Inch Class LG QNED AI QNED74B</h1>${"x".repeat(40_000)}</body></html>`;

describe("sameProductUrl / pickProductNode", () => {
  it("matches the same page across scheme, www, query, hash and trailing slash", () => {
    expect(sameProductUrl("http://lg.com/us/tvs/lg-43qned74bua-qned-4k-tv/?a=1#b", PAGE_URL)).toBe(true);
    expect(sameProductUrl("/us/tvs/lg-43qned74bua-qned-4k-tv", PAGE_URL, PAGE_URL)).toBe(true);
    expect(sameProductUrl("https://www.lg.com/us/tvs/lg-85qned74bua-qned-4k-tv", PAGE_URL)).toBe(false);
    expect(sameProductUrl(null, PAGE_URL)).toBe(false);
  });

  it("picks the Product node whose offer is this page, else the first", () => {
    const nodes = parseJsonLd(cheerio.load(LG_HTML));
    expect(pickProductNode(nodes, PAGE_URL)).toMatchObject({ urlMatched: true, product: { sku: "43QNED74BUA" } });
    expect(pickProductNode(nodes)).toMatchObject({ urlMatched: false, product: { sku: "85QNED74BUA" } });
    expect(pickProductNode(nodes, "https://www.lg.com/us/tvs/other")).toMatchObject({ urlMatched: false, product: { sku: "85QNED74BUA" } });
  });
});

describe("extractFromJsonLd with the page url", () => {
  it("prices the 43-inch page at the 43-inch offer, with its strike-through", () => {
    const ld = extractFromJsonLd(parseJsonLd(cheerio.load(LG_HTML)), PAGE_URL);
    expect(ld.title).toBe("43 Inch Class LG QNED AI QNED74B Mini LED 4K Smart TV 2026");
    expect(ld.price).toBe(249.99);
    expect(ld.currency).toBe("USD");
    expect(ld.metadata).toMatchObject({ listPrice: 329.99, offerUrlMatched: true, priceSource: "page-offer" });
  });

  it("without the url the first node still wins and carries no page-offer mark", () => {
    const ld = extractFromJsonLd(parseJsonLd(cheerio.load(LG_HTML)));
    expect(ld.price).toBe(849.99);
    expect(ld.metadata?.offerUrlMatched).toBeUndefined();
  });
});

function ctxFor(url: string, html: string | null, extra: Partial<ResolveContext> = {}): ResolveContext {
  const store = storeForUrl(url) ?? GENERIC_STORE;
  return {
    url, platform: store.slug, store, scraper: getScraperForStore(store), region: "USA", deadline: Date.now() + 25_000,
    signal: new AbortController().signal,
    getHtml: async () => (html ? { html, source: "scraperapi" } : null),
    htmlState: () => (html ? "ready" : "none"),
    current: emptyProduct(),
    ...extra,
  };
}

describe("structured-data resolver", () => {
  it("rates the page's own offer above any AI read", async () => {
    const r = await structuredDataResolver.resolve(ctxFor(PAGE_URL, LG_HTML));
    expect(r.product.price).toBe(249.99);
    expect(r.confidence).toMatchObject({ price: PAGE_OFFER_CONFIDENCE, currency: PAGE_OFFER_CONFIDENCE });
    expect(PAGE_OFFER_CONFIDENCE).toBeGreaterThan(zyteResolver.defaultConfidence);
  });
});

describe("zyte resolver with the page in hand", () => {
  const zyteResponse = (price: string, withBody: boolean) => ({
    url: PAGE_URL, statusCode: 200,
    product: { name: "43 Inch Class LG QNED AI QNED74B Mini LED 4K Smart TV 2026", price, regularPrice: "1099.99", currency: "USD", sku: "43QNED74BUA", metadata: { probability: 0.98 } },
    ...(withBody ? { httpResponseBody: Buffer.from(LG_HTML).toString("base64") } : {}),
  });

  it("asks for the page with the product, overrides the AI price with the page's own offer, and hands the page to the chain", async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => ({ ok: true, json: async () => zyteResponse("849.99", true), _body: init?.body }));
    vi.stubGlobal("fetch", fetchMock);
    const offered: HtmlFetch[] = [];
    const r = await zyteResolver.resolve(ctxFor(PAGE_URL, null, { offerHtml: (h, source) => offered.push({ html: h, source }) }));
    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(body).toMatchObject({ product: true, httpResponseBody: true });
    expect(r.product.price).toBe(249.99);
    expect(r.product.metadata).toMatchObject({ listPrice: 329.99, priceSource: "page-offer" });
    expect(r.confidence).toMatchObject({ price: PAGE_OFFER_CONFIDENCE, currency: PAGE_OFFER_CONFIDENCE });
    expect(offered).toHaveLength(1);
    expect(offered[0]).toMatchObject({ source: "zyte" });
    vi.unstubAllGlobals();
  });

  it("keeps the AI price when the page has no offer for this url", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => zyteResponse("249.99", false) })));
    const r = await zyteResolver.resolve(ctxFor(PAGE_URL, null));
    expect(r.product.price).toBe(249.99);
    expect(r.confidence?.price).toBeUndefined();
    vi.unstubAllGlobals();
  });
});

describe("chain: the quote waits for the page's own offer", () => {
  const slow = <T,>(ms: number, v: T) => new Promise<T>((res) => setTimeout(() => res(v), ms));

  function ai(price: number): ExtractionResolver {
    return {
      name: "zyte", defaultConfidence: 0.85, needsHtml: false, available: () => true, shouldRun: () => true,
      resolve: async () => slow(10, { product: { title: "43 Inch Class LG QNED74B", price, currency: "USD", category: C.TV_VIDEO } }),
    };
  }
  const pageRead: ExtractionResolver = {
    ...structuredDataResolver, startAfterMs: 0,
    resolve: structuredDataResolver.resolve.bind(structuredDataResolver),
  };

  it("an AI price that lands first does not seal the quote while the page's own offer is still being read", async () => {
    const outcome = await resolveProduct({
      url: PAGE_URL, platform: GENERIC_STORE.slug, region: "USA", store: GENERIC_STORE, stopWhenRequired: true,
      resolvers: [ai(849.99), pageRead],
      fetchHtml: async () => slow(60, { html: LG_HTML, source: "scraperapi" as const }),
    });
    expect(outcome.ran).toEqual(expect.arrayContaining(["zyte", "structured-data"]));
    expect(outcome.product.price).toBe(249.99);
    expect(outcome.fieldSources.price).toBe("structured-data");
    expect(outcome.product.metadata.listPrice).toBe(329.99);
    expect(outcome.product.metadata.priceSource).toBe("page-offer");
  });

  it("a page handed over by a tier is read by the free parsers without a fetch", async () => {
    const fetchHtml = vi.fn(async () => slow(500, null));
    const handing: ExtractionResolver = {
      ...ai(849.99),
      resolve: async (ctx) => {
        ctx.offerHtml?.(LG_HTML, "zyte");
        return { product: { title: "43 Inch Class LG QNED74B", price: 849.99, currency: "USD", category: C.TV_VIDEO } };
      },
    };
    const outcome = await resolveProduct({
      url: PAGE_URL, platform: GENERIC_STORE.slug, region: "USA", store: GENERIC_STORE, stopWhenRequired: true,
      resolvers: [handing, pageRead], fetchHtml, budgetMs: 3_000,
    });
    expect(outcome.product.price).toBe(249.99);
    expect(outcome.htmlSource).toBe("zyte");
    expect(outcome.durationMs).toBeLessThan(400);
  });
});
