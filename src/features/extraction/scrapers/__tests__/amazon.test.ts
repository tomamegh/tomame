import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import * as cheerio from "cheerio";
import { amazonScraper } from "../amazon";
import { TomameCategory } from "@/config/categories";

const fixtureHtml = readFileSync(
  resolve(__dirname, "fixtures", "amazon-desk-full.html"),
  "utf-8",
);
const $ = cheerio.load(fixtureHtml);

describe("amazonScraper", () => {
  const result = amazonScraper.extract($);

  describe("domains", () => {
    it("should include amazon.com and a.co", () => {
      expect(amazonScraper.domains).toContain("amazon.com");
      expect(amazonScraper.domains).toContain("a.co");
    });
  });

  describe("title", () => {
    it("should extract the product title", () => {
      expect(result.title).toBeTruthy();
      expect(result.title).toContain("SEDETA");
      expect(result.title).toContain("Desk");
    });
  });

  describe("price", () => {
    it("should extract a numeric price", () => {
      expect(result.price).toBeTypeOf("number");
      expect(result.price).toBeGreaterThan(0);
    });

    it("should extract USD currency", () => {
      expect(result.currency).toBe("USD");
    });
  });

  describe("image", () => {
    it("should extract the main product image URL", () => {
      expect(result.image).toBeTruthy();
      expect(result.image).toMatch(/^https?:\/\//);
    });
  });

  describe("brand", () => {
    it("should extract the brand", () => {
      expect(result.brand).toBeTruthy();
      expect(result.brand).toContain("SEDETA");
    });
  });

  describe("category", () => {
    it("should extract and map the category to TomameCategory", () => {
      expect(result.category).toBe(TomameCategory.HOME_KITCHEN);
    });
  });

  describe("description", () => {
    it("should extract the about this item bullets", () => {
      expect(result.description).toBeTruthy();
      expect(result.description!.length).toBeGreaterThan(50);
    });
  });

  describe("specifications", () => {
    it("should extract product specs as key-value pairs", () => {
      expect(Object.keys(result.specifications).length).toBeGreaterThan(0);
    });

    it("should include Brand in specs", () => {
      expect(result.specifications["Brand"]).toBe("SEDETA");
    });

    it("should include Product Dimensions in specs", () => {
      expect(result.specifications["Product Dimensions"]).toBeTruthy();
    });

    it("should include Color in specs", () => {
      expect(result.specifications["Color"]).toBeTruthy();
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
    });

    it("should extract the ASIN", () => {
      expect(result.metadata["asin"]).toBe("B0DSVMVYPH");
    });

    it("should extract rating", () => {
      expect(result.metadata["rating"]).toBeTruthy();
    });

    it("should extract review count", () => {
      expect(result.metadata["reviewCount"]).toBeTruthy();
    });
  });
});
