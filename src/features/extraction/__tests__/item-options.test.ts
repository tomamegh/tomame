import { describe, it, expect } from "vitest";
import { chosenOptionsOf, formatChosenOptions, itemOptionQuestions, resolveChosenOptions } from "../item-options";
import type { ScrapedProduct } from "../scrapers/types";
import { TomameCategory } from "@/config/categories/tomame_category";

const product = (p: Partial<ScrapedProduct>): ScrapedProduct =>
  ({ title: "Item", price: 10, currency: "USD", specifications: {}, variants: {}, metadata: {}, images: [], category: null, size: null, ...p }) as ScrapedProduct;

describe("item option questions", () => {
  it("a Shopify variant link answers everything itself", () => {
    const p = product({
      metadata: {
        variantChoices: {
          via: "shopify",
          options: [{ name: "Color", values: ["Navy", "Black"] }, { name: "Size", values: ["M", "L"] }],
          choices: [{ id: "10101", options: { Color: "Navy", Size: "M" }, available: true }, { id: "10102", options: { Color: "Black", Size: "L" }, available: true }],
          selectedId: "10102",
        },
      },
    });
    const qs = itemOptionQuestions({ product: p, platform: "generic" });
    expect(qs).toEqual([{ name: "Colour", values: ["Navy", "Black"], pinned: "Black" }, { name: "Size", values: ["M", "L"], pinned: "L" }]);
    expect(resolveChosenOptions(qs, { Size: "M" })).toEqual({ chosen: { Colour: "Black", Size: "L" }, missing: [] });
  });

  it("a page listing sizes asks, even when the page shows a default size", () => {
    const p = product({ variants: { size: ["S", "M", "L"], condition: ["New", "Used"] }, specifications: { Size: "S" } });
    const qs = itemOptionQuestions({ product: p, platform: "generic" });
    expect(qs).toEqual([{ name: "Size", values: ["S", "M", "L"], pinned: null }]);
    expect(resolveChosenOptions(qs, {}).missing).toEqual(["Size"]);
    expect(resolveChosenOptions(qs, { Size: "m" }).chosen).toEqual({ Size: "M" });
    expect(resolveChosenOptions(qs, { Size: "XXL" }).missing).toEqual(["Size"]);
  });

  it("an exact-item link (Amazon ASIN) pins the size it reports", () => {
    const p = product({ variants: { size: ["S", "M"] }, specifications: { Size: "M" } });
    expect(itemOptionQuestions({ product: p, platform: "amazon" })).toEqual([{ name: "Size", values: ["S", "M"], pinned: "M" }]);
  });

  it("clothing and shoes always need a size; a typed answer is kept as written", () => {
    const dress = product({ category: TomameCategory.CLOTHING_WOMEN });
    const qs = itemOptionQuestions({ product: dress, platform: "skims" });
    expect(qs).toEqual([{ name: "Size", values: [], pinned: null }]);
    expect(resolveChosenOptions(qs, { Size: "  UK 10 " }).chosen).toEqual({ Size: "UK 10" });
    expect(itemOptionQuestions({ product: product({ category: TomameCategory.ELECTRONICS }), platform: "generic" })).toEqual([]);
    // eBay item specifics name the one size that listing sells.
    expect(itemOptionQuestions({ product: product({ category: TomameCategory.SHOES_MEN, size: "10.5" }), platform: "ebay" })).toEqual([{ name: "Size", values: [], pinned: "10.5" }]);
  });

  it("drops answers to questions not asked; stored values are read defensively", () => {
    const qs = itemOptionQuestions({ product: product({ category: TomameCategory.CLOTHING_MEN }), platform: "generic" });
    expect(resolveChosenOptions(qs, { Size: "L", Engraving: "hi" }).chosen).toEqual({ Size: "L" });
    expect(chosenOptionsOf({ Size: "M", n: 3, "": "x" })).toEqual({ Size: "M" });
    expect(chosenOptionsOf("Size M")).toBeNull();
    expect(formatChosenOptions({ Size: "M", Colour: "Navy" })).toBe("Size: M · Colour: Navy");
  });
});
