import type { CheerioAPI } from "cheerio";
import type { HtmlAttemptName, PlatformScraper, ScrapedProduct } from "./types";
import { TomameCategory, AMAZON_CATEGORY_MAP } from "@/config/categories";
import type { ApifyAmazonProduct } from "@/lib/apify/client";
import { parseWeightLbs } from "../weight";
import { amazonAsinOf, canonicalAmazonUrl, defaultCurrencyForUrl } from "../url";
import { addVariant, cleanString, normalizeImages, parseRating, parseReviewCount, parseShelfPrice, textOf } from "./parse";

function text($: CheerioAPI, selector: string): string | null {
  const t = textOf($(selector).first()).trim();
  return t || null;
}

/** First element under `selector` with visible text (Amazon leaves empty `.a-offscreen` spans beside the real one). */
function firstText($: CheerioAPI, selector: string): string | null {
  for (const el of $(selector).toArray()) {
    const t = textOf($(el)).replace(/\s+/g, " ").trim();
    if (t) return t;
  }
  return null;
}

/** The offer block. Prices outside it belong to other products (carousels, bundles, per-unit lines). */
const BUYBOX = ["#corePriceDisplay_desktop_feature_div", "#corePrice_feature_div", "#apex_desktop", "#apex_offerDisplay_desktop", "#buybox"];
const inBuybox = (inner: string) => BUYBOX.map((b) => `${b} ${inner}`).join(", ");

/** One reading of the offer price off the page, and which markup it came from. */
export interface AmazonPagePrice {
  via: string;
  price: number;
  currency: string | null;
  hasCents: boolean;
}

/** `.a-price-whole` + `.a-price-fraction` joined with a decimal point: "83" + "55" → "83.55". */
function wholeFraction($: CheerioAPI): string | null {
  for (const sel of [inBuybox(".priceToPay"), inBuybox(".a-price")]) {
    for (const el of $(sel).toArray()) {
      const $el = $(el);
      if ($el.closest(".pricePerUnit, .a-text-price").length > 0) continue;
      const whole = textOf($el.find(".a-price-whole").first()).replace(/[^\d,]/g, "").replace(/,/g, "");
      const fraction = textOf($el.find(".a-price-fraction").first()).replace(/\D/g, "");
      if (!whole) continue;
      const symbol = textOf($el.find(".a-price-symbol").first()).trim();
      return `${symbol}${whole}${fraction ? `.${fraction}` : ""}`;
    }
  }
  return null;
}

/**
 * Every reading of the offer price the page carries, best first: the
 * buy box's screen-reader price, its accessibility label, the visible
 * whole + fraction, then the hidden twister / attach inputs. The first one
 * that parses is the price; the rest are the same-page cross-check A3 needs.
 */
export function amazonPagePrices($: CheerioAPI): AmazonPagePrice[] {
  const candidates: Array<[via: string, raw: string | null | undefined]> = [
    ["offscreen", firstText($, inBuybox(".priceToPay .a-offscreen"))],
    ["accessibility-label", firstText($, "#apex-pricetopay-accessibility-label, .apex-pricetopay-accessibility-label")],
    ["core-offscreen", firstText($, inBuybox(".a-price:not(.a-text-price) .a-offscreen"))],
    ["priceblock", firstText($, "#priceblock_ourprice, #priceblock_dealprice, #price_inside_buybox, #newBuyBoxPrice")],
    ["whole-fraction", wholeFraction($)],
    ["twister", $("#twister-plus-price-data-price").attr("value")],
    ["attach", $("#attach-base-product-price").attr("value")],
  ];
  const out: AmazonPagePrice[] = [];
  for (const [via, raw] of candidates) {
    const parsed = parseShelfPrice(raw);
    if (parsed.price != null) out.push({ via, price: parsed.price, currency: parsed.currency, hasCents: parsed.hasCents });
  }
  return out;
}

/**
 * The offer price. A reading with no decimal separator is refused when the
 * page renders cents (`.a-price-fraction` in the buy box): "8355" off a page
 * that shows $83.55 is a parse error, not a price.
 */
function extractPrice($: CheerioAPI, reads: AmazonPagePrice[]): { price: number | null; currency: string | null; via: string | null } {
  const rendersCents = $(inBuybox(".a-price-fraction")).length > 0;
  const shown = reads.find((r) => r.via !== "twister" && r.via !== "attach" && (r.hasCents || !rendersCents));
  if (!shown) return { price: null, currency: null, via: null };
  const currency = shown.currency ?? reads.find((r) => r.currency)?.currency ?? null;
  return { price: shown.price, currency, via: shown.via };
}

/** Amazon's text when the page was served to a delivery location outside the store's country. */
const GEO_BLOCK_RE = /cannot be shipped to your selected delivery location|doesn't ship to|does not ship to|not available for shipping to your/i;

function pageText($: CheerioAPI, selector: string): string {
  return $(selector).toArray().map((el) => textOf($(el))).join(" ").replace(/\s+/g, " ").trim();
}

/** Offer-level facts that make a page price unsafe to quote as is (A0). */
function extractPriceFlags($: CheerioAPI): string[] {
  const flags: string[] = [];
  const activeRow = $(".a-accordion-active, .a-accordion-row-a11y[aria-expanded='true']").toArray().map((el) => $(el).attr("id") ?? "").join(" ");
  if (/sns|subscribe/i.test(activeRow) || /subscribe\s*&?\s*save/i.test(pageText($, inBuybox(".priceToPay")))) flags.push("subscribe_and_save");
  if (/coupon/i.test(pageText($, "#promoPriceBlockMessage_feature_div, #couponBadgeRegularVpc, [id^='couponText'], #vpcButton"))) flags.push("coupon");
  if ($("#usedOnlyBuybox, #usedBuySection").length > 0 && $("#newAccordionRow, #qualifiedBuybox, #newOfferAccordionRow").length === 0) flags.push("used_offer");
  else if (/used/i.test(activeRow)) flags.push("used_offer");
  return flags;
}

/** "Limited time deal", "Lightning Deal" — a price that may not survive until we buy. */
function extractDeal($: CheerioAPI): string | null {
  const t = pageText($, "#dealBadge_feature_div, #dealBadgeSupportingText, [id^='lightningDeal']");
  const m = t.match(/lightning deal|limited time deal|deal ends in[^.]*|prime (?:big|day) deal/i);
  return m ? m[0] : null;
}

/** "Renewed" / "Refurbished" / "Used", when the page says so; null when it does not. */
function extractCondition($: CheerioAPI, title: string | null, flags: string[]): string | null {
  if (title && /\((?:renewed|refurbished)\)|\bamazon renewed\b|\brenewed premium\b/i.test(title)) return /refurbished/i.test(title) ? "Refurbished" : "Renewed";
  if (/\bAmazon Renewed\b|\bRenewed Premium\b/i.test(pageText($, "#renewedProgramDescriptionAtf_feature_div, #renewedSingleOfferCaption_feature_div, #bylineInfo"))) return "Renewed";
  if (flags.includes("used_offer")) return "Used";
  return null;
}

function extractMainImage($: CheerioAPI): string | null {
  const img = $("#landingImage").attr("data-old-hires")
    ?? $("#landingImage").attr("src")
    ?? $("#imgBlkFront").attr("src");
  return img ?? null;
}

function extractAllImages($: CheerioAPI): string[] {
  const images: string[] = [];

  $("script").each((_, el) => {
    const scriptText = $(el).html() ?? "";
    const hiResMatches = scriptText.matchAll(/"hiRes"\s*:\s*"(https?:\/\/[^"]+)"/g);
    for (const m of hiResMatches) {
      if (m[1] && !images.includes(m[1])) images.push(m[1]);
    }
    if (images.length === 0) {
      const largeMatches = scriptText.matchAll(/"large"\s*:\s*"(https?:\/\/[^"]+)"/g);
      for (const m of largeMatches) {
        if (m[1] && !images.includes(m[1])) images.push(m[1]);
      }
    }
  });

  if (images.length === 0) {
    $("#altImages .a-button-thumbnail img").each((_, el) => {
      const src = $(el).attr("src");
      if (src) {
        const large = src.replace(/\._[A-Z0-9_,]+_\./, ".");
        if (!images.includes(large)) images.push(large);
      }
    });
  }

  return images;
}

function extractSelectedSize($: CheerioAPI): string | null {
  const selected = text($, "#native_dropdown_selected_size_name option[selected]");
  if (selected && selected !== "Select") return selected;
  const swatchSelected = textOf($(".swatchSelect .a-button-text").first()).trim();
  if (swatchSelected) return swatchSelected;
  return null;
}

function extractAvailableSizes($: CheerioAPI): string[] {
  const sizes: string[] = [];
  $("#native_dropdown_selected_size_name option").each((_, el) => {
    const val = textOf($(el)).trim();
    if (val && val !== "Select") sizes.push(val);
  });
  if (sizes.length === 0) {
    $("#variation_size_name .a-button-text").each((_, el) => {
      const val = textOf($(el)).trim();
      if (val) sizes.push(val);
    });
  }
  return sizes;
}

/** Colour swatches: <li title="Click to select Black"><img alt="Black"></li>. */
function extractAvailableColors($: CheerioAPI): string[] {
  const colors: string[] = [];
  $("#variation_color_name li").each((_, el) => {
    const alt = $(el).find("img").first().attr("alt")?.trim();
    const title = $(el).attr("title")?.replace(/^Click to select\s+/i, "").trim();
    const val = alt || title;
    if (val && !colors.includes(val)) colors.push(val);
  });
  return colors;
}

function extractSeller($: CheerioAPI): string | null {
  return text($, "#sellerProfileTriggerId") ?? text($, "#merchant-info a") ?? null;
}

/**
 * The stock phrase ("In Stock", "Only 2 left in stock - order soon.").
 * Script-free, and never Amazon's "cannot be shipped to your selected delivery
 * location": that is about the fetch's location, not the item's stock.
 */
function extractAvailability($: CheerioAPI): string | null {
  const phrase = cleanString(
    firstText($, "#availability .primary-availability-message") ?? firstText($, "#availability span") ?? text($, "#availability"),
  );
  if (!phrase || GEO_BLOCK_RE.test(phrase)) return null;
  return phrase;
}

/** True when Amazon served this page to a delivery location it will not ship to. */
function extractGeoBlocked($: CheerioAPI): boolean {
  return GEO_BLOCK_RE.test(pageText($, "#availability, #deliveryBlockMessage, #exports_desktop_undeliverable_buybox, #outOfStock, #buybox"));
}

function extractRating($: CheerioAPI): number | null {
  return parseRating(text($, "#acrPopover .a-icon-alt") ?? $("#acrPopover").attr("title") ?? null);
}

function extractReviewCount($: CheerioAPI): number | null {
  return parseReviewCount($("#acrCustomerReviewText").first().attr("aria-label") ?? text($, "#acrCustomerReviewText"));
}

function extractSpecifications($: CheerioAPI): Record<string, string> {
  const specs: Record<string, string> = {};

  $("table.a-normal tr").each((_, el) => {
    const key = textOf($(el).find("td.a-span3 .a-text-bold")).trim().replace(/\s+/g, " ");
    const value = textOf($(el).find("td.a-span9 .po-break-word")).trim().replace(/\s+/g, " ");
    if (key && value) specs[key] = value;
  });

  $("#productDetails_techSpec_section_1 tr, #productDetails_detailBullets_sections1 tr").each((_, el) => {
    const key = textOf($(el).find("th")).trim().replace(/\s+/g, " ");
    const value = textOf($(el).find("td")).trim().replace(/\s+/g, " ");
    if (key && value && !specs[key]) specs[key] = value;
  });

  $("#productDetails_techSpec_section_2 tr").each((_, el) => {
    const key = textOf($(el).find("th")).trim().replace(/\s+/g, " ");
    const value = textOf($(el).find("td")).trim().replace(/\s+/g, " ");
    if (key && value && !specs[key]) specs[key] = value;
  });

  $("#detailBullets_feature_div .a-list-item").each((_, el) => {
    const parts = textOf($(el)).trim().split(/\s*:\s*/);
    if (parts.length >= 2) {
      const key = (parts[0] ?? "").replace(/[^\w\s]/g, "").trim();
      const value = parts.slice(1).join(":").trim();
      if (key && value && !specs[key]) specs[key] = value;
    }
  });

  return specs;
}

function extractDescription($: CheerioAPI): string | null {
  const bullets: string[] = [];
  $("#feature-bullets .a-list-item").each((_, el) => {
    const t = textOf($(el)).trim();
    if (t) bullets.push(t);
  });
  if (bullets.length > 0) return bullets.join("\n");
  return text($, "#productDescription p") ?? text($, "#productDescription");
}

function extractBrand($: CheerioAPI): string | null {
  return text($, "#bylineInfo") ?? text($, "a#brand") ?? null;
}

function extractCategory($: CheerioAPI): TomameCategory | null {
  const breadcrumbSelectors = [
    "#wayfinding-breadcrumbs_feature_div ul li:first-child a",
    "#wayfinding-breadcrumbs_feature_div ul li a",
    ".a-breadcrumb li:first-child a",
    "#nav-subnav .nav-a:first-child",
  ];

  for (const selector of breadcrumbSelectors) {
    const els = $(selector);
    for (let i = 0; i < els.length; i++) {
      const crumb = textOf(els.eq(i)).trim();
      if (!crumb) continue;
      const mapped = AMAZON_CATEGORY_MAP.get(crumb);
      if (mapped) return mapped;
    }
  }

  const deptText = textOf($("#searchDropdownBox option[selected]")).trim();
  if (deptText) {
    const mapped = AMAZON_CATEGORY_MAP.get(deptText);
    if (mapped) return mapped;
  }

  return null;
}

function extractWeight(specs: Record<string, string>): string | null {
  for (const key of Object.keys(specs)) {
    if (/weight/i.test(key)) return specs[key] ?? null;
  }
  return null;
}

function extractDimensions(specs: Record<string, string>): string | null {
  for (const key of Object.keys(specs)) {
    if (/dimension/i.test(key)) return specs[key] ?? null;
  }
  return null;
}

export function mapApifyAmazonProduct(item: ApifyAmazonProduct, sourceUrl: string): ScrapedProduct {
  const price = item.price ?? null;
  const currency = defaultCurrencyForUrl(sourceUrl);

  const specs: Record<string, string> = {};
  if (item.productDetails) {
    for (const detail of item.productDetails) {
      if (detail.name && detail.value) specs[detail.name] = detail.value;
    }
  }

  let brand: string | null = specs["Brand"] ?? null;
  if (!brand && item.manufacturer) {
    const match = item.manufacturer.match(/(?:Visit the |Brand:\s*)(.+?)(?:\s+Store)?$/i);
    brand = match?.[1]?.trim() ?? item.manufacturer;
  }

  let category: TomameCategory | null = null;
  if (item.breadcrumbs && item.breadcrumbs.length > 0) {
    for (const crumb of item.breadcrumbs) {
      if (crumb.text) {
        const mapped = AMAZON_CATEGORY_MAP.get(crumb.text);
        if (mapped) { category = mapped; break; }
      }
    }
  }
  if (!category) {
    const bsr = specs["Best Sellers Rank"];
    if (bsr) {
      for (const [key, mapped] of AMAZON_CATEGORY_MAP) {
        if (bsr.includes(key)) { category = mapped; break; }
      }
    }
  }

  const rawImages = item.imageUrlList ?? [];
  const images = normalizeImages(rawImages);

  return {
    title: item.title ?? null,
    image: images[0] ?? null,
    price,
    currency,
    description: item.features?.join("\n") ?? item.productDescription ?? null,
    brand,
    category,
    size: specs["Size Name"] ?? null,
    weight: extractWeight(specs),
    weight_lbs: parseWeightLbs(extractWeight(specs)),
    dimensions: extractDimensions(specs),
    specifications: specs,
    seller: cleanString(item.soldBy),
    condition: null,
    rating: parseRating(item.productRating),
    review_count: parseReviewCount(item.countReview),
    images,
    variants: {},
    availability: cleanString(item.warehouseAvailability),
    store_shipping: null,
    metadata: {
      images: rawImages,
      availableSizes: [],
      asin: item.asin ?? specs["ASIN"] ?? null,
      rating: item.productRating ?? null,
      reviewCount: item.countReview != null ? `${item.countReview} ratings` : null,
      source: "apify",
    },
  };
}

export class AmazonScraper implements PlatformScraper {
  public readonly domains = ["amazon.com", "amazon.co.uk", "a.co", "amzn.to", "amzn.eu"];
  public readonly defaultCurrency = "USD";
  public readonly renderWaitSelector = "#productTitle, #ASIN";
  /**
   * The page fallback when every structured tier failed. It used to be direct →
   * Zyte browser → Browserless: free-tier vendors that run dry, and that read
   * Amazon from outside the US ("cannot be shipped to your selected delivery
   * location"). ScraperAPI's paid proxy with `country_code=us` (1 credit, then
   * premium at 10) is the path that stays up.
   */
  public readonly htmlAttempts: HtmlAttemptName[] = ["direct", "scraperapi", "zyte-browser", "scraperapi-premium"];

  public isProductUrl(url: string): boolean {
    return amazonAsinOf(url) !== null;
  }

  public canonicalUrl(raw: string): string {
    try {
      const u = new URL(raw);
      return canonicalAmazonUrl(raw) ?? `${u.origin}${u.pathname}`;
    } catch {
      return raw;
    }
  }

  public looksLikeProductPage(html: string): boolean {
    if (/api-services-support@amazon\.com|Robot Check|captcha/i.test(html) && !html.includes("productTitle")) {
      return false;
    }
    // Amazon serves datacenter IPs a page with the title but no offer block.
    // Without a price marker, treat it as not rendered so the chain refetches.
    return html.includes("productTitle") && /a-offscreen|a-price|priceToPay|priceblock_/.test(html);
  }

  public extract($: CheerioAPI): ScrapedProduct {
    const pagePrices = amazonPagePrices($);
    const { price, currency, via } = extractPrice($, pagePrices);
    const title = text($, "#productTitle");
    const priceFlags = extractPriceFlags($);
    const specifications = extractSpecifications($);
    const allImages = extractAllImages($);
    const availableSizes = extractAvailableSizes($);
    const mainImage = extractMainImage($);
    const images = normalizeImages(allImages, mainImage);
    const variants: Record<string, string[]> = {};
    for (const s of availableSizes) addVariant(variants, "size", s);
    for (const c of extractAvailableColors($)) addVariant(variants, "color", c);

    return {
      title,
      image: mainImage,
      price,
      currency,
      description: extractDescription($),
      brand: extractBrand($),
      category: extractCategory($),
      size: extractSelectedSize($),
      weight: extractWeight(specifications),
      weight_lbs: parseWeightLbs(extractWeight(specifications)),
      dimensions: extractDimensions(specifications),
      specifications,
      seller: extractSeller($),
      condition: extractCondition($, title, priceFlags),
      rating: extractRating($),
      review_count: extractReviewCount($),
      images,
      variants,
      availability: extractAvailability($),
      store_shipping: null,
      metadata: {
        images: allImages,
        availableSizes,
        asin: $("input#ASIN").val() ?? null,
        rating: text($, "#acrPopover .a-icon-alt"),
        reviewCount: text($, "#acrCustomerReviewText"),
        // Same-page price readings, for the HTML price guard (price-confidence.ts).
        pagePrices: pagePrices.map((p) => ({ via: p.via, price: p.price, currency: p.currency })),
        priceVia: via,
        priceFlags,
        deal: extractDeal($),
        geoBlocked: extractGeoBlocked($),
      },
    };
  }
}

export const amazonScraper = new AmazonScraper();
