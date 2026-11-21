import { describe, expect, it } from "vitest";

import { HERO_PRODUCTS, HERO_ROTATION_MS, heroOrderForSlot, heroSlot, titleMatchesHero } from "../hero-products";

describe("the hero's rotation", () => {
  it("changes product every two hours and comes round again", () => {
    const t = Date.UTC(2026, 10, 21, 18, 0, 0);
    expect(heroSlot(t + HERO_ROTATION_MS - 1)).toBe(heroSlot(t + 1));
    expect(heroSlot(t + HERO_ROTATION_MS)).toBe(heroSlot(t) + 1);
    const a = heroOrderForSlot(heroSlot(t))[0];
    const b = heroOrderForSlot(heroSlot(t) + 1)[0];
    expect(a).not.toBe(b);
    expect(heroOrderForSlot(heroSlot(t) + HERO_PRODUCTS.length)[0]).toBe(a);
  });

  it("tries every product once, starting with the window's own", () => {
    const order = heroOrderForSlot(3);
    expect(order).toHaveLength(HERO_PRODUCTS.length);
    expect(new Set(order).size).toBe(HERO_PRODUCTS.length);
    expect(order[0]).toBe(HERO_PRODUCTS[3 % HERO_PRODUCTS.length]);
  });

  it("matches the product itself, not its accessories or bigger sibling", () => {
    const pro = HERO_PRODUCTS.find((p) => p.query.startsWith("iPhone 17 Pro 256"))!;
    expect(titleMatchesHero("Apple iPhone 17 Pro 256GB Cosmic Orange Unlocked - NEW", pro)).toBe(true);
    expect(titleMatchesHero("Apple iPhone 17 Pro Max 256GB Unlocked", pro)).toBe(false);
    expect(titleMatchesHero("Clear case for iPhone 17 Pro", pro)).toBe(false);
    const sw = HERO_PRODUCTS.find((p) => p.query === "Nintendo Switch 2")!;
    expect(titleMatchesHero("Nintendo Switch 2 System", sw)).toBe(true);
    expect(titleMatchesHero("Turtle Beach Airlite Fit Wired Gaming Headset for Nintendo Switch 2", sw)).toBe(false);
  });
});
