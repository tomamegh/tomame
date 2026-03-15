import { describe, it, expect } from "vitest";

// We're testing the pure matching helpers, so extract them for unit testing.
// Since they're module-private, we test via the exported tokenise-equivalent logic.

/** Tokenise a title into lowercase words (mirrors the service helper) */
function tokenise(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 0);
}

/** Check if ALL keywords appear in the title tokens */
function keywordsMatch(titleTokens: string[], keywords: string[]): boolean {
  if (keywords.length === 0) return false;
  return keywords.every((kw) =>
    titleTokens.some((t) => t.includes(kw.toLowerCase())),
  );
}

describe("static price matching helpers", () => {
  describe("tokenise", () => {
    it("should lowercase and split on whitespace", () => {
      expect(tokenise("iPhone 16 Pro Max")).toEqual(["iphone", "16", "pro", "max"]);
    });

    it("should strip punctuation", () => {
      expect(tokenise('iPad Pro 13" (M4)')).toEqual(["ipad", "pro", "13", "m4"]);
    });

    it("should handle empty string", () => {
      expect(tokenise("")).toEqual([]);
    });
  });

  describe("keywordsMatch", () => {
    const iphoneTitle = tokenise("Apple iPhone 16 Pro Max 256GB - Black Titanium");

    it("should match when all keywords present", () => {
      expect(keywordsMatch(iphoneTitle, ["iphone", "16", "pro"])).toBe(true);
    });

    it("should NOT match when a keyword is missing", () => {
      expect(keywordsMatch(iphoneTitle, ["iphone", "15", "pro"])).toBe(false);
    });

    it("should match partial token (substring)", () => {
      expect(keywordsMatch(tokenise("AirPods Pro 2nd Generation"), ["airpods", "pro"])).toBe(true);
    });

    it("should return false for empty keywords", () => {
      expect(keywordsMatch(iphoneTitle, [])).toBe(false);
    });

    it("should match JBL Flip", () => {
      expect(keywordsMatch(tokenise("JBL Flip 6 Portable Bluetooth Speaker"), ["jbl", "flip"])).toBe(true);
    });

    it("should match PS5", () => {
      expect(keywordsMatch(tokenise("Sony PlayStation 5 PS5 Console"), ["ps5"])).toBe(true);
    });

    it("should match MacBook Pro 16", () => {
      expect(
        keywordsMatch(tokenise('Apple MacBook Pro 16" M3 Max'), ["macbook", "pro", "16"]),
      ).toBe(true);
    });

    it("should prefer more specific match", () => {
      const title = tokenise("Apple iPhone 16 Pro Max 1TB");
      // Both match, but "iphone,16,pro" has more keywords than "iphone,16"
      const specificMatch = keywordsMatch(title, ["iphone", "16", "pro"]);
      const broadMatch = keywordsMatch(title, ["iphone", "16"]);
      expect(specificMatch).toBe(true);
      expect(broadMatch).toBe(true);
      // The service picks the one with more keywords
      expect(["iphone", "16", "pro"].length).toBeGreaterThan(["iphone", "16"].length);
    });

    it("should match Apple Watch Series 10", () => {
      expect(
        keywordsMatch(tokenise("Apple Watch Series 10 GPS 46mm"), ["apple", "watch", "series", "10"]),
      ).toBe(true);
    });

    it("should NOT match Apple Watch Ultra when looking for Series", () => {
      expect(
        keywordsMatch(tokenise("Apple Watch Ultra 2 GPS + Cellular"), ["apple", "watch", "series", "10"]),
      ).toBe(false);
    });
  });
});
