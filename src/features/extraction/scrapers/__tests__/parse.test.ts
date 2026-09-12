import { describe, it, expect } from "vitest";
import {
  addVariant,
  humanizeToken,
  normalizeImages,
  parseAggregateRating,
  cleanTitle,
  parseRating,
  parseReviewCount,
  parseSchemaAvailability,
  parseSchemaCondition,
  variantKey,
} from "../parse";

describe("parseReviewCount", () => {
  it("reads vendor and page phrasings to an integer", () => {
    expect(parseReviewCount("28773 reviews")).toBe(28773);
    expect(parseReviewCount("28,773")).toBe(28773);
    expect(parseReviewCount("28,773 ratings")).toBe(28773);
    expect(parseReviewCount("(47)")).toBe(47);
    expect(parseReviewCount("47 Reviews")).toBe(47);
    expect(parseReviewCount("38k")).toBe(38_000);
    expect(parseReviewCount("1.2K ratings")).toBe(1_200);
    expect(parseReviewCount("2.5M")).toBe(2_500_000);
    expect(parseReviewCount(77891)).toBe(77891);
    expect(parseReviewCount(12.6)).toBe(13);
    expect(parseReviewCount(0)).toBe(0);
  });

  it("returns null when there is no number", () => {
    expect(parseReviewCount("No reviews yet")).toBeNull();
    expect(parseReviewCount("")).toBeNull();
    expect(parseReviewCount(null)).toBeNull();
    expect(parseReviewCount(undefined)).toBeNull();
    expect(parseReviewCount(-3)).toBeNull();
    expect(parseReviewCount({})).toBeNull();
  });
});

describe("parseRating", () => {
  it("reads numbers and 'x out of 5' text on a 0–5 scale", () => {
    expect(parseRating(4.7)).toBe(4.7);
    expect(parseRating("4.7")).toBe(4.7);
    expect(parseRating("4.5 out of 5 stars")).toBe(4.5);
    expect(parseRating("4,3")).toBe(4.3);
    expect(parseRating("5/5")).toBe(5);
    expect(parseRating(0)).toBe(0);
  });

  it("rescales other denominators and rejects out-of-range values", () => {
    expect(parseRating("9.2/10")).toBe(4.6);
    expect(parseRating("92 out of 100")).toBe(4.6);
    expect(parseRating(7)).toBeNull();
    expect(parseRating("7")).toBeNull();
    expect(parseRating(-1)).toBeNull();
    expect(parseRating("not rated")).toBeNull();
    expect(parseRating(null)).toBeNull();
  });

  it("prefers an explicit phrasing over a bare number and reads 'N stars'", () => {
    expect(parseRating("Rated 4.3 out of 5 by 1,204 customers")).toBe(4.3);
    expect(parseRating("4.5 stars")).toBe(4.5);
    expect(parseRating("4 Stars (1,204 ratings)")).toBe(4);
    expect(parseRating("1,204 ratings · 4.6 out of 5")).toBe(4.6);
  });

  it("never mistakes a review or rating count for the rating", () => {
    expect(parseRating("28,773 ratings")).toBeNull();
    expect(parseRating("1,204 ratings")).toBeNull();
    expect(parseRating("47 reviews")).toBeNull();
    expect(parseRating("3 reviews")).toBeNull();
    expect(parseRating("4.7 (28,773 ratings)")).toBe(4.7);
    expect(parseRating("4.7 · 312 reviews")).toBe(4.7);
  });
});

describe("cleanTitle", () => {
  it("strips zero-width characters, doubled whitespace and store <title> suffixes", () => {
    expect(cleanTitle("Apple\u200b AirPods  Pro 2 | SHEIN USA")).toBe("Apple AirPods Pro 2");
    expect(cleanTitle("Sony WH-1000XM5 - Walmart.com")).toBe("Sony WH-1000XM5");
    expect(cleanTitle("Nike Air Max – Nike.com")).toBe("Nike Air Max");
    expect(cleanTitle("Dyson V15 | eBay")).toBe("Dyson V15");
    expect(cleanTitle("Kettle | AliExpress - Buy cheap")).toBe("Kettle");
  });

  it("decodes the entities vendors leave behind", () => {
    expect(cleanTitle("Levi&#39;s 501 &amp; Co")).toBe("Levi's 501 & Co");
  });

  it("is null for anything that is not a usable string", () => {
    expect(cleanTitle("")).toBeNull();
    expect(cleanTitle("  \u200b ")).toBeNull();
    expect(cleanTitle(undefined)).toBeNull();
    expect(cleanTitle(42)).toBeNull();
  });
});

describe("parseAggregateRating", () => {
  it("reads schema.org aggregateRating with ratingCount or reviewCount", () => {
    expect(parseAggregateRating({ ratingValue: "4.3", reviewCount: 321, bestRating: 5 })).toEqual({ rating: 4.3, review_count: 321 });
    expect(parseAggregateRating({ ratingValue: 4, ratingCount: "1,204" })).toEqual({ rating: 4, review_count: 1204 });
    expect(parseAggregateRating({ ratingValue: 8, bestRating: 10, reviewCount: 2 })).toEqual({ rating: 4, review_count: 2 });
    expect(parseAggregateRating(null)).toEqual({ rating: null, review_count: null });
    expect(parseAggregateRating("4.5")).toEqual({ rating: null, review_count: null });
  });
});

describe("schema.org tokens", () => {
  it("maps itemCondition URLs to plain words and passes free text through", () => {
    expect(parseSchemaCondition("https://schema.org/NewCondition")).toBe("New");
    expect(parseSchemaCondition("http://schema.org/UsedCondition")).toBe("Used");
    expect(parseSchemaCondition("RefurbishedCondition")).toBe("Refurbished");
    expect(parseSchemaCondition("schema:DamagedCondition")).toBe("Damaged");
    expect(parseSchemaCondition("Excellent - Refurbished")).toBe("Excellent - Refurbished");
    expect(parseSchemaCondition("")).toBeNull();
    expect(parseSchemaCondition(undefined)).toBeNull();
  });

  it("maps availability URLs to store-style phrases", () => {
    expect(parseSchemaAvailability("https://schema.org/InStock")).toBe("In Stock");
    expect(parseSchemaAvailability("OutOfStock")).toBe("Out of Stock");
    expect(parseSchemaAvailability("https://schema.org/PreOrder")).toBe("Pre-order");
    expect(parseSchemaAvailability("Only 3 left")).toBe("Only 3 left");
    expect(parseSchemaAvailability(null)).toBeNull();
  });

  it("humanizes vendor enum tokens", () => {
    expect(humanizeToken("in_stock")).toBe("In stock");
    expect(humanizeToken("out_of_stock")).toBe("Out of stock");
    expect(humanizeToken("")).toBeNull();
  });
});

describe("normalizeImages", () => {
  it("de-duplicates, orders, upgrades protocol-relative and puts the main image first", () => {
    expect(
      normalizeImages(["https://a/1.jpg", "//a/2.jpg", "https://a/1.jpg", "", null, "data:image/png;base64,xx", "/api/img-proxy?src=x"], "https://a/main.jpg"),
    ).toEqual(["https://a/main.jpg", "https://a/1.jpg", "https://a/2.jpg", "/api/img-proxy?src=x"]);
  });

  it("does not duplicate the main image when it is already in the list", () => {
    expect(normalizeImages(["https://a/2.jpg", "https://a/1.jpg"], "https://a/1.jpg")).toEqual(["https://a/1.jpg", "https://a/2.jpg"]);
    expect(normalizeImages([], null)).toEqual([]);
  });
});

describe("variants helpers", () => {
  it("normalizes attribute names to stable keys", () => {
    expect(variantKey("Size Name")).toBe("size");
    expect(variantKey("Colour")).toBe("color");
    expect(variantKey("color_name")).toBe("color");
    expect(variantKey("Material Type")).toBe("material_type");
    expect(variantKey("Style options")).toBe("style");
  });

  it("skips placeholders, blanks and duplicates", () => {
    const v: Record<string, string[]> = {};
    addVariant(v, "Size", "S");
    addVariant(v, "Size", "M");
    addVariant(v, "Size", "S");
    addVariant(v, "Size", "- Select -");
    addVariant(v, "Size", "Select Size");
    addVariant(v, "Color Name", "  Black ");
    addVariant(v, "Color Name", "");
    addVariant(v, "Color Name", null);
    expect(v).toEqual({ size: ["S", "M"], color: ["Black"] });
  });
});
