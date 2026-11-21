/**
 * The landing hero's receipt: one popular product at a time, changed every two
 * hours (features/marketing/services/hero-product.service.ts).
 *
 * Only WHICH products is authored here. Price, picture and title come from a
 * real listing (our catalogue, which the scraper keeps fresh, or eBay's own
 * search for items the catalogue's stores do not sell new and unlocked, like
 * iPhones), and every GH₵ figure is the pricing calculator's.
 */
export interface HeroProductSpec {
  /** What the search asks for. */
  query: string;
  /** Every one of these words must be in the listing's title (lower case). */
  mustInclude: string[];
  /** Any of these in the title rules a listing out ("max" keeps a Pro a Pro). */
  mustExclude?: string[];
  /** Where to look: our catalogue (Amazon, Walmart) or eBay's search. */
  source: "catalogue" | "ebay";
  /** The pricing category, when the listing does not carry one. */
  category: string;
}

export const HERO_ROTATION_MS = 2 * 60 * 60 * 1000;

export const HERO_PRODUCTS: readonly HeroProductSpec[] = [
  { query: "iPhone 17 Pro 256GB unlocked", mustInclude: ["iphone", "17", "pro"], mustExclude: ["max", "case", "screen"], source: "ebay", category: "Cell Phones & Accessories" },
  { query: "AirPods Pro 3", mustInclude: ["airpods", "pro", "3"], mustExclude: ["case", "cover", "tips"], source: "catalogue", category: "Headphones" },
  { query: "Nintendo Switch 2", mustInclude: ["nintendo", "switch", "2"], mustExclude: ["case", "game", "controller", "headset", "edition", "bundle"], source: "catalogue", category: "Video Games" },
  { query: "Samsung Galaxy S26", mustInclude: ["samsung", "galaxy", "s26"], mustExclude: ["case", "renewed", "fe"], source: "catalogue", category: "Cell Phones & Accessories" },
  { query: "iPhone 17 Pro Max 256GB unlocked", mustInclude: ["iphone", "17", "pro", "max"], mustExclude: ["case", "screen"], source: "ebay", category: "Cell Phones & Accessories" },
  { query: "Apple Watch Series", mustInclude: ["apple", "watch", "series"], mustExclude: ["band", "case", "charger", "protector"], source: "catalogue", category: "Watches" },
  { query: "JBL Flip", mustInclude: ["jbl", "flip"], mustExclude: ["case"], source: "catalogue", category: "Smart Home" },
];

/** Which two-hour window `now` is in. */
export function heroSlot(now: number, periodMs = HERO_ROTATION_MS): number {
  return Math.floor(now / periodMs);
}

/** The products to try for a window, starting with that window's own. */
export function heroOrderForSlot(slot: number, products: readonly HeroProductSpec[] = HERO_PRODUCTS): HeroProductSpec[] {
  const n = products.length;
  if (n === 0) return [];
  const start = ((slot % n) + n) % n;
  return [...products.slice(start), ...products.slice(0, start)];
}

const words = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").split(/\s+/).filter(Boolean);

/** True when the title names the product: every required word, none of the excluded ones. */
export function titleMatchesHero(title: string, spec: Pick<HeroProductSpec, "mustInclude" | "mustExclude">): boolean {
  const have = new Set(words(title));
  return spec.mustInclude.every((w) => have.has(w)) && !(spec.mustExclude ?? []).some((w) => have.has(w));
}
