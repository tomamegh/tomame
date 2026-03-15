import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import * as cheerio from "cheerio";
import { walmartScraper } from "../walmart";
import { TomameCategory } from "@/config/categories";

const fixtureHtml = readFileSync(
  resolve(__dirname, "fixtures", "walmart-skirt.html"),
  "utf-8",
);
const $ = cheerio.load(fixtureHtml);

describe("walmartScraper", () => {
  const result = walmartScraper.extract($);

  describe("domains", () => {
    it("should include walmart.com and walmart.ca", () => {
      expect(walmartScraper.domains).toContain("walmart.com");
      expect(walmartScraper.domains).toContain("walmart.ca");
    });
  });

  describe("title", () => {
    it("should extract the product title", () => {
      expect(result.title).toBeTruthy();
      expect(result.title).toContain("Time and Tru");
      expect(result.title).toContain("Skirt");
    });
  });

  describe("price", () => {
    it("should extract a numeric price", () => {
      expect(result.price).toBeTypeOf("number");
      expect(result.price).toBe(19.98);
    });

    it("should extract USD currency", () => {
      expect(result.currency).toBe("USD");
    });
  });

  describe("image", () => {
    it("should extract the main product image URL", () => {
      expect(result.image).toBeTruthy();
      expect(result.image).toMatch(/^https?:\/\//);
      expect(result.image).toContain("walmartimages.com");
    });
  });

  describe("brand", () => {
    it("should extract the brand", () => {
      expect(result.brand).toBe("Time and Tru");
    });
  });

  describe("category", () => {
    it("should map to Women's Clothing category", () => {
      expect(result.category).toBe(TomameCategory.CLOTHING_WOMEN);
    });
  });

  describe("description", () => {
    it("should extract a meaningful description", () => {
      expect(result.description).toBeTruthy();
      expect(result.description!.length).toBeGreaterThan(50);
    });
  });

  describe("metadata", () => {
    it("should include multiple images", () => {
      const images = result.metadata["images"] as string[];
      expect(Array.isArray(images)).toBe(true);
      expect(images.length).toBeGreaterThan(1);
    });

    it("should extract rating", () => {
      expect(result.metadata["rating"]).toBeTruthy();
    });
  });
});
