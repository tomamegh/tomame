import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));

import { createAdminClient } from "@/lib/supabase/admin";
import { getCachedExtractionByHash, getExtractionById, getValidExtractionById } from "../extraction-cache";

function clientReturning(data: unknown) {
  const chain: Record<string, unknown> = {};
  for (const name of ["from", "select", "eq", "gt"]) chain[name] = () => chain;
  chain.maybeSingle = async () => ({ data, error: null });
  vi.mocked(createAdminClient).mockReturnValue(chain as never);
}

/** A row written before seller / rating / images / variants existed on ScrapedProduct. */
const legacyRow = {
  id: "cache-1",
  url_hash: "hash-1",
  product_url: "https://www.amazon.com/dp/B0TEST",
  is_valid: true,
  expires_at: "2026-09-13T00:00:00Z",
  result: {
    extraction_attempted: true,
    extraction_success: true,
    platform: "amazon",
    country: "USA",
    product: {
      title: "Oraimo BoomPop N",
      image: "https://img.example/a.jpg",
      price: 298,
      currency: "USD",
      metadata: { rating: "4.5 out of 5 stars", reviewCount: "1,204 ratings", soldBy: "Oraimo Store", images: ["https://img.example/a.jpg", "https://img.example/b.jpg"] },
    },
    messages: [],
    errors: [],
  },
};

beforeEach(() => vi.clearAllMocks());

describe("extraction_cache readers normalise legacy rows", () => {
  it("getValidExtractionById fills the typed facts from metadata and gives every array/object a value", async () => {
    clientReturning(legacyRow);
    const row = await getValidExtractionById("cache-1");
    expect(row?.id).toBe("cache-1");
    expect(row?.url_hash).toBe("hash-1");
    expect(row?.result.product).toMatchObject({
      title: "Oraimo BoomPop N",
      price: 298,
      currency: "USD",
      rating: 4.5,
      review_count: 1204,
      seller: "Oraimo Store",
      images: ["https://img.example/a.jpg", "https://img.example/b.jpg"],
      variants: {},
      specifications: {},
    });
    expect(row?.result.product.condition).toBeNull();
    expect(row?.result.product.availability).toBeNull();
  });

  it("getExtractionById and getCachedExtractionByHash apply the same shape", async () => {
    clientReturning(legacyRow);
    const byId = await getExtractionById("cache-1");
    expect(byId?.productUrl).toBe(legacyRow.product_url);
    expect(byId?.result.product.rating).toBe(4.5);
    expect(byId?.result.product.images).toHaveLength(2);

    clientReturning({ id: "cache-1", result: legacyRow.result });
    const byHash = await getCachedExtractionByHash("hash-1");
    expect(byHash?.result.product.review_count).toBe(1204);
    expect(byHash?.result.product.variants).toEqual({});
  });

  it("returns null for a miss", async () => {
    clientReturning(null);
    expect(await getValidExtractionById("nope")).toBeNull();
    expect(await getExtractionById("nope")).toBeNull();
  });
});
