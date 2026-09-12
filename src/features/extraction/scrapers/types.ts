import type { CheerioAPI } from "cheerio";
import type { TomameCategory } from "@/config/categories";
import { addVariant, cleanString, normalizeImages, parseRating, parseReviewCount } from "./parse";

export type HtmlAttemptName =
  | "direct"
  | "zyte-browser"
  | "oxylabs-render"
  | "unblock"
  | "unblock+residential"
  | "content+residential"
  | "content";

export interface ScrapedProduct {
  /** Product title */
  title: string | null;
  /** Main product image URL */
  image: string | null;
  /** Price as a number, in `currency` */
  price: number | null;
  /** ISO currency code (e.g. "USD", "GBP") */
  currency: string | null;
  /** Product description / about text */
  description: string | null;
  /** Brand name */
  brand: string | null;
  /** Product category (mapped to Tomame category) */
  category: TomameCategory | null;
  /** Selected size (the one shown / default on the page) */
  size: string | null;
  /** Weight as listed on the page (raw string) */
  weight: string | null;
  /** Weight parsed to pounds — the unit the pricing engine uses */
  weight_lbs: number | null;
  /** Product dimensions / measurements */
  dimensions: string | null;
  /** Structured specifications (key-value pairs like material, color, etc.) */
  specifications: Record<string, string>;
  /** Merchant / seller name when the store states one (eBay seller, Amazon "Sold by"). */
  seller: string | null;
  /** Item condition exactly as the source states it ("New", "Used", "Renewed"); null when the source does not say. */
  condition: string | null;
  /** Average customer rating on a 0–5 scale. */
  rating: number | null;
  /** Number of ratings / reviews behind `rating`, as an integer. */
  review_count: number | null;
  /** Gallery images: ordered, de-duplicated, absolute URLs. `images[0] === image` when both exist. */
  images: string[];
  /**
   * AVAILABLE options per attribute, e.g. { size: ["S","M"], color: ["Black","Silver"] }.
   * The chosen colour/size stay in `size` / `specifications`.
   */
  variants: Record<string, string[]>;
  /** Raw store availability phrase, e.g. "In Stock". */
  availability: string | null;
  /** Everything else: vendor ids, list price, breadcrumbs, legacy copies of the typed facts. */
  metadata: Record<string, unknown>;
}

export function emptyProduct(): ScrapedProduct {
  return {
    title: null,
    image: null,
    price: null,
    currency: null,
    description: null,
    brand: null,
    category: null,
    size: null,
    weight: null,
    weight_lbs: null,
    dimensions: null,
    specifications: {},
    seller: null,
    condition: null,
    rating: null,
    review_count: null,
    images: [],
    variants: {},
    availability: null,
    metadata: {},
  };
}

/** Typed fact fields that older cache rows may lack (added 2026-09-12). */
const TYPED_FACTS = ["seller", "condition", "rating", "review_count", "images", "variants", "availability"] as const;

/**
 * Fill in a product that predates the typed fact fields (old `extraction_cache`
 * JSONB rows) so every consumer sees the full `ScrapedProduct` shape.
 *
 * - `images` is derived from `[image]` when the array is absent; `image` from
 *   `images[0]` when the scalar is absent.
 * - A fact that is ABSENT (not merely null) is read from the legacy `metadata`
 *   copy the old resolvers wrote (`rating`, `reviewCount`, `soldBy` / `seller`,
 *   `condition`, `availability`, `images`, `availableSizes`). An explicit null
 *   from a newer row is kept as null. Nothing is invented.
 *
 * Pure: never mutates its argument.
 */
export function withProductDefaults(product: Partial<ScrapedProduct> | ScrapedProduct | null | undefined): ScrapedProduct {
  const p: Partial<ScrapedProduct> = product ?? {};
  const meta: Record<string, unknown> = p.metadata && typeof p.metadata === "object" && !Array.isArray(p.metadata) ? p.metadata : {};
  const out: ScrapedProduct = { ...emptyProduct() };

  for (const key of Object.keys(out) as (keyof ScrapedProduct)[]) {
    const v = p[key];
    if (v !== undefined && !TYPED_FACTS.includes(key as (typeof TYPED_FACTS)[number])) {
      (out as unknown as Record<string, unknown>)[key] = v;
    }
  }
  out.specifications = p.specifications && typeof p.specifications === "object" && !Array.isArray(p.specifications) ? { ...p.specifications } : {};
  out.metadata = { ...meta };

  const rawImages = Array.isArray(p.images) ? p.images : Array.isArray(meta.images) ? meta.images : [];
  out.images = normalizeImages(rawImages, p.image ?? null);
  out.image = p.image ?? out.images[0] ?? null;

  out.seller = p.seller !== undefined ? p.seller : cleanString(meta.soldBy) ?? cleanString(meta.seller);
  out.condition = p.condition !== undefined ? p.condition : cleanString(meta.condition);
  out.rating = p.rating !== undefined ? p.rating : parseRating(meta.rating);
  out.review_count = p.review_count !== undefined ? p.review_count : parseReviewCount(meta.reviewCount);
  out.availability = p.availability !== undefined ? p.availability : cleanString(meta.availability);

  const variants: Record<string, string[]> = {};
  if (p.variants && typeof p.variants === "object" && !Array.isArray(p.variants)) {
    for (const [k, list] of Object.entries(p.variants)) {
      if (Array.isArray(list)) for (const v of list) addVariant(variants, k, v);
    }
  } else if (Array.isArray(meta.availableSizes)) {
    for (const v of meta.availableSizes) addVariant(variants, "size", v);
  }
  out.variants = variants;

  return out;
}

/**
 * A platform scraper knows the store's URL shapes and how to read its HTML.
 * It never fetches — fetching is the resolver chain's job — so it is pure and
 * fully testable against fixtures.
 */
export interface PlatformScraper {
  /** Domains this scraper handles (subdomains match). */
  readonly domains: string[];
  /** Currency the store lists in when the page doesn't say. */
  readonly defaultCurrency: string;
  /** Is this a product page URL (vs. search, category, home)? Cheap check, no network. */
  isProductUrl(url: string): boolean;
  /** Canonical product URL — drops tracking, pins locale where it matters. */
  canonicalUrl(url: string): string;
  /** Does this HTML look like a rendered product page (not a captcha / empty shell)? */
  looksLikeProductPage(html: string): boolean;
  /** CSS selector headless Chrome should wait for before returning HTML (SPAs hydrate late). */
  readonly renderWaitSelector: string;
  /**
   * Which HTML sources to try, in order. Omit for the default (direct fetch,
   * datacenter unblock, residential unblock, residential rendered content).
   * Set it once a store is known to reject a path, so we stop paying for it.
   */
  readonly htmlAttempts?: HtmlAttemptName[];
  /** Extract product data from parsed HTML. */
  extract($: CheerioAPI): ScrapedProduct;
}
