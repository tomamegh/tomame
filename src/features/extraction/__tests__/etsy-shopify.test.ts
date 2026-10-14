import { describe, it, expect, vi } from "vitest";
import * as cheerio from "cheerio";
import fenty from "./fixtures/shopify-fenty-product.js.json";

vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/env", () => ({
  env: {
    extraction: { anthropicApiKey: null, apifyApiToken: null, browserlessApiKey: null, rainforestApiKey: null, scraperApiKey: null, oxylabsUsername: null, oxylabsPassword: null, zyteApiKey: null },
    ebay: { clientId: null, clientSecret: null, environment: null, verifyToken: null },
  },
}));

import { etsyScraper, etsyShippingText, parseEtsyShippingText } from "../scrapers/etsy";
import { fetchShopifyProduct, shopifyHandleOf, shopifyVariantIdOf } from "@/lib/shopify/client";
import { mapShopifyProduct, shopifyResolver } from "../resolvers/shopify.resolver";
import { platformHtmlResolver } from "../resolvers/platform-html.resolver";
import { resolveProduct, resolversForStore } from "../resolvers/chain";
import { STORES, storeForUrl } from "../stores";
import { getScraperByPlatform, SupportedPlatform } from "../scrapers";
import type { ExtractionResolver } from "../resolvers/types";
import { TomameCategory as C } from "@/config/categories/tomame_category";

/** The buy-box highlights list as Etsy renders it (2026-10-14), amount in a child element. */
const ETSY_PAID = `<html><head><title>Wallet - Etsy</title><script type="application/ld+json">{"@type":"Product","name":"Wallet","offers":{"@type":"Offer","price":"61.52","priceCurrency":"USD","url":"https://www.etsy.com/listing/1857958157/x"}}</script></head><body>
<h1>Handmade Full Grain Leather Wallet</h1>
<a href="/shop/LocalLeatherShop"><p>LocalLeatherShop</p></a>
<ul class="wt-block-grid-xs-1 wt-text-body-01"><li class="wt-block-grid__item"><div class="wt-ml-xs-1"><div class="wt-display-inline-flex-xs">Cost to ship: <span>$5.99</span></div></div></li><li class="wt-block-grid__item"><div>Returns accepted</div></li></ul>
<div id="shipping-and-returns-div">Order today to get by Oct 17-24</div></body></html>`;
const ETSY_FREE = ETSY_PAID.replace("Cost to ship: <span>$5.99</span>", "Free shipping");

describe("Etsy shipping", () => {
  it("reads the seller's shipping line and the shop name", () => {
    const paid = etsyScraper.extract(cheerio.load(ETSY_PAID));
    expect(paid).toMatchObject({ title: "Handmade Full Grain Leather Wallet", seller: "LocalLeatherShop", store_shipping: 5.99 });
    expect(etsyScraper.extract(cheerio.load(ETSY_FREE)).store_shipping).toBe(0);
    expect(etsyShippingText(cheerio.load("<html><body><p>Nothing here</p></body></html>"))).toBeNull();
  });

  it("parses the money however the locale prints it", () => {
    expect(parseEtsyShippingText("Cost to ship: $5.99")).toBe(5.99);
    expect(parseEtsyShippingText("Cost to ship: €27,68")).toBe(27.68);
    expect(parseEtsyShippingText("Cost to ship: $1,299.00")).toBe(1299);
    expect(parseEtsyShippingText("Free shipping")).toBe(0);
    expect(parseEtsyShippingText("Free delivery")).toBe(0);
    expect(parseEtsyShippingText("Ships from United States")).toBeNull();
    expect(parseEtsyShippingText(null)).toBeNull();
  });

  it("is the registered scraper for etsy.com, canonicalises to the listing id, and runs only on a page already in hand", () => {
    const scraper = getScraperByPlatform(SupportedPlatform.ETSY);
    expect(scraper.canonicalUrl("https://www.etsy.com/listing/1857958157/handmade-full-grain-leather-wallet-the?ref=x")).toBe("https://www.etsy.com/listing/1857958157");
    expect(scraper.isProductUrl("https://www.etsy.com/listing/1857958157/x")).toBe(true);
    expect(scraper.isProductUrl("https://www.etsy.com/search?q=wallet")).toBe(false);
    const etsy = STORES.find((s) => s.slug === "etsy")!;
    const resolvers = resolversForStore(etsy);
    const platformHtml = resolvers.find((r) => r.name === "platform-html")!;
    expect(platformHtml.startWhen).toBeDefined();
    expect(platformHtml.startWhen!({ htmlState: () => "unfetched" } as never)).toBe(false);
    expect(platformHtml.startWhen!({ htmlState: () => "ready" } as never)).toBe(true);
  });

  it("chain: Zyte's handed-over page gives the shipping without a fetch of its own", async () => {
    const fetchHtml = vi.fn(async () => null);
    const zyteLike: ExtractionResolver = {
      name: "zyte", defaultConfidence: 0.85, needsHtml: false, available: () => true, shouldRun: () => true,
      resolve: async (ctx) => {
        ctx.offerHtml?.(ETSY_PAID, "zyte");
        return { product: { title: "Handmade Full Grain Leather Wallet", price: 61.52, currency: "USD", category: C.OTHER } };
      },
    };
    const etsy = STORES.find((s) => s.slug === "etsy")!;
    const plan = resolversForStore(etsy).filter((r) => r.name === "platform-html" || r.name === "structured-data");
    const outcome = await resolveProduct({ url: "https://www.etsy.com/listing/1857958157", platform: "etsy", region: "USA", store: etsy, stopWhenRequired: true, resolvers: [zyteLike, ...plan], fetchHtml, budgetMs: 3_000 });
    expect(fetchHtml).not.toHaveBeenCalled();
    expect(outcome.product.store_shipping).toBe(5.99);
    expect(outcome.fieldSources.store_shipping).toBe("platform-html");
    expect(outcome.product.price).toBe(61.52);
    expect(outcome.product.seller).toBe("LocalLeatherShop");
  });

  it("chain: without a handed-over page the shipping read never starts a fetch", async () => {
    const fetchHtml = vi.fn(async () => null);
    const zyteLike: ExtractionResolver = {
      name: "zyte", defaultConfidence: 0.85, needsHtml: false, available: () => true, shouldRun: () => true,
      resolve: async () => ({ product: { title: "Wallet", price: 61.52, currency: "USD", category: C.OTHER } }),
    };
    const etsy = STORES.find((s) => s.slug === "etsy")!;
    const plan = resolversForStore(etsy).filter((r) => r.name === "platform-html");
    const outcome = await resolveProduct({ url: "https://www.etsy.com/listing/1857958157", platform: "etsy", region: "USA", store: etsy, stopWhenRequired: true, resolvers: [zyteLike, ...plan], fetchHtml, budgetMs: 2_000 });
    expect(fetchHtml).not.toHaveBeenCalled();
    expect(outcome.product.store_shipping).toBeNull();
    expect(outcome.ran).not.toContain("platform-html");
  });
});

describe("Shopify", () => {
  it("finds the handle and variant in product URLs, and refuses non-public or plain-http hosts", () => {
    expect(shopifyHandleOf("https://fentybeauty.com/products/gloss-bomb?variant=12345678")).toEqual({ origin: "https://fentybeauty.com", handle: "gloss-bomb" });
    expect(shopifyHandleOf("https://www.fashionnova.com/collections/dresses/products/abby-sweater-mini-dress")).toEqual({ origin: "https://www.fashionnova.com", handle: "abby-sweater-mini-dress" });
    expect(shopifyHandleOf("https://fentybeauty.com/collections/lip")).toBeNull();
    expect(shopifyHandleOf("http://fentybeauty.com/products/gloss-bomb")).toBeNull();
    expect(shopifyHandleOf("https://10.0.0.1/products/x")).toBeNull();
    expect(shopifyHandleOf("https://shop.internal/products/x")).toBeNull();
    expect(shopifyVariantIdOf("https://fentybeauty.com/products/gloss-bomb?variant=12345678")).toBe(12345678);
    expect(shopifyVariantIdOf("https://fentybeauty.com/products/gloss-bomb")).toBeNull();
    expect(shopifyResolver.available({ url: "https://fentybeauty.com/products/gloss-bomb" } as never)).toBe(true);
    expect(shopifyResolver.available({ url: "https://www.lg.com/us/tvs/lg-43qned74bua-qned-4k-tv" } as never)).toBe(false);
  });

  const productJson = {
    product: {
      id: 1, title: "Gloss Bomb Universal Lip Luminizer", handle: "gloss-bomb", vendor: "Fenty", product_type: "Lip Gloss", tags: "lip, gloss, bestseller", body_html: "<p>Explosive shine.</p>",
      images: [{ src: "//cdn.shopify.com/s/files/1/gloss.jpg" }],
      options: [{ name: "Shade", values: ["Fenty Glow", "Diamond Milk"] }],
      variants: [
        { id: 10001, title: "Fenty Glow", price: "21.00", compare_at_price: "24.00", price_currency: "USD", grams: 32, option1: "Fenty Glow", sku: "A1" },
        { id: 10002, title: "Diamond Milk", price: "21.00", compare_at_price: null, price_currency: "USD", grams: 32, option1: "Diamond Milk", sku: "A2" },
      ],
    },
  };
  const productJs = {
    id: 1, title: "Gloss Bomb Universal Lip Luminizer", handle: "gloss-bomb", vendor: "Fenty", type: "Lip Gloss", tags: ["lip", "gloss"], price: 2100, available: true,
    images: ["//cdn.shopify.com/s/files/1/gloss.jpg"], options: [{ name: "Shade", values: ["Fenty Glow", "Diamond Milk"] }],
    variants: [{ id: 10001, title: "Fenty Glow", price: 2100, compare_at_price: 2400, weight: 32, available: false, option1: "Fenty Glow" }, { id: 10002, title: "Diamond Milk", price: 2100, weight: 32, available: true, option1: "Diamond Milk" }],
  };
  const respond = (body: unknown, status = 200) => ({ status, headers: new Headers({ "content-type": "application/json" }), text: async () => JSON.stringify(body) });

  it("merges .json (price, currency, grams) with .js (availability), skips the sold-out variant, and never follows a redirect", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      expect(init?.redirect).toBe("manual");
      if (url.endsWith("/products/gloss-bomb.json")) return respond(productJson);
      if (url.endsWith("/products/gloss-bomb.js")) return respond(productJs);
      return respond({}, 404);
    });
    vi.stubGlobal("fetch", fetchMock);
    const product = (await fetchShopifyProduct("https://fentybeauty.com/products/gloss-bomb"))!;
    expect(product.variants.map((v) => [v.id, v.price, v.currency, v.grams, v.available])).toEqual([[10001, 21, "USD", 32, false], [10002, 21, "USD", 32, true]]);

    const mapped = mapShopifyProduct(product, "https://fentybeauty.com/products/gloss-bomb", "USD");
    expect(mapped).toMatchObject({ title: "Gloss Bomb Universal Lip Luminizer", price: 21, currency: "USD", brand: "Fenty", weight_lbs: 0.07, availability: "In Stock", image: "https://cdn.shopify.com/s/files/1/gloss.jpg" });
    expect(mapped.specifications).toMatchObject({ Shade: "Diamond Milk", Brand: "Fenty" });
    expect(mapped.variants).toEqual({ shade: ["Fenty Glow", "Diamond Milk"] });
    expect(mapped.metadata).toMatchObject({ shopifyVariantId: 10002, priceSource: "shopify", categoryText: "Lip Gloss" });
    expect(mapped.metadata?.breadcrumbs).toEqual(["Lip Gloss", "lip", "gloss", "bestseller"]);

    const chosen = mapShopifyProduct(product, "https://fentybeauty.com/products/gloss-bomb?variant=10001", "USD");
    expect(chosen).toMatchObject({ price: 21, availability: "Out of stock" });
    expect(chosen.metadata).toMatchObject({ listPrice: 24, shopifyVariantId: 10001 });
    vi.unstubAllGlobals();
  });

  it("a store without the endpoints is simply not Shopify; a GBP store's currency comes from .json", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => respond("<html>", 404)));
    expect(await fetchShopifyProduct("https://www.lg.com/products/tv")).toBeNull();
    vi.stubGlobal("fetch", vi.fn(async (url: string) => (url.endsWith(".json") ? respond({ product: { ...productJson.product, variants: [{ ...productJson.product.variants[0], price: "18.00", price_currency: "GBP" }] } }) : respond({}, 404))));
    const gb = (await fetchShopifyProduct("https://www.boohoo.com/products/dress"))!;
    expect(mapShopifyProduct(gb, "https://www.boohoo.com/products/dress", "GBP")).toMatchObject({ price: 18, currency: "GBP" });
    vi.unstubAllGlobals();
  });

  it("maps the real Fenty .js record", () => {
    const js = fenty as unknown as Record<string, unknown>;
    expect(js.title).toBe("Fenty Beauty x CASETiFY Collab");
  });

  it("is first in the plan for every store without a scraper of its own", () => {
    const named = storeForUrl("https://www.fashionnova.com/products/abby-sweater-mini-dress")!;
    expect(resolversForStore(named).map((r) => r.name).slice(0, 2)).toEqual(["shopify", "zyte"]);
    const generic = storeForUrl("https://shop.example-boutique.com/products/hat")!;
    expect(resolversForStore(generic)[0]!.name).toBe("shopify");
    expect(platformHtmlResolver.needsHtml).toBe(true);
  });
});
