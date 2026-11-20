import { logger } from "@/lib/logger";
import { EXTRACTION } from "@/config/extraction";
import {
  fetchAmazonOffersStructured,
  isScraperApiConfigured,
  type ScraperApiAmazonOffer,
  type ScraperApiAmazonOffers,
} from "@/lib/scraperapi/client";
import type { ScrapedProduct } from "../scrapers/types";
import { cleanString, parseRating, parseReviewCount, parseStoreShipping } from "../scrapers/parse";
import { amazonAsinOf, defaultCurrencyForUrl } from "../url";
import { marketplace, normalizeCurrency } from "./scraperapi.resolver";
import type { ExtractionResolver, PartialProduct, ResolveContext, ResolverResult } from "./types";

/**
 * Amazon's offer list (ScraperAPI `structured/amazon/offers`): every seller
 * selling this ASIN. Read when the product read has no price — Amazon shows
 * "No featured offers available" to a shopper abroad while sellers still list
 * the item — and as the independent second read that confirms an Amazon price.
 */

/** A third-party seller we quote from: this share of positive ratings, over at least this many ratings. */
export const OFFER_MIN_POSITIVE_PCT = 90;
export const OFFER_MIN_SELLER_REVIEWS = 50;

/** Phrases Amazon shows when the listing has no buy box. */
const NO_BUY_BOX = /no featured offers|see all buying options|available from these sellers/i;

export function hasNoBuyBox(product: Pick<ScrapedProduct, "availability" | "metadata">): boolean {
  const meta = product.metadata?.availability;
  return NO_BUY_BOX.test([product.availability, typeof meta === "string" ? meta : ""].join(" "));
}

function num(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v !== "string") return null;
  const n = parseFloat(v.replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) ? n : null;
}

const isNew = (o: ScraperApiAmazonOffer) => /^\s*new\b/i.test(o.condition ?? "");
const isAmazon = (o: ScraperApiAmazonOffer) => /^amazon(\.com|\.co\.uk)?$/i.test((o.seller_name ?? "").trim());

/** Amazon itself, fulfilled by Amazon, or a seller with ≥ 90% positive over ≥ 50 ratings. */
export function isTrustedSeller(o: ScraperApiAmazonOffer): boolean {
  if (isAmazon(o) || o.fullfilled_by_amazon === true) return true;
  const pct = num(o.seller_percent_positive_ratings);
  const reviews = num(o.seller_total_reviews);
  return pct != null && reviews != null && pct >= OFFER_MIN_POSITIVE_PCT && reviews >= OFFER_MIN_SELLER_REVIEWS;
}

export interface ChosenOffer {
  offer: ScraperApiAmazonOffer;
  price: number;
  /** Per unit to the US hub, in the listing currency; null when the offer does not say. */
  shipping: number | null;
  /** True when the item is only offered used, renewed or refurbished. */
  notNew: boolean;
}

const priced = (o: ScraperApiAmazonOffer) => (num(o.price) ?? 0) > 0;
const cheapest = (offers: ScraperApiAmazonOffer[]) => [...offers].sort((a, b) => num(a.price)! - num(b.price)!)[0] ?? null;

/**
 * The offer we quote:
 *   1. the pinned offer, when it is New;
 *   2. else the cheapest New offer from a trusted seller (`isTrustedSeller`);
 *   3. only when nobody offers it New: the cheapest trusted used/renewed offer
 *      (its condition then triggers the stock check before Pay).
 * New offers from untrusted sellers only are not quoted: null, like no offers.
 */
export function chooseAmazonOffer(listings: readonly ScraperApiAmazonOffer[]): ChosenOffer | null {
  const offers = listings.filter(priced);
  const fresh = offers.filter(isNew);
  let offer = fresh.find((o) => o.pinned_offer === true) ?? cheapest(fresh.filter(isTrustedSeller));
  let notNew = false;
  if (!offer && fresh.length === 0) {
    offer = cheapest(offers.filter((o) => o.pinned_offer === true || isTrustedSeller(o)));
    notNew = offer != null;
  }
  if (!offer) return null;
  const shipping = parseStoreShipping(offer.shipping_price_extracted) ?? parseStoreShipping(offer.shipping_price);
  return { offer, price: num(offer.price)!, shipping, notNew };
}

/** The offer list as a partial product: the listing's name and image, and the chosen offer's price, seller and condition. */
export function mapAmazonOffers(data: ScraperApiAmazonOffers, sourceUrl: string): { product: PartialProduct; chosen: ChosenOffer | null } {
  const listings = data.listings ?? [];
  const chosen = chooseAmazonOffer(listings);
  const item = data.item ?? {};
  const fallbackCurrency = defaultCurrencyForUrl(sourceUrl);
  const product: PartialProduct = {
    title: cleanString(item.name),
    image: cleanString(item.image),
    images: item.image ? [item.image] : [],
    rating: parseRating(item.average_rating),
    review_count: parseReviewCount(item.total_reviews),
    metadata: {
      asin: amazonAsinOf(sourceUrl),
      offerCount: listings.length,
      source: "amazon-offers",
    },
  };
  if (!chosen) return { product, chosen };
  const seller = cleanString(chosen.offer.seller_name);
  const condition = cleanString(chosen.offer.condition);
  Object.assign(product, {
    price: chosen.price,
    currency: normalizeCurrency(chosen.offer.price_symbol, fallbackCurrency),
    store_shipping: chosen.shipping,
    seller,
    condition,
    availability: seller ? `In stock from ${seller}` : "In stock",
  });
  product.metadata = {
    ...product.metadata,
    priceVia: chosen.offer.pinned_offer ? "pinned-offer" : "seller-offer",
    offerSeller: seller,
    offerSellerId: cleanString(chosen.offer.seller_id),
    offerCondition: condition,
    offerFba: chosen.offer.fullfilled_by_amazon === true,
    offerPinned: chosen.offer.pinned_offer === true,
    offerDeliveryEarliest: cleanString(chosen.offer.delivery_earliest_date),
  };
  return { product, chosen };
}

/**
 * Per field: the offer owns price, currency, shipping, seller and condition
 * (it is the exact offer we would buy); the listing's own name, image and
 * rating stay with the product read when it has them.
 */
const CONFIDENCE: ResolverResult["confidence"] = { title: 0.8, image: 0.8, rating: 0.8, review_count: 0.8 };

export const amazonOffersResolver: ExtractionResolver = {
  name: "amazon-offers",
  defaultConfidence: 0.97,
  needsHtml: false,
  // Hedge behind the product read; start at once when it answered with no price.
  startAfterMs: EXTRACTION.amazonOffersHedgeMs,
  startWhen: (ctx) => !!ctx.current.title && ctx.current.price == null,
  readsUnavailable: true,
  available: (ctx) => ctx.platform === "amazon" && isScraperApiConfigured(),
  shouldRun: (ctx) => ctx.current.price == null || hasNoBuyBox(ctx.current),
  async resolve(ctx: ResolveContext): Promise<ResolverResult> {
    if (ctx.deadline - Date.now() < 3_000) return { product: {} };
    const asin = amazonAsinOf(ctx.url);
    if (!asin) return { product: {} };
    try {
      const { tld, country } = marketplace(ctx.url);
      const data = await fetchAmazonOffersStructured(asin, tld, country);
      if (!data) return { product: {} };
      const { product, chosen } = mapAmazonOffers(data, ctx.url);
      const messages: string[] = [];
      if (chosen && !chosen.offer.pinned_offer && product.seller) {
        messages.push(`Amazon shows no featured offer for this item; we priced ${product.seller}'s offer.`);
      }
      if (!chosen && (data.listings?.length ?? 0) === 0) messages.push("No seller is offering this item on Amazon right now.");
      logger.info("amazon offers: read", { asin, offers: data.listings?.length ?? 0, chosen: chosen ? { price: chosen.price, seller: product.seller, condition: product.condition } : null });
      return { product, confidence: CONFIDENCE, messages };
    } catch (err) {
      logger.warn("amazon offers resolver failed", { url: ctx.url, error: err instanceof Error ? err.message : String(err) });
      return { product: {} };
    }
  },
};
