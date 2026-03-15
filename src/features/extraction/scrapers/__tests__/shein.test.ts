import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import * as cheerio from "cheerio";
import { sheinScraper } from "../shein";
import { TomameCategory } from "@/config/categories";

const fixtureHtml = readFileSync(
  resolve(__dirname, "fixtures", "shein-shirt-set.html"),
  "utf-8",
);
const $ = cheerio.load(fixtureHtml);

describe("sheinScraper", () => {
  const result = sheinScraper.extract($);

  describe("domains", () => {
    it("should include shein.com and m.shein.com", () => {
      expect(sheinScraper.domains).toContain("shein.com");
      expect(sheinScraper.domains).toContain("m.shein.com");
    });
  });

  describe("title", () => {
    it("should extract the product title", () => {
      expect(result.title).toBeTruthy();
      expect(result.title).toContain("Manfinity RSRT");
      expect(result.title).toContain("Shirt");
    });
  });

  describe("price", () => {
    it("should extract a numeric price", () => {
      expect(result.price).toBeTypeOf("number");
      expect(result.price).toBe(76.87);
    });

    it("should extract USD currency", () => {
      expect(result.currency).toBe("USD");
    });
  });

  describe("image", () => {
    it("should extract the main product image URL", () => {
      expect(result.image).toBeTruthy();
      expect(result.image).toMatch(/^https?:\/\//);
      expect(result.image).toContain("ltwebstatic.com");
    });
  });

  describe("brand", () => {
    it("should extract the brand", () => {
      expect(result.brand).toBe("Manfinity");
    });
  });

  describe("category", () => {
    it("should map to Men's Clothing category", () => {
      expect(result.category).toBe(TomameCategory.CLOTHING_MEN);
    });
  });

  describe("color", () => {
    it("should extract the selected color", () => {
      expect(result.color).toBe("White");
    });
  });

  describe("size", () => {
    it("should extract a size from the first variant", () => {
      expect(result.size).toBeTruthy();
    });
  });

  describe("metadata", () => {
    it("should include multiple images", () => {
      const images = result.metadata["images"] as string[];
      expect(Array.isArray(images)).toBe(true);
      expect(images.length).toBeGreaterThan(1);
    });

    it("should include available sizes", () => {
      const sizes = result.metadata["availableSizes"] as string[];
      expect(Array.isArray(sizes)).toBe(true);
      expect(sizes.length).toBeGreaterThan(0);
    });

    it("should extract rating", () => {
      expect(result.metadata["rating"]).toBe("4.94");
    });

    it("should extract review count", () => {
      expect(result.metadata["reviewCount"]).toBe("1000");
    });
  });
});
