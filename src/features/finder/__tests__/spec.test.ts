import { describe, expect, it } from "vitest";

import { TomameCategory } from "@/config/categories";

import { normaliseFinderQuery, parseSpecOutput, specSummary } from "../spec";

const good = {
  is_product_request: true,
  product: "PS5 Slim  Digital Edition",
  search_query: "PS5 Slim Digital Edition console",
  must_haves: ["Digital Edition", " Digital Edition ", ""],
  budget_ghs: 9000,
  category: TomameCategory.VIDEO_GAMES,
};

describe("parseSpecOutput", () => {
  it("accepts a well-formed spec, tidies it, and is always new-only", () => {
    expect(parseSpecOutput(good, null)).toEqual({
      product: "PS5 Slim Digital Edition",
      searchQuery: "PS5 Slim Digital Edition console",
      mustHaves: ["Digital Edition"],
      budgetGhs: 9000,
      newOnly: true,
      category: TomameCategory.VIDEO_GAMES,
    });
  });

  it("lets a budget typed beside the request win over one read from the text", () => {
    expect(parseSpecOutput(good, 7500)?.budgetGhs).toBe(7500);
    expect(parseSpecOutput({ ...good, budget_ghs: null }, null)?.budgetGhs).toBeNull();
    expect(parseSpecOutput({ ...good, budget_ghs: -5 }, null)?.budgetGhs).toBeNull();
  });

  it.each([
    ["not an object", "PS5"],
    ["missing fields", { product: "PS5" }],
    ["wrong types", { ...good, must_haves: "Digital" }],
    ["a category outside the list", { ...good, category: "Spaceships" }],
    ["an empty product", { ...good, product: " " }],
    ["a one-letter search", { ...good, search_query: "p" }],
  ])("returns null for %s, so the run ends as a calm no-match", (_label, raw) => {
    expect(parseSpecOutput(raw, null)).toBeNull();
  });

  it("returns null when the model says the text is not a product request", () => {
    expect(parseSpecOutput({ ...good, is_product_request: false }, null)).toBeNull();
  });
});

describe("normaliseFinderQuery (the 24 h cache key)", () => {
  it("treats case, spacing, punctuation and currency spelling as the same request", () => {
    const a = normaliseFinderQuery("Oraimo earbuds under GH₵500");
    expect(normaliseFinderQuery("  oraimo   EARBUDS under ghs500! ")).toBe(a);
    expect(normaliseFinderQuery("Oraimo earbuds, under 500 cedis")).not.toBe(a);
  });

  it("keys a typed budget separately, so a different budget is a different run", () => {
    expect(normaliseFinderQuery("PS5 slim", 9000)).not.toBe(normaliseFinderQuery("PS5 slim", 8000));
    expect(normaliseFinderQuery("PS5 slim", null)).toBe(normaliseFinderQuery("ps5 slim"));
  });
});

describe("specSummary", () => {
  it("reads the spec back in plain words without repeating the product", () => {
    expect(specSummary({ product: "PS5 Slim Digital Edition", mustHaves: ["Digital Edition", "White"], budgetGhs: 9000, newOnly: true })).toBe(
      "PS5 Slim Digital Edition, White, new, up to GH₵9,000 landed",
    );
    expect(specSummary({ product: "Oraimo FreePods", mustHaves: [], budgetGhs: null, newOnly: true })).toBe("Oraimo FreePods, new");
  });
});
