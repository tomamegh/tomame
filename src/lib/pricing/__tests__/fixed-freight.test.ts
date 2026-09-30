import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/exchange-rates/service", () => ({ getGhsRate: vi.fn() }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import { PricingCalculator } from "@/lib/pricing";
import { matchFixedFreightItem, fixedFreightCategoryAllows, keywordPattern } from "../fixed-freight-match";
import type { PricingGroupRow } from "@/db/queries/pricing-groups";
import type { FixedFreightItemRow } from "@/db/queries/fixed-freight-items";
import { getGhsRate } from "@/lib/exchange-rates/service";
import { logger } from "@/lib/logger";
import { TomameCategory as C } from "@/config/categories/tomame_category";

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getGhsRate).mockImplementation(async (cur: string) => (cur === "USD" ? 15 : null));
});

/** Rows as they sit in prod `fixed_freight_items` on 2026-09-30 (the ones these tests touch). */
let seq = 0;
const row = (category: string, product_name: string, freight_rate_ghs: number, keywords: string[]): FixedFreightItemRow =>
  ({ id: `ff-${++seq}`, category, product_name, freight_rate_ghs, keywords, sort_order: seq });

const ITEMS: FixedFreightItemRow[] = [
  row("APPLE WATCH", "Apple Watch Series 9", 500, ["apple watch series 9", "apple watch 9"]),
  row("MAC & LAPTOPS", "iMac", 2500, ["imac"]),
  row("MAC & LAPTOPS", "Laptop Gaming", 1500, ["gaming laptop", "rog", "alienware", "razer blade", "legion", "omen", "predator"]),
  row("MAC & LAPTOPS", "Laptop Regular", 1100, ["laptop", "thinkpad", "dell xps", "hp pavilion", "hp envy", "surface laptop"]),
  row("WATCHES", "Luxury Watch", 300, ["rolex", "omega", "tag heuer", "breitling", "cartier", "luxury watch"]),
  row("WATCHES", "Regular Watch", 100, ["watch", "casio", "timex", "seiko", "citizen", "fossil"]),
  row("GAMING", "PS5 / PS5 Pro", 1500, ["ps5", "playstation 5", "ps5 pro"]),
  row("GAMING", "PS Controllers", 150, ["ps5 controller", "ps4 controller", "dualsense", "dualshock", "xbox controller"]),
  row("IPHONE", "iPhone 15", 900, ["iphone 15"]),
  row("ANDROID", "Low End Android", 300, ["android", "samsung galaxy a", "redmi", "poco", "realme", "motorola moto g", "nokia"]),
  row("AUTOMOTIVE", "Car Headlights", 200, ["headlight", "head light", "headlamp"]),
];
const LAPTOP_GAMING = ITEMS.find((i) => i.product_name === "Laptop Gaming")!;

const HANES = "Hanes Men's Hoodie, EcoSmart Fleece Hooded Sweatshirt for Men & Women, Cotton-Blend Pullover";

function group(overrides: Partial<PricingGroupRow> = {}): PricingGroupRow {
  return {
    id: "g", slug: "g", name: "G", flat_rate_ghs: 100, flat_rate_expression: null,
    value_percentage: 0.05, value_percentage_high: null, value_threshold_usd: null,
    default_weight_lbs: null, requires_weight: false, is_active: true, sort_order: 0, ...overrides,
  };
}

function calculator(): PricingCalculator {
  const calc = new PricingCalculator();
  calc.setConstants({
    freight_rate_per_lb: 5, handling_fee_usd: 3, minimum_tax_usd: 0, fx_buffer_pct: 0,
    tax_pct_usa: 0.1, tax_pct_uk: 0.1, tax_pct_china: 0.08,
    minimum_chargeable_weight_lbs: 1, default_value_fee_pct: 0.05,
  });
  calc.setCategoryPricing(new Map([
    [C.CLOTHING_MEN, group({ slug: "fashion_light", name: "Fashion Light", flat_rate_ghs: 70 })],
    [C.COMPUTERS, group({ slug: "computers", name: "Computers", flat_rate_ghs: 900 })],
    [C.VITAMINS_SUPPLEMENTS, group({ slug: "health", name: "Health", flat_rate_ghs: 80 })],
    [C.HEALTH_HOUSEHOLD, group({ slug: "health", name: "Health", flat_rate_ghs: 80 })],
    [C.WEARABLE_TECHNOLOGY, group({ slug: "wearables", name: "Wearables", flat_rate_ghs: 250 })],
  ]));
  calc.setFixedFreightItems(ITEMS);
  return calc;
}

const match = (title: string, category: string | null = null) => matchFixedFreightItem(ITEMS, title, category)?.item.product_name ?? null;

describe("the Hanes hoodie (prod bug)", () => {
  it("prices at the fashion_light flat rate, not Laptop Gaming", async () => {
    const r = await calculator().calculate({ itemPriceUsd: 20, quantity: 1, category: C.CLOTHING_MEN, productTitle: HANES }, null);
    expect(r.pricing_method).toBe("flat_rate");
    expect(r.pricing_group).toBe("fashion_light");
    expect(r.flat_rate_ghs).toBe(70);
    expect(r.fixed_freight_item).toBeUndefined();
  });

  it("does not match even with no category, because 'omen' is not a word in 'Women'", () => {
    expect(match(HANES)).toBeNull();
  });
});

describe("whole-word keywords", () => {
  it("never matches inside another word", () => {
    expect(match("Progressive Lenses Reading Glasses")).toBeNull();
    expect(match("Frog Plush Toy")).toBeNull();
    expect(match("Women's Watchful Owl Tee")).toBeNull();
  });

  it("matches brand keywords that stand alone", async () => {
    const rog = await calculator().calculate({
      itemPriceUsd: 1400, quantity: 1, category: C.COMPUTERS,
      productTitle: "ASUS ROG Strix G16 (2024) Gaming Laptop, 16\" FHD+ 165Hz, NVIDIA GeForce RTX 4060",
    }, null);
    expect(rog.pricing_method).toBe("fixed_freight");
    expect(rog.fixed_freight_item).toBe("Laptop Gaming");
    expect(rog.fixed_freight_item_id).toBe(LAPTOP_GAMING.id);
    expect(rog.flat_rate_ghs).toBe(1500);

    expect(match("HP OMEN 16 Gaming Laptop, Intel Core i7-13700HX, 16GB RAM", C.COMPUTERS)).toBe("Laptop Gaming");
    expect(match("HP OMEN 16", C.COMPUTERS)).toBe("Laptop Gaming");
  });

  it("treats class changes and plurals as boundaries", () => {
    expect(match("Samsung Galaxy A15 5G, 128GB", C.CELL_PHONES)).toBe("Low End Android");
    expect(match("Sony PS5-Pro Console")).toBe("PS5 / PS5 Pro");
    expect(match("Pair of LED Headlights for 2015 Camry", C.AUTOMOTIVE)).toBe("Car Headlights");
    expect(match("Apple iPhone 15 Pro, 256GB", C.CELL_PHONES)).toBe("iPhone 15");
  });

  it("builds no pattern for a blank keyword", () => {
    expect(keywordPattern("   ")).toBeNull();
  });
});

describe("category gate", () => {
  it("keeps a watch keyword off a supplement", async () => {
    const r = await calculator().calculate({
      itemPriceUsd: 25, quantity: 1, category: C.VITAMINS_SUPPLEMENTS, productTitle: "Nature Made Omega-3 Fish Oil 1200 mg, 200 Softgels",
    }, null);
    expect(r.pricing_method).toBe("flat_rate");
    expect(r.pricing_group).toBe("health");
    expect(match("Omega-3 Fish Oil", C.HEALTH_HOUSEHOLD)).toBeNull();
  });

  it("lets a compatible category through and ignores unknown ones", () => {
    expect(fixedFreightCategoryAllows("MAC & LAPTOPS", C.COMPUTERS)).toBe(true);
    expect(fixedFreightCategoryAllows("MAC & LAPTOPS", C.CLOTHING_WOMEN)).toBe(false);
    expect(fixedFreightCategoryAllows("mac & laptops", C.COMPUTERS)).toBe(true);
    expect(fixedFreightCategoryAllows("MAC & LAPTOPS", null)).toBe(true);
    expect(fixedFreightCategoryAllows("MAC & LAPTOPS", C.OTHER)).toBe(true);
    expect(fixedFreightCategoryAllows("MAC & LAPTOPS", "not a tomame category")).toBe(true);
    expect(fixedFreightCategoryAllows("SOME NEW SHELF", C.CLOTHING_WOMEN)).toBe(true);
  });
});

describe("accessory guard", () => {
  it("skips accessories named right after the keyword", () => {
    expect(match("Laptop Stand for Desk, Adjustable Aluminum", C.COMPUTERS)).toBeNull();
    expect(match("Laptop Bag 15.6 inch Waterproof")).toBeNull();
    expect(match("Laptop Sleeves 13 inch")).toBeNull();
    expect(match("Watch Band Compatible with Apple Watch")).toBeNull();
    expect(match("iPhone 15 Case with MagSafe", C.CELL_PHONES)).toBeNull();
  });

  it("skips accessories that say what they fit", () => {
    expect(match("Clear Case for iPhone 15", C.CELL_PHONES)).toBeNull();
    expect(match("Screen Protector Compatible with iPhone 15")).toBeNull();
    expect(match("Charging Station for PS5")).toBeNull();
  });

  it("lets an item whose own name is the accessory keep it", () => {
    expect(match("PS5 Controller DualSense Wireless - Midnight Black", C.VIDEO_GAMES)).toBe("PS Controllers");
    expect(match("DualSense Wireless Controller for PS5", C.VIDEO_GAMES)).toBe("PS Controllers");
  });

  it("still matches the real product", async () => {
    const r = await calculator().calculate({
      itemPriceUsd: 399, quantity: 1, category: C.WEARABLE_TECHNOLOGY,
      productTitle: "Apple Watch Series 9 [GPS 41mm] Smartwatch with Midnight Aluminum Case with Midnight Sport Band",
    }, null);
    expect(r.pricing_method).toBe("fixed_freight");
    expect(r.fixed_freight_item).toBe("Apple Watch Series 9");
    expect(r.flat_rate_ghs).toBe(500);
    expect(match("Dell XPS 13 Laptop", C.COMPUTERS)).toBe("Laptop Regular");
  });
});

describe("fixedFreightItemId override", () => {
  const rog = { itemPriceUsd: 1400, quantity: 1, category: C.COMPUTERS, productTitle: "ASUS ROG Strix G16 Gaming Laptop" };

  it("undefined matches by keyword", async () => {
    const r = await calculator().calculate({ ...rog, fixedFreightItemId: undefined }, null);
    expect(r.fixed_freight_item).toBe("Laptop Gaming");
  });

  it("null forces category pricing", async () => {
    const r = await calculator().calculate({ ...rog, fixedFreightItemId: null }, null);
    expect(r.pricing_method).toBe("flat_rate");
    expect(r.pricing_group).toBe("computers");
    expect(r.flat_rate_ghs).toBe(900);
  });

  it("an active id wins over the keyword, gate and guard", async () => {
    const regular = ITEMS.find((i) => i.product_name === "Laptop Regular")!;
    const r = await calculator().calculate({ ...rog, fixedFreightItemId: regular.id }, null);
    expect(r.pricing_method).toBe("fixed_freight");
    expect(r.fixed_freight_item).toBe("Laptop Regular");
    expect(r.fixed_freight_item_id).toBe(regular.id);
    expect(r.flat_rate_ghs).toBe(1100);

    const hoodie = await calculator().calculate({ itemPriceUsd: 20, quantity: 2, category: C.CLOTHING_MEN, productTitle: HANES, fixedFreightItemId: regular.id }, null);
    expect(hoodie.flat_rate_ghs).toBe(2200);
    expect(hoodie.pricing_group).toBe("fashion_light");
  });

  it("an unknown id falls back to keyword matching without throwing", async () => {
    const r = await calculator().calculate({ ...rog, fixedFreightItemId: "no-such-item" }, null);
    expect(r.fixed_freight_item).toBe("Laptop Gaming");
    expect(logger.warn).toHaveBeenCalled();
  });
});
