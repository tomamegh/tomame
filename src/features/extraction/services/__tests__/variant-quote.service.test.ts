import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
const getValidExtractionById = vi.fn();
const extractPrepared = vi.fn();
const prepareProductUrl = vi.fn(async (url: string) => ({ canonicalUrl: url }));
vi.mock("@/db/queries/extraction-cache", () => ({ getValidExtractionById: (id: string) => getValidExtractionById(id) }));
vi.mock("../../extraction.service", () => ({
  extractPrepared: (p: unknown, v: unknown) => extractPrepared(p, v),
  prepareProductUrl: (u: string) => prepareProductUrl(u),
}));

import { quoteVariant } from "../variant-quote.service";

const viewer = { userId: null, sessionId: "s1" };
const row = {
  id: "11111111-1111-4111-8111-111111111111",
  product_url: "https://www.thedressoutlet.com/products/dress",
  result: {
    product: {
      metadata: {
        variantChoices: {
          via: "shopify",
          options: [{ name: "Size", values: ["M", "L"] }],
          choices: [{ id: "10101", options: { Size: "M" }, available: true }, { id: "10102", options: { Size: "L" }, available: true }],
          selectedId: "10101",
        },
      },
    },
  },
};

describe("quoteVariant", () => {
  beforeEach(() => vi.clearAllMocks());

  it("reads the store's own link for a listed variant and returns that quote", async () => {
    getValidExtractionById.mockResolvedValue(row);
    extractPrepared.mockResolvedValue({ extraction_cache_id: "22222222-2222-4222-8222-222222222222" });
    await expect(quoteVariant(viewer, row.id, "10102")).resolves.toMatchObject({ extraction_cache_id: "22222222-2222-4222-8222-222222222222" });
    expect(prepareProductUrl).toHaveBeenCalledWith("https://www.thedressoutlet.com/products/dress?variant=10102");
  });

  it("the variant already priced is this quote; an unlisted id never fetches", async () => {
    getValidExtractionById.mockResolvedValue(row);
    await expect(quoteVariant(viewer, row.id, "10101")).resolves.toEqual({ extraction_cache_id: row.id });
    await expect(quoteVariant(viewer, row.id, "99999")).rejects.toMatchObject({ statusCode: 400 });
    expect(prepareProductUrl).not.toHaveBeenCalled();
  });

  it("an expired quote or a listing without options is refused", async () => {
    getValidExtractionById.mockResolvedValue(null);
    await expect(quoteVariant(viewer, row.id, "10102")).rejects.toMatchObject({ statusCode: 404 });
    getValidExtractionById.mockResolvedValue({ ...row, result: { product: { metadata: {} } } });
    await expect(quoteVariant(viewer, row.id, "10102")).rejects.toMatchObject({ statusCode: 409 });
  });
});
