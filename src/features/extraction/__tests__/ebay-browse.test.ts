import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
const envState: Record<string, string | null> = { EBAY_CLIENT_ID: "app", EBAY_CLIENT_SECRET: "secret", EBAY_ENV: null, EBAY_VERIFY_TOKEN: null };
vi.mock("@/lib/env", () => ({
  env: {
    extraction: { anthropicApiKey: null, apifyApiToken: null, browserlessApiKey: null, rainforestApiKey: null, scraperApiKey: null, oxylabsUsername: null, oxylabsPassword: null, zyteApiKey: null },
    ebay: {
      get clientId() { return envState.EBAY_CLIENT_ID; },
      get clientSecret() { return envState.EBAY_CLIENT_SECRET; },
      get environment() { return envState.EBAY_ENV; },
      get verifyToken() { return envState.EBAY_VERIFY_TOKEN; },
    },
  },
}));
const warehouse = vi.fn(async (): Promise<Record<string, unknown> | null> => ({ city: "New York, NY", postal_code: "10475" }));
vi.mock("@/db/queries/warehouse", () => ({ getWarehouseAddress: () => warehouse() }));
vi.mock("@/lib/exchange-rates/service", () => ({ getGhsRate: vi.fn(async (cur: string) => (cur === "USD" ? 12 : null)) }));
vi.mock("@/features/pricing/services/pricing.service", () => ({ loadPricingCalculator: vi.fn() }));

import { ebayResolver, mapEbayItem, mapEbayShippingOptions } from "../resolvers/ebay.resolver";
import { fetchEbayItem, type EbayItem } from "@/lib/ebay/browse";
import { resetEbayTokenCache } from "@/lib/ebay/client";
import { hubDestinationFor, resetHubDestinationCache } from "../hub-destination";
import { pickStoreShippingOption, storeShippingOptionsOf } from "../store-shipping";
import { ebayVariantIdOf } from "../url";
import { getScraperByPlatform, SupportedPlatform, emptyProduct, withProductDefaults } from "../scrapers";
import { priceExtractionWith } from "../quote.service";
import { PricingCalculator } from "@/lib/pricing";
import type { ExtractionResult } from "../types";
import type { PricingGroupRow } from "@/db/queries/pricing-groups";
import { TomameCategory as C } from "@/config/categories/tomame_category";

/** Trimmed from the live Browse API answer for item 115827204539 (2026-10-14), plus a second service. */
const ITEM: EbayItem = {
  itemId: "v1|115827204539|0",
  legacyItemId: "115827204539",
  title: "6 in 1 USB3.0 Type C Hub USB C Hub Multiport Adapter 4K HDMI Output + 2x USB 3.0",
  shortDescription: "Six ports in one.",
  price: { value: "7.50", currency: "USD" },
  marketingPrice: { originalPrice: { value: "14.99", currency: "USD" }, discountPercentage: "50.0" },
  condition: "New",
  conditionId: "1000",
  itemLocation: { city: "Upland", stateOrProvince: "California", postalCode: "917**", country: "US" },
  categoryPath: "Computers/Tablets & Networking|Computer Cables & Connectors|USB Cables, Hubs & Adapters",
  brand: "Kootion",
  seller: { username: "bestflash2018", feedbackPercentage: "99.3" },
  estimatedAvailabilities: [{ estimatedAvailabilityStatus: "IN_STOCK", estimatedRemainingQuantity: 236 }],
  image: { imageUrl: "https://i.ebayimg.com/images/g/TwEAAOSwUOtl8sl1/s-l1600.jpg" },
  additionalImages: [{ imageUrl: "https://i.ebayimg.com/images/g/abc/s-l1600.jpg" }],
  shippingOptions: [
    { type: "Expedited Shipping", shippingServiceCode: "FedEx Home Delivery", shippingCarrierCode: "FedEx", shippingCost: { value: "24.57", currency: "USD" }, minEstimatedDeliveryDate: "2026-10-15T10:00:00.000Z", maxEstimatedDeliveryDate: "2026-10-17T10:00:00.000Z", shipToLocationUsedForEstimate: { country: "US", postalCode: "10475" } },
    { type: "Standard Shipping", shippingServiceCode: "USPS Ground Advantage", shippingCarrierCode: "USPS", shippingCost: { value: "14.20", currency: "USD" }, minEstimatedDeliveryDate: "2026-10-15T10:00:00.000Z", maxEstimatedDeliveryDate: "2026-10-17T10:00:00.000Z" },
  ],
  localizedAspects: [
    { name: "Brand", value: "Kootion" },
    { name: "Item Weight", value: "2.4 oz" },
    { name: "Color", value: "Silver" },
  ],
};

const URL_US = "https://www.ebay.com/itm/115827204539";

beforeEach(() => {
  resetEbayTokenCache();
  resetHubDestinationCache();
  vi.unstubAllGlobals();
});

describe("mapEbayItem", () => {
  it("reads the listing as the store records it, cheapest service as store shipping, all services kept", () => {
    const p = mapEbayItem(ITEM, URL_US, { country: "US", zip: "10475" });
    expect(p).toMatchObject({ title: ITEM.title, price: 7.5, currency: "USD", brand: "Kootion", condition: "New", seller: "bestflash2018", category: C.COMPUTERS, availability: "In Stock", store_shipping: 14.2, weight_lbs: 0.15 });
    expect(p.images).toEqual(["https://i.ebayimg.com/images/g/TwEAAOSwUOtl8sl1/s-l1600.jpg", "https://i.ebayimg.com/images/g/abc/s-l1600.jpg"]);
    expect(p.metadata).toMatchObject({ listPrice: 14.99, priceSource: "ebay-api", legacyItemId: "115827204539", storeShippingTo: { country: "US", zip: "10475" } });
    expect(p.metadata?.breadcrumbs).toEqual(["Computers/Tablets & Networking", "Computer Cables & Connectors", "USB Cables, Hubs & Adapters"]);
    expect(mapEbayShippingOptions(ITEM)).toEqual([
      { code: "USPS Ground Advantage", label: "USPS Standard Shipping", cost: 14.2, currency: "USD", eta_min: "2026-10-15T10:00:00.000Z", eta_max: "2026-10-17T10:00:00.000Z" },
      { code: "FedEx Home Delivery", label: "FedEx Expedited Shipping", cost: 24.57, currency: "USD", eta_min: "2026-10-15T10:00:00.000Z", eta_max: "2026-10-17T10:00:00.000Z" },
    ]);
  });

  it("free shipping is 0, no services is unknown, out of stock has no price", () => {
    const free = mapEbayItem({ ...ITEM, shippingOptions: [{ type: "Standard Shipping", shippingCost: { value: "0.00", currency: "USD" } }] }, URL_US, { country: "US", zip: null });
    expect(free.store_shipping).toBe(0);
    const none = mapEbayItem({ ...ITEM, shippingOptions: [] }, URL_US, { country: "US", zip: null });
    expect(none.store_shipping).toBeNull();
    expect(none.metadata?.storeShippingOptions).toEqual([]);
    const oos = mapEbayItem({ ...ITEM, price: undefined, estimatedAvailabilities: [{ estimatedAvailabilityStatus: "OUT_OF_STOCK" }] }, URL_US, { country: "US", zip: null });
    expect(oos.price).toBeNull();
    expect(oos.availability).toBe("Out of stock");
  });
});

describe("store shipping options on a snapshot", () => {
  const product = mapEbayItem(ITEM, URL_US, { country: "US", zip: "10475" });
  it("are validated when read back, and a code must be one the snapshot offers", () => {
    expect(storeShippingOptionsOf(product).map((o) => o.code)).toEqual(["USPS Ground Advantage", "FedEx Home Delivery"]);
    expect(pickStoreShippingOption(product, "FedEx Home Delivery")?.cost).toBe(24.57);
    expect(pickStoreShippingOption(product, "DHL Express")).toBeNull();
    expect(pickStoreShippingOption(product, null)).toBeNull();
    expect(storeShippingOptionsOf({ metadata: { storeShippingOptions: [{ code: "x", cost: -1 }, { cost: 2 }, "junk"] } })).toEqual([]);
  });
});

function group(o: Partial<PricingGroupRow> = {}): PricingGroupRow {
  return { id: "g", slug: "g", name: "G", flat_rate_ghs: 100, flat_rate_expression: null, value_percentage: 0.05, value_percentage_high: null, value_threshold_usd: null, default_weight_lbs: null, requires_weight: false, is_active: true, sort_order: 0, ...o };
}
function calculator(): PricingCalculator {
  const calc = new PricingCalculator();
  calc.setConstants({ freight_rate_per_lb: 6, handling_fee_usd: 3, minimum_tax_usd: 0, fx_buffer_pct: 0, tax_pct_usa: 0.088, tax_pct_uk: 0.1, tax_pct_china: 0.08, minimum_chargeable_weight_lbs: 1, default_value_fee_pct: 0.08 });
  calc.setCategoryPricing(new Map([[C.COMPUTERS, group({ slug: "computers", name: "Computers", flat_rate_ghs: 90 })]]));
  calc.setFixedFreightItems([]);
  return calc;
}
function extraction(): ExtractionResult {
  return {
    extraction_attempted: true, extraction_success: true, platform: "ebay", country: "USA",
    product: withProductDefaults({ ...emptyProduct(), ...mapEbayItem(ITEM, URL_US, { country: "US", zip: "10475" }) }),
    messages: [], errors: [], source: "ebay", sources: ["ebay"], confidence: {}, fetched_at: "2026-10-14T00:00:00Z",
  };
}

describe("pricing with a chosen service", () => {
  it("charges the cheapest service by default, the chosen one by code, and ignores a code the snapshot does not offer", async () => {
    const calc = calculator();
    const cheapest = await priceExtractionWith(calc, extraction(), 1, null, null);
    expect(cheapest.pricing).toMatchObject({ store_shipping: 14.2, store_shipping_usd: 14.2, store_shipping_option: { code: "USPS Ground Advantage", label: "USPS Standard Shipping" } });

    const chosen = await priceExtractionWith(calc, extraction(), 2, { storeShippingCode: "FedEx Home Delivery" }, null);
    expect(chosen.pricing).toMatchObject({ store_shipping: 24.57, store_shipping_usd: 49.14, store_shipping_option: { code: "FedEx Home Delivery", label: "FedEx Expedited Shipping" } });
    expect(chosen.pricing!.total_ghs).toBeGreaterThan(cheapest.pricing!.total_ghs);

    const unknown = await priceExtractionWith(calc, extraction(), 1, { storeShippingCode: "DHL Express" }, null);
    expect(unknown.pricing).toMatchObject({ store_shipping: 14.2, store_shipping_option: { code: "USPS Ground Advantage" } });
  });
});

describe("hub destination", () => {
  it("reads the hub zip from the warehouse address, defaults to New York, and sends UK listings to GB", async () => {
    expect(await hubDestinationFor("USA")).toEqual({ country: "US", zip: "10475" });
    resetHubDestinationCache();
    warehouse.mockResolvedValueOnce({ city: "New York, NY" });
    expect(await hubDestinationFor("USA")).toEqual({ country: "US", zip: "10001" });
    expect(await hubDestinationFor("UK")).toEqual({ country: "GB", zip: null });
  });
});

describe("Browse client", () => {
  const tokenResponse = { ok: true, json: async () => ({ access_token: "tok", expires_in: 7200 }) };

  it("takes a token once, asks for the item with the hub as destination, and falls back to the item group for a multi-variation listing", async () => {
    const calls: Array<{ url: string; headers: Record<string, string> }> = [];
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, headers: (init?.headers as Record<string, string>) ?? {} });
      if (url.includes("/oauth2/token")) return tokenResponse;
      if (url.includes("get_item_by_legacy_id") && url.includes("137770175083")) return { ok: false, status: 400, json: async () => ({ errors: [{ errorId: 11006, message: "The legacy Id is invalid." }] }) };
      if (url.includes("get_item_by_legacy_id")) return { ok: true, status: 200, json: async () => ITEM };
      // A direct variant read: /item/v1|<legacy>|<variant>, URL-encoded.
      const direct = decodeURIComponent(url).match(/\/item\/(v1\|\d+\|\d+)$/);
      if (direct) return { ok: true, status: 200, json: async () => ({ ...ITEM, itemId: direct[1] }) };
      if (url.includes("get_items_by_item_group")) return { ok: true, status: 200, json: async () => ({ items: [
        { ...ITEM, itemId: "v1|137770175083|437000001", estimatedAvailabilities: [{ estimatedAvailabilityStatus: "OUT_OF_STOCK" }] },
        { ...ITEM, itemId: "v1|137770175083|437000002", estimatedAvailabilities: [{ estimatedAvailabilityStatus: "IN_STOCK" }] },
      ] }) };
      return { ok: true, status: 200, json: async () => ITEM };
    });
    vi.stubGlobal("fetch", fetchMock);

    const plain = await fetchEbayItem("115827204539", { marketplace: "EBAY_US", shipTo: { country: "US", zip: "10475" } });
    expect(plain?.itemId).toBe("v1|115827204539|0");
    const itemCall = calls.find((c) => c.url.includes("get_item_by_legacy_id"))!;
    expect(itemCall.headers["X-EBAY-C-ENDUSERCTX"]).toBe("contextualLocation=country%3DUS%2Czip%3D10475");
    expect(itemCall.headers["X-EBAY-C-MARKETPLACE-ID"]).toBe("EBAY_US");

    const groupPick = await fetchEbayItem("137770175083", { marketplace: "EBAY_US", shipTo: { country: "US", zip: "10475" } });
    expect(groupPick?.itemId).toBe("v1|137770175083|437000002");
    const chosenVariant = await fetchEbayItem("137770175083", { marketplace: "EBAY_US", shipTo: { country: "US", zip: "10475" }, variantId: "437000001" });
    expect(chosenVariant?.itemId).toBe("v1|137770175083|437000001");
    expect(calls.filter((c) => c.url.includes("/oauth2/token"))).toHaveLength(1);
  });

  it("is skipped without a keyset", async () => {
    envState.EBAY_CLIENT_ID = null;
    expect(ebayResolver.available({ platform: "ebay", url: URL_US } as never)).toBe(false);
    envState.EBAY_CLIENT_ID = "app";
    expect(ebayResolver.available({ platform: "ebay", url: URL_US } as never)).toBe(true);
    expect(ebayResolver.available({ platform: "amazon", url: "https://www.amazon.com/dp/B0DSVMVYPH" } as never)).toBe(false);
  });
});

describe("eBay URLs", () => {
  it("keeps a multi-variation listing's chosen variant through canonicalisation", () => {
    const scraper = getScraperByPlatform(SupportedPlatform.EBAY);
    expect(scraper.canonicalUrl("https://www.ebay.com/itm/137770175083?var=437000002&hash=x")).toBe("https://www.ebay.com/itm/137770175083?var=437000002");
    expect(scraper.canonicalUrl("https://www.ebay.com/itm/Some-Title/137770175083?hash=x")).toBe("https://www.ebay.com/itm/137770175083");
    expect(ebayVariantIdOf("https://www.ebay.com/itm/137770175083?var=437000002")).toBe("437000002");
    expect(ebayVariantIdOf("https://www.ebay.com/itm/137770175083")).toBeNull();
  });
});
