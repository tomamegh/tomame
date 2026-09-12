import { describe, it, expect, vi } from "vitest";
import { STORES } from "../stores";
import * as cheerio from "cheerio";

vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/env", () => ({ env: { extraction: { anthropicApiKey: null, apifyApiToken: null, browserlessApiKey: null, rainforestApiKey: null, scraperApiKey: null } } }));

import { extractFromJsonLd, extractFromMeta, parseJsonLd, structuredDataResolver } from "../resolvers/structured-data.resolver";
import { pageToText } from "../resolvers/llm.resolver";
import { emptyProduct, SupportedPlatform, getScraperByPlatform } from "../scrapers";

const PAGE = `<!doctype html><html><head>
<title>Widget Pro | ShopCo</title>
<meta property="og:title" content="Widget Pro 3000">
<meta property="og:image" content="https://cdn.shopco.com/widget.jpg">
<meta property="og:image" content="https://cdn.shopco.com/widget-side.jpg">
<meta property="product:availability" content="instock">
<meta property="product:price:amount" content="49.99">
<meta property="product:price:currency" content="GBP">
<script type="application/ld+json">
{"@context":"https://schema.org","@graph":[
 {"@type":"BreadcrumbList"},
 {"@type":"Product","name":"Widget Pro 3000 (Blue)","brand":{"@type":"Brand","name":"ShopCo"},
  "image":["https://cdn.shopco.com/widget-1.jpg",{"@type":"ImageObject","url":"https://cdn.shopco.com/widget-2.jpg"},"https://cdn.shopco.com/widget-1.jpg"],
  "aggregateRating":{"@type":"AggregateRating","ratingValue":"4.6","reviewCount":"1,204"},
  "weight":{"@type":"QuantitativeValue","value":"540","unitCode":"GRM"},
  "offers":{"@type":"Offer","price":"47.50","priceCurrency":"GBP","itemCondition":"https://schema.org/RefurbishedCondition","availability":"https://schema.org/InStock","seller":{"@type":"Organization","name":"ShopCo Outlet"}}}
]}
</script>
<script>window.__STATE__ = {secret: 1};</script>
<style>.x{}</style>
</head><body><nav>Home</nav><h1>Widget Pro 3000</h1><p>Item Weight: 540 g</p><footer>©</footer></body></html>`;

describe("structured data parsing", () => {
  const $ = cheerio.load(PAGE);

  it("reads Product inside @graph with offer price, brand, image and weight", () => {
    const ld = extractFromJsonLd(parseJsonLd($));
    expect(ld.title).toBe("Widget Pro 3000 (Blue)");
    expect(ld.price).toBe(47.5);
    expect(ld.currency).toBe("GBP");
    expect(ld.brand).toBe("ShopCo");
    expect(ld.image).toBe("https://cdn.shopco.com/widget-1.jpg");
    expect(ld.weight_lbs).toBeCloseTo(1.19, 2);
  });

  it("reads typed facts from JSON-LD: images (string | ImageObject, de-duplicated), aggregateRating, offer condition/availability/seller", () => {
    const ld = extractFromJsonLd(parseJsonLd($));
    expect(ld.images).toEqual(["https://cdn.shopco.com/widget-1.jpg", "https://cdn.shopco.com/widget-2.jpg"]);
    expect(ld.rating).toBe(4.6);
    expect(ld.review_count).toBe(1204);
    expect(ld.condition).toBe("Refurbished");
    expect(ld.availability).toBe("In Stock");
    expect(ld.seller).toBe("ShopCo Outlet");
  });

  it("leaves typed facts unset when the Product node does not state them", () => {
    const ld = extractFromJsonLd([{ "@type": "Product", name: "Bare", offers: { "@type": "Offer", price: "1", priceCurrency: "USD" } }]);
    expect(ld.condition).toBeUndefined();
    expect(ld.seller).toBeUndefined();
    expect(ld.rating).toBeUndefined();
    expect(ld.images).toBeUndefined();
  });

  it("reads OpenGraph/product meta as a fallback", () => {
    const og = extractFromMeta($);
    expect(og.title).toBe("Widget Pro 3000");
    expect(og.price).toBe(49.99);
    expect(og.currency).toBe("GBP");
    expect(og.image).toBe("https://cdn.shopco.com/widget.jpg");
    expect(og.images).toEqual(["https://cdn.shopco.com/widget.jpg", "https://cdn.shopco.com/widget-side.jpg"]);
    expect(og.availability).toBe("In Stock");
  });

  it("resolver prefers JSON-LD over OG and marks OG-only fields lower confidence", async () => {
    const result = await structuredDataResolver.resolve({
      url: "https://www.ebay.co.uk/itm/123456789012",
      platform: SupportedPlatform.EBAY,
      scraper: getScraperByPlatform(SupportedPlatform.EBAY),
      region: "UK",
      deadline: Date.now() + 10_000,
      store: STORES[0]!,
      signal: new AbortController().signal,
      getHtml: async () => ({ html: PAGE, source: "direct" }),
      htmlState: () => "ready" as const,
      current: emptyProduct(),
    });
    expect(result.product.price).toBe(47.5);
    expect(result.product.title).toBe("Widget Pro 3000 (Blue)");
    expect(result.confidence?.title).toBeUndefined();
    expect(result.product.images).toEqual(["https://cdn.shopco.com/widget-1.jpg", "https://cdn.shopco.com/widget-2.jpg"]); // JSON-LD gallery outranks OG
    expect(result.product.image).toBe("https://cdn.shopco.com/widget-1.jpg");
    expect(result.product.seller).toBe("ShopCo Outlet");
  });
});

describe("pageToText (LLM input)", () => {
  it("keeps visible text, meta and JSON-LD; drops scripts, styles, nav, footer", () => {
    const text = pageToText(PAGE);
    expect(text).toContain("Item Weight: 540 g");
    expect(text).toContain("og:title: Widget Pro 3000");
    expect(text).toContain('"@type":"Product"');
    expect(text).not.toContain("__STATE__");
    expect(text).not.toContain(".x{}");
    expect(text).not.toContain("Home");
    expect(text).not.toContain("©");
  });

  it("caps output length", () => {
    const big = `<html><body>${"word ".repeat(50_000)}</body></html>`;
    expect(pageToText(big, 1_000).length).toBeLessThanOrEqual(1_000);
  });
});
