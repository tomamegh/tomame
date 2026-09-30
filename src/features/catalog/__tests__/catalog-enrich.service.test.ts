import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("@/db/queries/catalog", () => ({
  claimCatalogEnrichment: vi.fn(),
  writeCatalogProductWeight: vi.fn(),
  writeCatalogLandedPrices: vi.fn(),
  getOrCreateBudget: vi.fn(),
  incrementBudget: vi.fn(),
}));
vi.mock("@/features/audit/services/audit.service", () => ({ logAuditEvent: vi.fn() }));
const calculate = vi.fn();
vi.mock("@/features/pricing/services/pricing.service", () => ({ loadPricingCalculator: vi.fn(async () => ({ calculate })) }));
vi.mock("@/lib/scraperapi/client", () => ({
  isScraperApiConfigured: vi.fn(() => true),
  fetchAmazonProductStructured: vi.fn(),
  fetchEbayProductStructured: vi.fn(),
}));
vi.mock("@/lib/oxylabs/client", () => ({
  isOxylabsConfigured: vi.fn(() => true),
  fetchOxylabsAmazonProduct: vi.fn(),
  fetchOxylabsWalmartProduct: vi.fn(),
}));
vi.mock("@/lib/zyte/client", () => ({ isZyteConfigured: vi.fn(() => true), fetchZyteProduct: vi.fn() }));

import {
  claimCatalogEnrichment,
  getOrCreateBudget,
  incrementBudget,
  writeCatalogLandedPrices,
  writeCatalogProductWeight,
  type CatalogEnrichmentRow,
} from "@/db/queries/catalog";
import { fetchAmazonProductStructured } from "@/lib/scraperapi/client";
import { fetchOxylabsAmazonProduct } from "@/lib/oxylabs/client";
import { CATALOG_ENRICH } from "@/config/catalog";
import { enrichableStores, enrichVendorFor, plausibleWeightLbs, runCatalogEnrichJob } from "../services/catalog-enrich.service";

const NOW = new Date("2026-09-30T12:00:00Z");
const all = { scraperapi: true, oxylabs: true, zyte: true };
const budget = (used: number, cap = 40) => ({ job: CATALOG_ENRICH.jobName, period: "2026-09", used, cap, updated_at: NOW.toISOString() });

const claimed: CatalogEnrichmentRow = {
  id: "p-1",
  store: "amazon",
  external_id: "B0CHAIR001",
  product_url: "https://www.amazon.com/dp/B0CHAIR001",
  title: "Office chair",
  price_usd: 120,
  currency: "USD",
  category: "Office Products",
  enrich_attempts: 1,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getOrCreateBudget).mockResolvedValue(budget(0));
  vi.mocked(incrementBudget).mockResolvedValue(budget(1));
});

describe("enrichVendorFor", () => {
  it("walks the store's plan one vendor per attempt", () => {
    expect(enrichVendorFor("amazon", 1, all)).toBe("scraperapi");
    expect(enrichVendorFor("amazon", 2, all)).toBe("oxylabs");
    expect(enrichVendorFor("walmart", 1, all)).toBe("oxylabs");
    expect(enrichVendorFor("walmart", 2, all)).toBe("zyte");
    expect(enrichVendorFor("etsy", 2, all)).toBe("zyte");
  });

  it("skips vendors without a key, and has nothing for a store with none", () => {
    const scraperOnly = { scraperapi: true, oxylabs: false, zyte: false };
    expect(enrichVendorFor("amazon", 2, scraperOnly)).toBe("scraperapi");
    expect(enrichVendorFor("walmart", 1, scraperOnly)).toBeNull();
    expect(enrichableStores(scraperOnly)).toEqual(["amazon", "ebay"]);
    expect(enrichableStores(all)).toEqual(["amazon", "ebay", "walmart", "etsy", "nike"]);
  });
});

describe("plausibleWeightLbs", () => {
  it("keeps real weights and refuses nonsense", () => {
    expect(plausibleWeightLbs(1.49)).toBe(1.49);
    expect(plausibleWeightLbs(0)).toBeNull();
    expect(plausibleWeightLbs(null)).toBeNull();
    expect(plausibleWeightLbs(5000)).toBeNull();
  });
});

describe("runCatalogEnrichJob", () => {
  it("skips without a claim or a call when the budget is spent", async () => {
    vi.mocked(getOrCreateBudget).mockResolvedValue(budget(40));
    const s = await runCatalogEnrichJob(NOW);
    expect(s.skipped).toBe("budget");
    expect(claimCatalogEnrichment).not.toHaveBeenCalled();
  });

  it("claims weight-declined rows with the attempt cap and retry spacing", async () => {
    vi.mocked(claimCatalogEnrichment).mockResolvedValue(null);
    const s = await runCatalogEnrichJob(NOW);
    expect(s.skipped).toBe("nothing_due");
    expect(claimCatalogEnrichment).toHaveBeenCalledWith({
      nowIso: NOW.toISOString(),
      retryBeforeIso: "2026-09-30T06:00:00.000Z",
      maxAttempts: 2,
      stores: ["amazon", "ebay", "walmart", "etsy", "nike"],
    });
    expect(incrementBudget).not.toHaveBeenCalled();
  });

  it("one call, weight stored, row re-priced through the calculator with that weight", async () => {
    vi.mocked(claimCatalogEnrichment).mockResolvedValue(claimed);
    vi.mocked(fetchAmazonProductStructured).mockResolvedValue({
      name: "Office chair",
      product_information: { item_weight: "‎32.5 Pounds" },
    } as never);
    calculate.mockResolvedValue({ pricing_method: "weight_expression", total_ghs: 4321, total_pesewas: 432100 });

    const s = await runCatalogEnrichJob(NOW);

    expect(fetchAmazonProductStructured).toHaveBeenCalledTimes(1);
    expect(fetchAmazonProductStructured).toHaveBeenCalledWith("B0CHAIR001", "com", "us");
    expect(fetchOxylabsAmazonProduct).not.toHaveBeenCalled();
    expect(incrementBudget).toHaveBeenCalledTimes(1);
    expect(writeCatalogProductWeight).toHaveBeenCalledWith("p-1", { weight_lbs: 32.5, weight_source: "scraperapi" });
    expect(calculate).toHaveBeenCalledWith(expect.objectContaining({ weightLbs: 32.5, category: "Office Products" }), null);
    expect(writeCatalogLandedPrices).toHaveBeenCalledWith([{ id: "p-1", landed_ghs: 4321, decline: null }]);
    expect(s).toMatchObject({ vendor: "scraperapi", attempt: 1, weight_lbs: 32.5, landed_ghs: 4321 });
  });

  it("the second attempt goes to the next vendor; no weight means no write, but the credit is counted", async () => {
    vi.mocked(claimCatalogEnrichment).mockResolvedValue({ ...claimed, enrich_attempts: 2 });
    vi.mocked(fetchOxylabsAmazonProduct).mockResolvedValue(null);

    const s = await runCatalogEnrichJob(NOW);

    expect(fetchOxylabsAmazonProduct).toHaveBeenCalledWith("B0CHAIR001", "com");
    expect(fetchAmazonProductStructured).not.toHaveBeenCalled();
    expect(incrementBudget).toHaveBeenCalledTimes(1);
    expect(writeCatalogProductWeight).not.toHaveBeenCalled();
    expect(writeCatalogLandedPrices).not.toHaveBeenCalled();
    expect(s).toMatchObject({ vendor: "oxylabs", attempt: 2, weight_lbs: null });
  });
});
