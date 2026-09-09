import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { EXTRACTION } from "@/config/extraction";

/**
 * Apify community actors — an OPTIONAL last-resort tier. Skipped entirely when
 * APIFY_API_TOKEN is unset. Every actor is pinned to a build tag so an author's
 * update cannot change the output shape underneath us; bump deliberately.
 */
const APIFY_BASE_URL = "https://api.apify.com/v2";

const ACTORS = {
  amazon: "axesso_data~amazon-product-details-scraper",
  ebay: "dtrungtin~ebay-items-scraper",
  shein: "seamless_coffer~shein-product-scraper",
  microcenter: "fortuitous_pirate~microcenter-scraper",
} as const;

/** Actor build to run. "latest" tracks the author; a version tag ("1.2") pins it. */
const ACTOR_BUILD = "latest";

export function isApifyConfigured(): boolean {
  return env.extraction.apifyApiToken !== null;
}

export interface ApifyProductDetail {
  name?: string;
  value?: string;
}

export interface ApifyEbayProduct {
  statusCode?: number;
  statusMessage?: string;
  url?: string;
  title?: string;
  subtitle?: string;
  itemId?: string | number;
  itemNumber?: string | number;
  productID?: string | number;
  price?: number | string;
  currency?: string;
  priceFormatted?: string;
  seller?: { username?: string; name?: string; url?: string } | string;
  condition?: string;
  categoryPath?: string[];
  breadcrumbs?: { text?: string; url?: string }[] | string[];
  images?: string[];
  imageUrlList?: string[];
  mainImage?: string;
  description?: string;
  features?: string[];
  itemSpecifics?: Record<string, string> | Array<{ name?: string; value?: string }>;
  productDetails?: Array<{ name?: string; value?: string }>;
  brand?: string;
  mpn?: string;
  upc?: string;
  location?: string;
  shippingCost?: number;
  [key: string]: unknown;
}

export interface ApifySheinPrice {
  amount?: number | string;
  amount_with_symbol?: string;
  usd_amount?: number | string;
  usd_amount_with_symbol?: string;
  currency?: string;
}

export interface ApifySheinProduct {
  url?: string;
  status?: string;
  error?: string;
  data_source?: string;
  goods_id?: string | number;
  product_id?: string | number;
  sku?: string;
  title?: string;
  description?: string;
  brand?: string;
  main_image?: string;
  images?: string[];
  sale_price?: ApifySheinPrice;
  retail_price?: ApifySheinPrice;
  has_discount?: boolean;
  discount_percentage?: number;
  color?: string;
  sizes?: Array<{ attr_value_name?: string; attr_value_name_en?: string; is_sold_out?: boolean }>;
  breadcrumbs?: Array<string | { name?: string; text?: string; url?: string }>;
  category?: string;
  category_path?: string[];
  rating?: number | string;
  review_count?: number | string;
  [key: string]: unknown;
}

export interface ApifyAmazonProduct {
  statusCode?: number;
  statusMessage?: string;
  url?: string;
  title?: string;
  manufacturer?: string;
  countReview?: number;
  productRating?: string;
  asin?: string;
  soldBy?: string;
  fulfilledBy?: string;
  warehouseAvailability?: string;
  retailPrice?: number;
  price?: number;
  priceRange?: string | null;
  shippingPrice?: number;
  priceSaving?: string;
  features?: string[];
  imageUrlList?: string[];
  productDescription?: string;
  productDetails?: ApifyProductDetail[];
  breadcrumbs?: { text?: string; url?: string }[];
  [key: string]: unknown;
}

export interface ApifyMicrocenterProduct {
  sku?: string;
  product_name?: string;
  brand?: string;
  category?: string;
  price?: number;
  original_price?: number;
  availability?: string;
  store_location?: string;
  store_inventory?: string;
  product_url?: string;
  description?: string;
  images?: string[];
  specifications?: Record<string, string> | Array<{ name?: string; value?: string }>;
  [key: string]: unknown;
}

/** Run an actor synchronously and return its dataset items, or null on any failure. */
async function runActor<T>(actorId: string, input: Record<string, unknown>, label: string): Promise<T[] | null> {
  const token = env.extraction.apifyApiToken;
  if (!token) return null;

  const timeout = EXTRACTION.apifyRunTimeoutSeconds;
  const url =
    `${APIFY_BASE_URL}/acts/${actorId}/run-sync-get-dataset-items` +
    `?token=${encodeURIComponent(token)}&timeout=${timeout}&format=json&build=${ACTOR_BUILD}`;

  try {
    logger.info("apify: starting run", { actor: actorId, label });
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
      signal: AbortSignal.timeout((timeout + 20) * 1000),
    });

    if (!res.ok) {
      const errorText = await res.text().catch(() => "Unknown error");
      logger.error("apify: actor run failed", { actor: actorId, label, status: res.status, error: errorText.slice(0, 300) });
      return null;
    }

    const items = (await res.json()) as T[];
    if (!Array.isArray(items) || items.length === 0) {
      logger.warn("apify: actor returned no items", { actor: actorId, label });
      return null;
    }
    return items;
  } catch (err) {
    logger.error("apify: exception during run", {
      actor: actorId,
      label,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

export async function scrapeAmazonWithApify(productUrl: string): Promise<ApifyAmazonProduct | null> {
  let countryDomain = "amazon.com";
  try {
    const host = new URL(productUrl).hostname;
    const m = host.match(/amazon\.([a-z.]+)$/);
    if (m?.[1]) countryDomain = `amazon.${m[1]}`;
  } catch {
    // keep default
  }
  const items = await runActor<ApifyAmazonProduct>(ACTORS.amazon, { urls: [productUrl], countryDomain }, productUrl);
  const item = items?.[0];
  if (!item) return null;
  if (item.statusMessage && item.statusMessage !== "FOUND") {
    logger.warn("apify: amazon product not found", { url: productUrl, status: item.statusMessage });
    return null;
  }
  return item;
}

export async function scrapeEbayWithApify(productUrl: string): Promise<ApifyEbayProduct | null> {
  const items = await runActor<ApifyEbayProduct>(ACTORS.ebay, { startUrls: [{ url: productUrl }], maxItems: 1 }, productUrl);
  const item = items?.[0];
  if (!item) return null;
  if (item.statusMessage && !/^(FOUND|OK|SUCCESS)$/i.test(item.statusMessage)) {
    logger.warn("apify: ebay product not found", { url: productUrl, status: item.statusMessage });
    return null;
  }
  return item;
}

export async function scrapeSheinWithApify(productUrl: string): Promise<ApifySheinProduct | null> {
  const items = await runActor<ApifySheinProduct>(
    ACTORS.shein,
    {
      urls: [productUrl],
      // Default proxy pool is blocked >50% of the time by SHEIN's anti-bot; premium is same price per result.
      proxyAccount: "premium",
      maxRetries: 5,
      includeImages: true,
      includeReviews: false,
    },
    productUrl,
  );
  const item = items?.[0];
  if (!item) return null;
  if (item.status && item.status !== "success") {
    logger.warn("apify: shein product not found", { url: productUrl, status: item.status, error: item.error });
    return null;
  }
  return item;
}

export async function scrapeMicrocenterWithApify(productUrl: string): Promise<ApifyMicrocenterProduct | null> {
  let searchQuery: string;
  let numericId: string | null = null;
  try {
    const u = new URL(productUrl);
    const match = u.pathname.match(/\/product\/(\d+)(?:\/([^/]+))?/);
    if (match?.[1]) {
      numericId = match[1];
      searchQuery = match[1];
    } else {
      const slug = u.pathname.split("/").filter(Boolean).pop() ?? "";
      searchQuery = slug.replace(/-/g, " ").trim();
    }
  } catch {
    return null;
  }

  const items = await runActor<ApifyMicrocenterProduct>(
    ACTORS.microcenter,
    { searchQuery, maxProducts: 5, scrapeDetails: true, inStockOnly: false },
    productUrl,
  );
  if (!items) return null;
  if (numericId) {
    const exact = items.find((item) => item.product_url?.includes(numericId!));
    if (exact) return exact;
  }
  return items[0] ?? null;
}
