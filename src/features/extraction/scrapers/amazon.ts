import type { CheerioAPI } from "cheerio";
import type { PlatformScraper, ScrapedProduct } from "./types";

function text($: CheerioAPI, selector: string): string | null {
  const el = $(selector).first();
  const t = el.text().trim();
  return t || null;
}

function extractPrice($: CheerioAPI): { price: number | null; currency: string | null } {
  // Amazon renders price in .a-price .a-offscreen (most reliable)
  const priceText =
    text($, "#corePrice_feature_div .a-offscreen") ??
    text($, "#priceblock_ourprice") ??
    text($, "#priceblock_dealprice") ??
    text($, ".a-price .a-offscreen");

  if (!priceText) return { price: null, currency: null };

  // Parse currency symbol and amount (e.g. "$29.99", "£14.50")
  const match = priceText.match(/([£$€¥])\s*([\d,]+\.?\d*)/);
  if (!match) {
    const numMatch = priceText.match(/([\d,]+\.?\d*)/);
    return {
      price: numMatch?.[1] ? parseFloat(numMatch[1].replace(/,/g, "")) : null,
      currency: null,
    };
  }

  const symbol = match[1] ?? "";
  const symbolMap: Record<string, string> = { $: "USD", "£": "GBP", "€": "EUR", "¥": "CNY" };
  return {
    price: parseFloat((match[2] ?? "0").replace(/,/g, "")),
    currency: symbolMap[symbol] ?? null,
  };
}

function extractMainImage($: CheerioAPI): string | null {
  // Amazon's main image is in #landingImage or #imgBlkFront
  const img = $("#landingImage").attr("data-old-hires")
    ?? $("#landingImage").attr("src")
    ?? $("#imgBlkFront").attr("src");
  return img ?? null;
}

function extractAllImages($: CheerioAPI): string[] {
  const images: string[] = [];

  // Amazon stores hi-res images in a script block as colorImages or imageGalleryData
  $("script").each((_, el) => {
    const scriptText = $(el).html() ?? "";
    // Match hiRes URLs from the colorImages/imageGalleryData JSON
    const hiResMatches = scriptText.matchAll(/"hiRes"\s*:\s*"(https?:\/\/[^"]+)"/g);
    for (const m of hiResMatches) {
      if (m[1] && !images.includes(m[1])) images.push(m[1]);
    }
    // Fallback to large URLs
    if (images.length === 0) {
      const largeMatches = scriptText.matchAll(/"large"\s*:\s*"(https?:\/\/[^"]+)"/g);
      for (const m of largeMatches) {
        if (m[1] && !images.includes(m[1])) images.push(m[1]);
      }
    }
  });

  // Fallback: thumbnail strip
  if (images.length === 0) {
    $("#altImages .a-button-thumbnail img").each((_, el) => {
      const src = $(el).attr("src");
      if (src) {
        // Swap thumbnail suffix for large image
        const large = src.replace(/\._[A-Z0-9_,]+_\./, ".");
        if (!images.includes(large)) images.push(large);
      }
    });
  }

  return images;
}

function extractSelectedSize($: CheerioAPI): string | null {
  // The selected size has class .swatchSelect or native dropdown
  const selected = text($, "#native_dropdown_selected_size_name option[selected]");
  if (selected && selected !== "Select") return selected;

  const swatchSelected = $(".swatchSelect .a-button-text").first().text().trim();
  if (swatchSelected) return swatchSelected;

  return null;
}

function extractAvailableSizes($: CheerioAPI): string[] {
  const sizes: string[] = [];

  // From native dropdown
  $("#native_dropdown_selected_size_name option").each((_, el) => {
    const val = $(el).text().trim();
    if (val && val !== "Select") sizes.push(val);
  });

  // From swatch buttons
  if (sizes.length === 0) {
    $("#variation_size_name .a-button-text").each((_, el) => {
      const val = $(el).text().trim();
      if (val) sizes.push(val);
    });
  }

  return sizes;
}

function extractSpecifications($: CheerioAPI): Record<string, string> {
  const specs: Record<string, string> = {};

  // Product overview table (table.a-normal with po-break-word spans)
  $("table.a-normal tr").each((_, el) => {
    const key = $(el).find("td.a-span3 .a-text-bold").text().trim().replace(/\s+/g, " ");
    const value = $(el).find("td.a-span9 .po-break-word").text().trim().replace(/\s+/g, " ");
    if (key && value) specs[key] = value;
  });

  // Product details table (#productDetails_techSpec_section_1)
  $("#productDetails_techSpec_section_1 tr, #productDetails_detailBullets_sections1 tr").each((_, el) => {
    const key = $(el).find("th").text().trim().replace(/\s+/g, " ");
    const value = $(el).find("td").text().trim().replace(/\s+/g, " ");
    if (key && value && !specs[key]) specs[key] = value;
  });

  // Technical details table
  $("#productDetails_techSpec_section_2 tr").each((_, el) => {
    const key = $(el).find("th").text().trim().replace(/\s+/g, " ");
    const value = $(el).find("td").text().trim().replace(/\s+/g, " ");
    if (key && value && !specs[key]) specs[key] = value;
  });

  // Detail bullets (the ul/li format Amazon sometimes uses)
  $("#detailBullets_feature_div .a-list-item").each((_, el) => {
    const parts = $(el).text().trim().split(/\s*:\s*/);
    if (parts.length >= 2) {
      const key = (parts[0] ?? "").replace(/[^\w\s]/g, "").trim();
      const value = parts.slice(1).join(":").trim();
      if (key && value && !specs[key]) specs[key] = value;
    }
  });

  return specs;
}

function extractDescription($: CheerioAPI): string | null {
  // "About this item" bullet points
  const bullets: string[] = [];
  $("#feature-bullets .a-list-item").each((_, el) => {
    const t = $(el).text().trim();
    if (t) bullets.push(t);
  });
  if (bullets.length > 0) return bullets.join("\n");

  // Product description block
  const desc = text($, "#productDescription p") ?? text($, "#productDescription");
  return desc;
}

function extractBrand($: CheerioAPI): string | null {
  return (
    text($, "#bylineInfo") ??
    text($, "a#brand") ??
    null
  );
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

export const amazonScraper: PlatformScraper = {
  domains: [
    "amazon.com",
    "amazon.co.uk",
    "amazon.ca",
    "amazon.de",
    "amazon.fr",
    "amazon.es",
    "amazon.it",
    "amazon.com.au",
    "amazon.in",
    "amazon.co.jp",
  ],

  extract($: CheerioAPI): ScrapedProduct {
    const { price, currency } = extractPrice($);
    const specifications = extractSpecifications($);
    const allImages = extractAllImages($);
    const availableSizes = extractAvailableSizes($);

    return {
      title: text($, "#productTitle"),
      image: extractMainImage($),
      price,
      currency,
      description: extractDescription($),
      brand: extractBrand($),
      size: extractSelectedSize($),
      weight: extractWeight(specifications),
      dimensions: extractDimensions(specifications),
      specifications,
      metadata: {
        images: allImages,
        availableSizes,
        asin: $("input#ASIN").val() ?? null,
        rating: text($, "#acrPopover .a-icon-alt"),
        reviewCount: text($, "#acrCustomerReviewText"),
      },
    };
  },
};
