import { env } from "@/lib/env";
import { logger } from "@/lib/logger";

const APIFY_BASE_URL = "https://api.apify.com/v2";
const AMAZON_ACTOR_ID = "axesso_data~amazon-product-details-scraper";
// Swap to whichever eBay actor you're subscribed to (Apify uses `~` between user and actor name).
const EBAY_ACTOR_ID = "dtrungtin~ebay-items-scraper";

/** Timeout for the sync run (seconds) — Apify max is 300 */
const RUN_TIMEOUT_SECONDS = 120;

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
  /** Some actors return `itemNumber` or `productID` instead of `itemId`. */
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

/**
 * Run the Apify Amazon scraper for a single product URL.
 * Uses the synchronous run endpoint that waits for completion
 * and returns dataset items directly.
 */
export async function scrapeAmazonWithApify(productUrl: string): Promise<ApifyAmazonProduct | null> {
  const token = env.apify.apiToken;
  const endpoint = `${APIFY_BASE_URL}/acts/${AMAZON_ACTOR_ID}/run-sync-get-dataset-items`;

  try {
    logger.info("apify: starting Amazon scrape", { url: productUrl });

    const res = await fetch(
      `${endpoint}?token=${token}&timeout=${RUN_TIMEOUT_SECONDS}&format=json`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          urls: [productUrl],
          countryDomain: "amazon.com",
        }),
        signal: AbortSignal.timeout((RUN_TIMEOUT_SECONDS + 30) * 1000),
      },
    );

    if (!res.ok) {
      const errorText = await res.text().catch(() => "Unknown error");
      logger.error("apify: actor run failed", {
        url: productUrl,
        status: res.status,
        error: errorText,
      });
      return null;
    }

    const items: ApifyAmazonProduct[] = await res.json();
    if (!items || items.length === 0) {
      logger.warn("apify: actor returned no items", { url: productUrl });
      return null;
    }

    const item = items[0]!;
    if (item.statusMessage !== "FOUND") {
      logger.warn("apify: product not found", { url: productUrl, status: item.statusMessage });
      return null;
    }

    logger.info("apify: scrape successful", { url: productUrl });
    return item;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    logger.error("apify: exception during scrape", { url: productUrl, error: message });
    return null;
  }
}

/**
 * Run the Apify eBay scraper for a single product URL.
 * Most eBay actors accept `startUrls: [{ url }]` as input.
 */
export async function scrapeEbayWithApify(productUrl: string): Promise<ApifyEbayProduct | null> {
  const token = env.apify.apiToken;
  const endpoint = `${APIFY_BASE_URL}/acts/${EBAY_ACTOR_ID}/run-sync-get-dataset-items`;

  try {
    logger.info("apify: starting eBay scrape", { url: productUrl });

    const res = await fetch(
      `${endpoint}?token=${token}&timeout=${RUN_TIMEOUT_SECONDS}&format=json`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          startUrls: [{ url: productUrl }],
          maxItems: 1,
        }),
        signal: AbortSignal.timeout((RUN_TIMEOUT_SECONDS + 30) * 1000),
      },
    );

    if (!res.ok) {
      const errorText = await res.text().catch(() => "Unknown error");
      logger.error("apify: eBay actor run failed", {
        url: productUrl,
        status: res.status,
        error: errorText,
      });
      return null;
    }

    const items: ApifyEbayProduct[] = await res.json();
    if (!items || items.length === 0) {
      logger.warn("apify: eBay actor returned no items", { url: productUrl });
      return null;
    }

    const item = items[0]!;
    // Actors differ on status field semantics — accept FOUND/OK or no status at all
    if (item.statusMessage && !/^(FOUND|OK|SUCCESS)$/i.test(item.statusMessage)) {
      logger.warn("apify: eBay product not found", { url: productUrl, status: item.statusMessage });
      return null;
    }

    logger.info("apify: eBay scrape successful", { url: productUrl });
    return item;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    logger.error("apify: eBay exception during scrape", { url: productUrl, error: message });
    return null;
  }
}
