import { describe, it, expect } from "vitest";
import { emptyProduct, withProductDefaults } from "../scrapers/types";
import type { ScrapedProduct } from "../scrapers/types";

/**
 * A real `extraction_cache.result.product` written on 2026-09-12 before the
 * typed facts existed (row b4c99974-a1b4-4b49-ac8f-42dd0a0626d8, trimmed).
 */
const OLD_ROW = {
  size: null,
  brand: "Apple",
  image: "https://m.media-amazon.com/images/I/51NRGHU2NoL._AC_SL1500_.jpg",
  price: 263.86,
  title: "Apple AirPods Pro (2nd Generation) Wireless Ear Buds with USB-C Charging",
  weight: "0.22 kg",
  category: "Headphones",
  currency: "USD",
  metadata: {
    asin: "B0CHWRXH8B",
    images: [
      "https://m.media-amazon.com/images/I/51NRGHU2NoL._AC_SL1500_.jpg",
      "https://m.media-amazon.com/images/I/611pEx7220L._AC_SL1500_.jpg",
      "https://m.media-amazon.com/images/I/81Kd2CPdWBL._AC_SL1500_.jpg",
    ],
    rating: 4.7,
    soldBy: "6ave",
    source: "scraperapi",
    llm_usage: { input: 2933, output: 229 },
    reviewCount: "28773 reviews",
    availability: "In Stock",
  },
  dimensions: "0.94 x 0.86 x 1.22 inches",
  weight_lbs: 0.49,
  description: "RICHER AUDIO EXPERIENCE",
  specifications: { Asin: "B0CHWRXH8B", "Item Weight": "0.22 kg" },
} as unknown as Partial<ScrapedProduct>;

describe("emptyProduct", () => {
  it("carries every typed fact with an empty value", () => {
    const p = emptyProduct();
    expect(p).toMatchObject({ seller: null, condition: null, rating: null, review_count: null, images: [], variants: {}, availability: null });
    expect(withProductDefaults(p)).toEqual(p);
  });
});

describe("withProductDefaults", () => {
  it("fills an old-shaped cache row to the full ScrapedProduct shape", () => {
    const p = withProductDefaults(OLD_ROW);
    expect(p.title).toBe(OLD_ROW.title);
    expect(p.price).toBe(263.86);
    expect(p.images).toEqual(OLD_ROW.metadata!.images);
    expect(p.images[0]).toBe(p.image);
    expect(p.seller).toBe("6ave");
    expect(p.rating).toBe(4.7);
    expect(p.review_count).toBe(28773);
    expect(p.availability).toBe("In Stock");
    expect(p.condition).toBeNull(); // never stated by the source
    expect(p.variants).toEqual({});
    expect(p.specifications).toEqual(OLD_ROW.specifications);
    expect(p.metadata).toEqual(OLD_ROW.metadata); // legacy keys preserved
  });

  it("derives images from image and image from images[0]", () => {
    expect(withProductDefaults({ title: "x", image: "https://a/1.jpg" }).images).toEqual(["https://a/1.jpg"]);
    const fromArray = withProductDefaults({ title: "x", images: ["https://a/2.jpg", "https://a/3.jpg"] });
    expect(fromArray.image).toBe("https://a/2.jpg");
    expect(fromArray.images).toEqual(["https://a/2.jpg", "https://a/3.jpg"]);
  });

  it("keeps an explicit null from a newer row instead of re-reading legacy metadata", () => {
    const p = withProductDefaults({ title: "x", rating: null, seller: null, metadata: { rating: 4.7, soldBy: "someone" } });
    expect(p.rating).toBeNull();
    expect(p.seller).toBeNull();
  });

  it("reads legacy availableSizes into variants.size only when variants is absent", () => {
    expect(withProductDefaults({ metadata: { availableSizes: ["S", "M", "S"] } }).variants).toEqual({ size: ["S", "M"] });
    expect(withProductDefaults({ variants: { color: ["Black"] }, metadata: { availableSizes: ["S"] } }).variants).toEqual({ color: ["Black"] });
  });

  it("parses an HTML-parser style rating string and tolerates garbage", () => {
    expect(withProductDefaults({ metadata: { rating: "4.5 out of 5 stars", reviewCount: "(47)" } })).toMatchObject({ rating: 4.5, review_count: 47 });
    expect(withProductDefaults(null)).toEqual(emptyProduct());
    expect(withProductDefaults({ images: "nope" as unknown as string[], variants: [] as unknown as Record<string, string[]> })).toMatchObject({ images: [], variants: {} });
  });

  it("never mutates its argument", () => {
    const input = { title: "x", image: "https://a/1.jpg", metadata: { rating: 4 } };
    const snapshot = JSON.stringify(input);
    withProductDefaults(input);
    expect(JSON.stringify(input)).toBe(snapshot);
  });
});
