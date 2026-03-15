import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import * as cheerio from "cheerio";
import { fashionNovaScraper } from "../fashionnova";
import { TomameCategory } from "@/config/categories";

const fixtureHtml = readFileSync(
  resolve(__dirname, "fixtures", "fashionnova-dress.html"),
  "utf-8",
);
const $ = cheerio.load(fixtureHtml);

describe("fashionNovaScraper", () => {
  const result = fashionNovaScraper.extract($);

  describe("domains", () => {
    it("should include fashionnova.com", () => {
      expect(fashionNovaScraper.domains).toContain("fashionnova.com");
    });
  });

  describe("title", () => {
    it("should extract the product title from JSON-LD", () => {
      expect(result.title).toBe("Gracie Satin Maxi Dress - Rust");
    });
  });

  describe("price", () => {
    it("should extract price from JSON-LD", () => {
      expect(result.price).toBe(35.99);
    });

    it("should extract USD currency", () => {
      expect(result.currency).toBe("USD");
    });
  });

  describe("image", () => {
    it("should extract the main product image", () => {
      expect(result.image).toBeTruthy();
      expect(result.image).toMatch(/^https?:\/\//);
      expect(result.image).toContain("cdn.shopify.com");
    });
  });

  describe("brand", () => {
    it("should extract the brand from JSON-LD", () => {
      expect(result.brand).toBe("Fashion Nova");
    });
  });

  describe("category", () => {
    it("should map breadcrumbs to TomameCategory", () => {
      expect(result.category).toBe(TomameCategory.CLOTHING_WOMEN);
    });
  });

  describe("description", () => {
    it("should extract the product description", () => {
      expect(result.description).toBeTruthy();
      expect(result.description).toContain("Satin Maxi Dress");
      expect(result.description).toContain("Polyester");
    });
  });

  describe("color", () => {
    it("should extract color from the title", () => {
      expect(result.color).toBe("Rust");
    });
  });

  describe("specifications", () => {
    it("should extract material from description", () => {
      expect(result.specifications["Material"]).toContain("Polyester");
    });
  });

  describe("metadata", () => {
    it("should include multiple images", () => {
      const images = result.metadata["images"] as string[];
      expect(Array.isArray(images)).toBe(true);
      expect(images.length).toBe(3);
    });

    it("should extract SKU", () => {
      expect(result.metadata["sku"]).toBe("LD8889_Rust_XS");
    });

    it("should extract rating", () => {
      expect(result.metadata["rating"]).toBeTruthy();
    });

    it("should extract review count", () => {
      expect(result.metadata["reviewCount"]).toBe("223");
    });

    it("should extract available colors from description", () => {
      const colors = result.metadata["availableColors"] as string[];
      expect(colors).toContain("Black");
      expect(colors).toContain("Rust");
      expect(colors).toContain("White");
      expect(colors).toContain("Plum");
    });
  });
});
