import { describe, it, expect } from "vitest";
import { choiceForPick, valueState, variantChoicesOf, variantUrlFor, type VariantChoices } from "../variant-choices";
import { shopifyVariantChoices, mapShopifyProduct } from "../resolvers/shopify.resolver";
import { withoutMarketSubfolder } from "../url";
import { withShopifyMarket, type ShopifyProduct } from "@/lib/shopify/client";

const v = (id: number, size: string, color: string, available: boolean | null = true) => ({
  id, title: `${color} / ${size}`, price: 159, compare_at_price: 319.99, currency: "USD", grams: 680, available, sku: null, options: [color, size],
});
const dress: ShopifyProduct = {
  id: 1, handle: "dress", title: "Pleated Dress", vendor: "The Dress Outlet", product_type: "Dresses", tags: [], description_html: null, images: [],
  options: [{ name: "Color", values: ["Emerald Green", "Navy"] }, { name: "Size", values: ["M", "L", "XL"] }],
  variants: [v(10101, "M", "Emerald Green"), v(10102, "L", "Emerald Green"), v(10103, "XL", "Emerald Green", false), v(10201, "M", "Navy"), v(10202, "L", "Navy", false), v(10203, "XL", "Navy")],
};

describe("variant choices", () => {
  it("Shopify snapshot keeps every variant with its options and stock, and marks the one priced", () => {
    const mapped = mapShopifyProduct(dress, "https://www.thedressoutlet.com/products/dress?variant=10102", "USD");
    const choices = variantChoicesOf(mapped)!;
    expect(choices.options).toEqual([{ name: "Color", values: ["Emerald Green", "Navy"] }, { name: "Size", values: ["M", "L", "XL"] }]);
    expect(choices.selectedId).toBe("10102");
    expect(choices.choices.find((c) => c.id === "10103")).toEqual({ id: "10103", options: { Color: "Emerald Green", Size: "XL" }, available: false });
  });

  it("a single-variant product (Shopify's 'Title' option) has nothing to pick", () => {
    const single: ShopifyProduct = { ...dress, options: [{ name: "Title", values: ["Default Title"] }], variants: [{ ...v(1, "x", "y"), options: ["Default Title"] }] };
    expect(shopifyVariantChoices(single, 1)).toBeNull();
    expect(variantChoicesOf(mapShopifyProduct(single, "https://x.com/products/a", "USD"))).toBeNull();
  });

  it("rejects stored junk instead of drawing it", () => {
    expect(variantChoicesOf({ metadata: { variantChoices: { via: "zyte", options: [], choices: [] } } } as never)).toBeNull();
    expect(variantChoicesOf({ metadata: { variantChoices: { via: "shopify", options: [{ name: "Size", values: ["M"] }], choices: [{ id: "../x", options: {} }, { id: "1", options: { Size: "M" } }] } } } as never)).toBeNull();
  });

  const choices = shopifyVariantChoices(dress, 10102) as VariantChoices;

  it("builds the variant link from the snapshot's own URL, and only for a listed id", () => {
    expect(variantUrlFor("https://www.thedressoutlet.com/products/dress?country=US&currency=USD&variant=10102", choices, "10201")).toBe("https://www.thedressoutlet.com/products/dress?country=US&currency=USD&variant=10201");
    expect(variantUrlFor("https://www.thedressoutlet.com/products/dress", choices, "999")).toBeNull();
  });

  it("a pick keeps the other options where it can and prefers in stock", () => {
    // Emerald L → Navy: Navy L is sold out, so Navy M (in stock) wins over keeping L.
    expect(choiceForPick(choices, "Color", "Navy")?.id).toBe("10201");
    // Emerald L → XL: Emerald XL is sold out; Navy XL is in stock.
    expect(choiceForPick(choices, "Size", "XL")?.id).toBe("10203");
    expect(choiceForPick(choices, "Size", "XXL")).toBeNull();
  });

  it("labels each button", () => {
    expect(valueState(choices, "Size", "L")).toBe("selected");
    expect(valueState(choices, "Size", "M")).toBe("available");
    expect(valueState(choices, "Size", "XL")).toBe("other");
    const navyOnlySoldOut = { ...choices, choices: choices.choices.map((c) => (c.options.Color === "Navy" ? { ...c, available: false } : c)) };
    expect(valueState(navyOnlySoldOut, "Color", "Navy")).toBe("sold_out");
  });
});

describe("market subfolder", () => {
  it("a Shopify link opens in the market we buy in", () => {
    expect(withShopifyMarket("https://skims.com/products/short?variant=1", "US")).toBe("https://skims.com/products/short?variant=1&country=US&currency=USD");
    expect(withShopifyMarket("https://shop.co.uk/products/x?country=GH", "GB")).toBe("https://shop.co.uk/products/x?country=GB&currency=GBP");
  });

  it("drops /en-gh/ and friends before /products/, and nothing else", () => {
    expect(withoutMarketSubfolder("https://skims.com/en-gh/products/short-onyx")).toBe("https://skims.com/products/short-onyx");
    expect(withoutMarketSubfolder("https://shop.com/gb/collections/sale/products/x?variant=1")).toBe("https://shop.com/collections/sale/products/x?variant=1");
    expect(withoutMarketSubfolder("https://shop.com/products/x")).toBe("https://shop.com/products/x");
    expect(withoutMarketSubfolder("https://shop.com/shop/products/x")).toBe("https://shop.com/shop/products/x");
    expect(withoutMarketSubfolder("https://shop.com/en-gh/p/x")).toBe("https://shop.com/en-gh/p/x");
  });
});
