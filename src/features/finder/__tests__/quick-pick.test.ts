import { describe, expect, it } from "vitest";

import { quickPickOrder, saysInStock } from "../quick-pick";
import type { FinderListing } from "../shortlist";

const spec = { product: "AirPods Pro 2", searchQuery: "AirPods Pro 2" };
const l = (id: string, store: FinderListing["store"], priceUsd: number | null, title = "Apple AirPods Pro 2"): FinderListing => ({
  id, store, title, productUrl: `https://x/${id}`, imageUrl: null, priceUsd, currency: "USD", condition: null, seller: null, source: "catalogue",
});

describe("the fast answer", () => {
  it("takes Amazon before Walmart, cheapest first, and never eBay", () => {
    const order = quickPickOrder(
      [l("eb", "ebay", 150), l("wm", "walmart", 179), l("az2", "amazon", 199), l("az1", "amazon", 189), l("none", "amazon", null)],
      spec,
      new Set(["amazon", "walmart", "ebay"] as const),
      () => true,
    );
    expect(order.map((x) => x.id)).toEqual(["az1", "az2", "wm"]);
  });

  it("keeps only exact matches, and nothing renewed or from a closed store", () => {
    const order = quickPickOrder(
      [l("renewed", "amazon", 120, "Apple AirPods Pro 2 (Renewed)"), l("case", "amazon", 12, "Silicone case for AirPods Pro 2"), l("ok", "walmart", 189)],
      spec,
      new Set(["walmart"] as const),
      (x) => x.id !== "case",
    );
    expect(order.map((x) => x.id)).toEqual(["ok"]);
  });

  it("reads the store's own stock line", () => {
    expect(saysInStock("In Stock")).toBe(true);
    expect(saysInStock("In stock")).toBe(true);
    expect(saysInStock("Only 3 left in stock - order soon.")).toBe(true);
    expect(saysInStock("Currently unavailable.")).toBe(false);
    expect(saysInStock("Out of stock")).toBe(false);
    expect(saysInStock(null)).toBe(false);
  });
});
