import { describe, expect, it } from "vitest";

import { mergeResult, type MergeState } from "../resolvers/merge";
import { emptyProduct } from "../scrapers";

const fresh = (): MergeState => ({ product: emptyProduct(), confidence: {}, sources: {} });

describe("merge — a list price from another tier that read the same price", () => {
  it("is kept when the price owner has none (amazon-offers beside Zyte)", () => {
    const state = fresh();
    mergeResult(state, "zyte", { product: { price: 96.6, currency: "USD", metadata: { listPrice: 138 } }, confidence: { price: 0.5 } }, 0.5);
    mergeResult(state, "amazon-offers" as never, { product: { price: 96.6, currency: "USD", metadata: { priceVia: "pinned-offer" } }, confidence: { price: 0.99 } }, 0.99);
    expect(state.sources.price).toBe("amazon-offers");
    expect(state.product.metadata.listPrice).toBe(138);
  });

  it("is never borrowed from a tier that read a different price", () => {
    const state = fresh();
    mergeResult(state, "zyte", { product: { price: 120, currency: "USD", metadata: { listPrice: 138 } }, confidence: { price: 0.5 } }, 0.5);
    mergeResult(state, "amazon-offers" as never, { product: { price: 96.6, currency: "USD", metadata: {} }, confidence: { price: 0.99 } }, 0.99);
    expect(state.product.metadata.listPrice).toBeUndefined();
  });
});
