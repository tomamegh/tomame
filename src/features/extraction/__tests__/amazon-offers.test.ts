import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fixture from "./fixtures/scraperapi-amazon-offers.json";

vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/env", () => ({
  env: { extraction: { anthropicApiKey: null, apifyApiToken: null, browserlessApiKey: null, rainforestApiKey: null, scraperApiKey: "sa-test-key" } },
}));

import { amazonOffersResolver, chooseAmazonOffer, hasNoBuyBox, isTrustedSeller, mapAmazonOffers } from "../resolvers/amazon-offers.resolver";
import { resolveProduct } from "../resolvers/chain";
import { rereadTiers } from "../price-reread";
import { assessPriceConfidence } from "../price-confidence";
import { detectStockSignals } from "../stock-signals";
import { emptyProduct, SupportedPlatform } from "../scrapers";
import { STORES } from "../stores";
import { resolversForStore } from "../resolvers/chain";
import type { ScraperApiAmazonOffer, ScraperApiAmazonOffers } from "@/lib/scraperapi/client";
import type { ExtractionResolver } from "../resolvers/types";

const URL = "https://www.amazon.com/dp/B0DJ1C3J2B";
const payload = fixture as ScraperApiAmazonOffers;
const listings = payload.listings!;
const offer = (o: Partial<ScraperApiAmazonOffer>): ScraperApiAmazonOffer => ({ price: 20, price_symbol: "$", condition: "New", seller_name: "Shop", ...o });

describe("chooseAmazonOffer", () => {
  it("takes the pinned New offer (Amazon.com, $13.49, free shipping) from the live payload", () => {
    const chosen = chooseAmazonOffer(listings)!;
    expect(chosen.price).toBe(13.49);
    expect(chosen.shipping).toBe(0);
    expect(chosen.notNew).toBe(false);
    expect(chosen.offer.seller_name).toBe("Amazon.com");
  });

  it("without a pinned offer, takes the cheapest New offer from a trusted seller", () => {
    const unpinned = listings.filter((l) => !l.pinned_offer);
    // ethapan $22.80: 100% over 515 ratings.
    expect(chooseAmazonOffer(unpinned)!.offer.seller_name).toBe("ethapan");
  });

  it("skips a cheaper seller below the bar", () => {
    const chosen = chooseAmazonOffer([
      offer({ price: 10, seller_name: "tiny", seller_percent_positive_ratings: "100%", seller_total_reviews: "12" }),
      offer({ price: 11, seller_name: "meh", seller_percent_positive_ratings: "85%", seller_total_reviews: "4,000" }),
      offer({ price: 14, seller_name: "good", seller_percent_positive_ratings: "92%", seller_total_reviews: "1,200", shipping_price: "$5.99" }),
    ])!;
    expect(chosen.offer.seller_name).toBe("good");
    expect(chosen.shipping).toBe(5.99);
  });

  it("trusts Amazon itself and FBA whatever their ratings say", () => {
    expect(isTrustedSeller(offer({ seller_name: "Amazon.com" }))).toBe(true);
    expect(isTrustedSeller(offer({ seller_name: "Miniature Marvels LLC", fullfilled_by_amazon: true, seller_total_reviews: "11" }))).toBe(true);
    expect(isTrustedSeller(offer({ seller_percent_positive_ratings: 90, seller_total_reviews: 50 }))).toBe(true);
    expect(isTrustedSeller(offer({ seller_percent_positive_ratings: "89%", seller_total_reviews: "5000" }))).toBe(false);
  });

  it("a pinned offer that is not New is not quoted while New offers exist", () => {
    const chosen = chooseAmazonOffer([
      offer({ price: 9, condition: "Used - Like New", pinned_offer: true, seller_name: "Amazon Resale" }),
      offer({ price: 15, seller_name: "Amazon.com" }),
    ])!;
    expect(chosen.price).toBe(15);
    expect(chosen.notNew).toBe(false);
  });

  it("only used or renewed offers: the cheapest trusted one, marked not new", () => {
    const chosen = chooseAmazonOffer([
      offer({ price: 30, condition: "Used - Good", seller_name: "nobody", seller_total_reviews: "3" }),
      offer({ price: 40, condition: "Renewed", fullfilled_by_amazon: true }),
    ])!;
    expect(chosen.price).toBe(40);
    expect(chosen.notNew).toBe(true);
  });

  it("no offers, or only untrusted New sellers: nothing to quote", () => {
    expect(chooseAmazonOffer([])).toBeNull();
    expect(chooseAmazonOffer([offer({ seller_total_reviews: "2" })])).toBeNull();
    expect(chooseAmazonOffer([offer({ price: 0, seller_name: "Amazon.com" })])).toBeNull();
  });
});

describe("mapAmazonOffers", () => {
  it("maps the live payload: listing name and image, the offer's price, seller, condition and shipping", () => {
    const { product } = mapAmazonOffers(payload, URL);
    expect(product.title).toMatch(/^LEGO Marvel Iron Man Mech vs\. Ultron/);
    expect(product.image).toBe("https://m.media-amazon.com/images/I/51BVpvjJNeL.jpg");
    expect(product.price).toBe(13.49);
    expect(product.currency).toBe("USD");
    expect(product.store_shipping).toBe(0);
    expect(product.seller).toBe("Amazon.com");
    expect(product.condition).toBe("New");
    expect(product.rating).toBe(5);
    expect(product.review_count).toBe(1613);
    expect(product.metadata).toMatchObject({ asin: "B0DJ1C3J2B", offerCount: 11, offerPinned: true, offerFba: true, priceVia: "pinned-offer" });
  });

  it("an only-renewed listing carries its condition, so the stock check triggers", () => {
    const { product } = mapAmazonOffers({ item: { name: "Kindle Paperwhite" }, listings: [offer({ price: 89, condition: "Renewed", fullfilled_by_amazon: true })] }, URL);
    expect(product.condition).toBe("Renewed");
    const signals = detectStockSignals({ ...emptyProduct(), ...product, metadata: product.metadata ?? {} });
    expect(signals.map((s) => s.code)).toContain("condition");
  });

  it("no offers: title only, no price (the couldn't-read path)", () => {
    const { product, chosen } = mapAmazonOffers({ item: { name: "LEGO" }, listings: [] }, URL);
    expect(chosen).toBeNull();
    expect(product.title).toBe("LEGO");
    expect(product.price).toBeUndefined();
  });

  it("an offer price is confirmed: exact offer for the ASIN", () => {
    const { product } = mapAmazonOffers(payload, URL);
    const verdict = assessPriceConfidence({ storeCurrency: "USD", product: { ...emptyProduct(), ...product, metadata: product.metadata ?? {} }, priceSource: "amazon-offers", reads: [{ source: "amazon-offers", price: 13.49, currency: "USD" }] });
    expect(verdict?.level).toBe("confirmed");
  });

  it("knows a no-buy-box availability phrase", () => {
    expect(hasNoBuyBox({ availability: "No featured offers available", metadata: {} })).toBe(true);
    expect(hasNoBuyBox({ availability: "In Stock", metadata: {} })).toBe(false);
  });
});

describe("amazon-offers in the race", () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  const productRead = (product: Record<string, unknown>): ExtractionResolver => ({
    name: "scraperapi",
    defaultConfidence: 0.95,
    needsHtml: false,
    available: () => true,
    shouldRun: () => true,
    resolve: async () => ({ product }),
  });

  it("a product read with no buy box ('Currently unavailable') is priced from the offer list", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify(payload), { status: 200 }));
    const out = await resolveProduct({
      url: URL,
      platform: SupportedPlatform.AMAZON,
      region: "USA",
      resolvers: [productRead({ title: "LEGO Iron Man Mech 76307", availability: "Currently unavailable", category: "toys_games" }), amazonOffersResolver],
      stopWhenRequired: true,
      budgetMs: 10_000,
    });
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("/structured/amazon/offers?");
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("asin=B0DJ1C3J2B");
    expect(out.product.price).toBe(13.49);
    expect(out.fieldSources.price).toBe("amazon-offers");
    expect(out.product.title).toBe("LEGO Iron Man Mech 76307"); // the product read keeps the title
    expect(out.product.seller).toBe("Amazon.com");
    expect(out.product.store_shipping).toBe(0);
    expect(out.messages.join(" ")).not.toMatch(/unavailable right now/);
  });

  it("does not run when the product read priced the item", async () => {
    const out = await resolveProduct({
      url: URL,
      platform: SupportedPlatform.AMAZON,
      region: "USA",
      resolvers: [productRead({ title: "LEGO", price: 13.49, currency: "USD", category: "toys_games" }), amazonOffersResolver],
      stopWhenRequired: true,
      budgetMs: 10_000,
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(out.product.price).toBe(13.49);
  });

  it("no offers at all: still unpriced, with the store's unavailable note", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ item: { name: "LEGO" }, listings: [] }), { status: 200 }));
    const out = await resolveProduct({
      url: URL,
      platform: SupportedPlatform.AMAZON,
      region: "USA",
      resolvers: [productRead({ title: "LEGO", availability: "Currently unavailable" }), amazonOffersResolver],
      stopWhenRequired: true,
      budgetMs: 10_000,
    });
    expect(out.product.price).toBeNull();
    expect(out.messages.join(" ")).toMatch(/unavailable right now/);
  });

  it("is the first tier an Amazon price re-read tries, the rest only after it", () => {
    const amazon = STORES.find((s) => s.slug === "amazon")!;
    const tiers = rereadTiers(resolversForStore(amazon), "zyte");
    expect(tiers[0]?.name).toBe("amazon-offers");
    expect(tiers.map((t) => t.name)).not.toContain("zyte");
    expect(tiers.every((t) => t.startAfterMs == null && t.startWhen == null)).toBe(true);
  });
});
