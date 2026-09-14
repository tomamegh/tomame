import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("@/db/queries/catalog", () => ({ enqueueDerivedQuery: vi.fn() }));
vi.mock("@/db/queries/extraction-cache", () => ({ getValidExtractionById: vi.fn() }));

import { enqueueDerivedQuery } from "@/db/queries/catalog";
import { getValidExtractionById } from "@/db/queries/extraction-cache";
import { enqueueCatalogQueryFromPaste } from "../services/catalog-enqueue.service";

const mockEnqueue = vi.mocked(enqueueDerivedQuery);
const mockCache = vi.mocked(getValidExtractionById);

const CACHE_ID = "11111111-1111-4111-8111-111111111111";

function cached(product: Record<string, unknown> | null, platform: string | null = "amazon") {
  return { id: CACHE_ID, result: product ? { product, platform } : { platform } } as never;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockEnqueue.mockResolvedValue(true);
});

describe("enqueueCatalogQueryFromPaste", () => {
  it("records a term for the scrape job, and does NOT call a vendor", () => {
    // The whole design: a paste enqueues, the hourly budget-capped job spends.
    // Nothing in this module may reach ScraperAPI.
    const source = enqueueCatalogQueryFromPaste.toString();
    expect(source).not.toMatch(/fetch\(|scraperapi|axios/i);
  });

  it("enqueues a cut-down term under the product's own category", async () => {
    mockCache.mockResolvedValue(
      cached({
        title: "AT&T Samsung Galaxy S24 Ultra Titanium Violet 512GB",
        brand: "Samsung",
        category: "Cell Phones & Accessories",
      }),
    );

    expect(await enqueueCatalogQueryFromPaste(CACHE_ID)).toBe("enqueued");
    expect(mockEnqueue).toHaveBeenCalledWith({
      store: "amazon",
      category: "Cell Phones & Accessories",
      query: "Samsung Galaxy S24 Ultra",
      cacheId: CACHE_ID,
    });
  });

  it("sends an eBay paste to the eBay lane", async () => {
    mockCache.mockResolvedValue(
      cached({ title: "Sony WH-1000XM5 Headphones", brand: "Sony", category: "Headphones" }, "ebay"),
    );

    await enqueueCatalogQueryFromPaste(CACHE_ID);
    expect(mockEnqueue.mock.calls[0]![0]).toMatchObject({ store: "ebay" });
  });

  it("reports a term someone already pasted as already known", async () => {
    mockCache.mockResolvedValue(
      cached({ title: "Sony WH-1000XM5 Headphones", brand: "Sony", category: "Headphones" }),
    );
    mockEnqueue.mockResolvedValue(false);

    expect(await enqueueCatalogQueryFromPaste(CACHE_ID)).toBe("already_known");
  });

  it("refuses to guess a category", async () => {
    // An extraction that could not classify the product is exactly the case
    // where we should not be guessing what it is similar to, and the column is
    // NOT NULL besides.
    mockCache.mockResolvedValue(cached({ title: "Some Gadget 3000", brand: null, category: null }));

    expect(await enqueueCatalogQueryFromPaste(CACHE_ID)).toBe("no_category");
    expect(mockEnqueue).not.toHaveBeenCalled();
  });

  it("spends nothing on a title that cuts down to nothing", async () => {
    mockCache.mockResolvedValue(cached({ title: "Black White Blue", category: "Headphones" }));

    expect(await enqueueCatalogQueryFromPaste(CACHE_ID)).toBe("no_term");
    expect(mockEnqueue).not.toHaveBeenCalled();
  });

  it("does nothing for an extraction that no longer resolves", async () => {
    mockCache.mockResolvedValue(null);

    expect(await enqueueCatalogQueryFromPaste(CACHE_ID)).toBe("unusable");
    expect(mockEnqueue).not.toHaveBeenCalled();
  });

  it("treats a case-variant collision as already known, not an error", async () => {
    // Two unique indexes can fire: 045's exact (store, query), which the upsert
    // declares and which resolves to DO NOTHING, and 055's case- and
    // whitespace-insensitive one, which is stricter, is NOT the declared target,
    // and raises 23505 instead. Confirmed against Postgres: inserting "IPHONE"
    // over a stored "iphone" violates uq_catalog_queries_store_term. Both mean
    // somebody already enqueued this term.
    mockCache.mockResolvedValue(
      cached({ title: "Apple iPhone 15 Pro", brand: "Apple", category: "Cell Phones & Accessories" }),
    );
    mockEnqueue.mockResolvedValue(false);

    expect(await enqueueCatalogQueryFromPaste(CACHE_ID)).toBe("already_known");
  });

  it("NEVER throws: a catalogue we could not enrich must not fail a paste", async () => {
    // By the time this runs the customer already has their price. A throw here
    // would land in the extraction job, which once requeued a finished job and
    // charged a vendor twice.
    mockCache.mockRejectedValue(new Error("cache is down"));
    await expect(enqueueCatalogQueryFromPaste(CACHE_ID)).resolves.toBe("error");

    mockCache.mockResolvedValue(
      cached({ title: "Sony WH-1000XM5 Headphones", brand: "Sony", category: "Headphones" }),
    );
    mockEnqueue.mockRejectedValue(new Error("unique index is sulking"));
    await expect(enqueueCatalogQueryFromPaste(CACHE_ID)).resolves.toBe("error");
  });
});
