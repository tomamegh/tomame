import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import * as cheerio from "cheerio";
import { costcoScraper } from "../costco";
import { TomameCategory } from "@/config/categories";

const fixtureHtml = readFileSync(
  resolve(__dirname, "fixtures", "costco-tv.html"),
  "utf-8",
);
const $ = cheerio.load(fixtureHtml);

describe("costcoScraper", () => {
  const result = costcoScraper.extract($);

  describe("domains", () => {
    it("should include costco.com", () => {
      expect(costcoScraper.domains).toContain("costco.com");
    });
  });

  describe("title", () => {
    it("should extract the product title from JSON-LD", () => {
      expect(result.title).toBeTruthy();
      expect(result.title).toContain("Tresanti");
      expect(result.title).toContain("Adjustable Height Desk");
    });
  });

  describe("price", () => {
    it("should extract a numeric price from JSON-LD", () => {
      expect(result.price).toBeTypeOf("number");
      expect(result.price).toBe(329.99);
    });

    it("should extract USD currency", () => {
      expect(result.currency).toBe("USD");
    });
  });

  describe("image", () => {
    it("should extract the main product image URL", () => {
      expect(result.image).toBeTruthy();
      expect(result.image).toMatch(/^https?:\/\//);
      expect(result.image).toContain("costco-static.com");
    });
  });

  describe("brand", () => {
    it("should extract the brand from JSON-LD", () => {
      expect(result.brand).toBe("Tresanti");
    });
  });

  describe("category", () => {
    it("should map breadcrumbs to TomameCategory", () => {
      expect(result.category).toBe(TomameCategory.FURNITURE);
    });
  });

  describe("description", () => {
    it("should extract the product description from JSON-LD", () => {
      expect(result.description).toBeTruthy();
      expect(result.description!.length).toBeGreaterThan(50);
      expect(result.description).toContain("Height Adjustable");
    });
  });

  describe("specifications", () => {
    it("should extract feature bullets as specs", () => {
      expect(Object.keys(result.specifications).length).toBeGreaterThan(0);
    });

    it("should extract weight capacity", () => {
      expect(result.specifications["Weight Capacity"]).toBe("100 lbs");
    });

    it("should extract dimensions", () => {
      expect(result.specifications["Dimensions"]).toBeTruthy();
    });
  });

  describe("dimensions", () => {
    it("should extract dimensions from specs", () => {
      expect(result.dimensions).toBeTruthy();
      expect(result.dimensions).toMatch(/\d/);
    });
  });

  describe("metadata", () => {
    it("should include images array", () => {
      const images = result.metadata["images"] as string[];
      expect(Array.isArray(images)).toBe(true);
      expect(images.length).toBeGreaterThanOrEqual(1);
    });

    it("should extract SKU from JSON-LD", () => {
      expect(result.metadata["sku"]).toBe("1782908");
    });

    it("should extract rating from JSON-LD", () => {
      expect(result.metadata["rating"]).toBe("4.03");
    });

    it("should extract review count from JSON-LD", () => {
      expect(result.metadata["reviewCount"]).toBe("37");
    });
  });
});
