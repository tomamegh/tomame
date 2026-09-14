/**
 * Turning one pasted product into a search term worth scraping.
 *
 * Pure and framework-free so it can be unit tested without a database, and
 * because getting this wrong is the whole risk of the feature: a bad term spends
 * a vendor call from a budget of roughly 1000 a MONTH and fills the catalogue
 * with nothing anyone searches for.
 *
 * THE PROBLEM. A listing title is written to sell ONE unit, so it carries every
 * variant axis the seller could think of:
 *
 *   "AT&T Samsung Galaxy S24 Ultra Titanium Violet 512GB"
 *   "Oraimo BoomPop N Wireless Over-Ear Headphones · Black"
 *
 * Searched verbatim, the first returns that exact phone in that exact colour at
 * that exact capacity from that exact carrier, which is not "similar products",
 * it is the same product again. What we want is the shortest phrase a person
 * would actually type when shopping for one:
 *
 *   "Samsung Galaxy S24 Ultra"
 *   "Oraimo BoomPop Wireless Headphones"
 *
 * So the title is cut down, not cleaned up. Everything below removes; nothing
 * invents a word the seller did not write.
 */

/** Colours, capacities, carriers and packaging noise: the variant axes. */
const NOISE = new Set([
  "black", "white", "silver", "gold", "grey", "gray", "blue", "red", "green",
  "pink", "purple", "violet", "titanium", "graphite", "midnight", "starlight",
  "rose", "beige", "navy", "teal", "yellow", "orange", "brown",
  "unlocked", "refurbished", "renewed", "used", "new", "genuine", "original",
  "pack", "pcs", "pc", "set", "bundle", "kit", "lot",
  "with", "and", "for", "the", "a", "an", "of", "in", "by",
]);

/** Carriers and marketplaces that prefix a title without describing the item. */
const PREFIXES = new Set(["at&t", "att", "verizon", "t-mobile", "tmobile", "sprint", "boost"]);

/** 512gb, 128g, 16gb, 4k, 1080p, 13", 5.6oz, 2-pack, m3, s24 stays. */
const SPEC = /^(\d+(\.\d+)?\s*(gb|tb|mb|g|oz|lb|lbs|ml|l|cm|mm|inch|in|k|p|w|mah|hz)|[\d.]+["']|\d+-?pack)$/i;

/**
 * The most words a term may carry.
 *
 * Four is not arbitrary: "Samsung Galaxy S24 Ultra" and "Oraimo BoomPop
 * Wireless Headphones" are four, and a fifth word is almost always the variant
 * axis we are trying to drop. A term that is too broad still returns similar
 * products; one that is too narrow returns the same item and wastes the call.
 */
const MAX_WORDS = 4;
const MIN_TERM_LENGTH = 3;

/**
 * A search term derived from a listing, or null when the title does not support
 * one.
 *
 * Null is a real answer and the caller must honour it: a title of pure noise, or
 * one so short that cutting it leaves nothing, is not worth a vendor call.
 */
export function deriveCatalogTerm(
  title: string | null | undefined,
  brand?: string | null,
): string | null {
  if (!title) return null;

  // Everything after a separator is nearly always the variant: the seller put
  // the product first and the options after the bullet, pipe or comma.
  const head = title.split(/[·|,–—]|\s-\s/)[0] ?? title;

  const words = head
    // Parenthetical asides are options too: "(2nd Generation)", "(Black)".
    .replace(/\([^)]*\)/g, " ")
    .replace(/[^\p{L}\p{N}&.'"\-\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);

  const kept: string[] = [];
  for (const word of words) {
    const plain = word.toLowerCase().replace(/[.'"]+$/, "");
    if (kept.length === 0 && PREFIXES.has(plain)) continue;
    // A spec token is dropped, but only once real words are present: "4K
    // Monitor" needs the 4K, "Galaxy S24 Ultra 512GB" does not need the 512GB.
    if (SPEC.test(plain) && kept.length > 0) continue;
    if (NOISE.has(plain)) continue;
    kept.push(word);
    if (kept.length >= MAX_WORDS) break;
  }

  // The brand leads, when the seller buried it. Never appended: "Headphones
  // Oraimo" is not a phrase anyone types.
  const cleanBrand = brand?.trim();
  if (cleanBrand && kept.length > 0) {
    const has = kept.some((w) => w.toLowerCase() === cleanBrand.toLowerCase());
    if (!has) kept.unshift(cleanBrand);
  }

  const term = kept.slice(0, MAX_WORDS).join(" ").trim();
  if (term.length < MIN_TERM_LENGTH) return null;
  // A term of one short token ("Pro", "Max") describes nothing on its own.
  if (kept.length === 1 && term.length < 6) return null;
  return term;
}

/**
 * Which catalogue store a derived term should be scraped from.
 *
 * `catalog_queries.store` accepts only amazon and ebay, because those are the
 * two the scraper knows how to search. A customer pasting a Walmart link still
 * gets similar products, they just come from Amazon, which is the larger
 * catalogue and the better bet for "something like this".
 *
 * ONE STORE PER TERM, not both. Each query costs one vendor call per scrape
 * tick out of a monthly budget the live quote path already shares; enqueuing
 * every pasted product twice would halve how many distinct products the
 * catalogue learns about for no gain in variety.
 */
export function catalogStoreFor(platform: string | null | undefined): "amazon" | "ebay" {
  return platform?.toLowerCase() === "ebay" ? "ebay" : "amazon";
}
