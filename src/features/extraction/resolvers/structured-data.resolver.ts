import * as cheerio from "cheerio";
import type { CheerioAPI } from "cheerio";
import { logger } from "@/lib/logger";
import { parseWeight } from "@/features/pricing/services/weight-parser";
import type { PartialProduct, ExtractionResolver, ResolveContext, ResolverResult } from "./types";

type Node = Record<string, unknown>;

const SYMBOL_CURRENCY: Record<string, string> = { $: "USD", "£": "GBP", "€": "EUR", "¥": "CNY", "US$": "USD" };

function str(v: unknown): string | null {
  if (typeof v === "string" && v.trim()) return v.trim();
  return null;
}

function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v) && v > 0) return v;
  if (typeof v === "string") {
    const n = parseFloat(v.replace(/[^\d.]/g, ""));
    if (Number.isFinite(n) && n > 0) return n;
  }
  return null;
}

function parsePriceText(text: string | null): { price: number | null; currency: string | null } {
  if (!text) return { price: null, currency: null };
  const m = text.match(/(US\$|[£$€¥])\s*([\d,]+(?:\.\d{1,2})?)/);
  if (m?.[1] && m[2]) {
    return { price: parseFloat(m[2].replace(/,/g, "")), currency: SYMBOL_CURRENCY[m[1]] ?? null };
  }
  const code = text.match(/\b(USD|GBP|EUR|CNY)\b\s*([\d,]+(?:\.\d{1,2})?)/i);
  if (code?.[1] && code[2]) {
    return { price: parseFloat(code[2].replace(/,/g, "")), currency: code[1].toUpperCase() };
  }
  return { price: null, currency: null };
}

/** All JSON-LD nodes on the page, flattening @graph arrays. */
export function parseJsonLd($: CheerioAPI): Node[] {
  const nodes: Node[] = [];
  const push = (v: unknown) => {
    if (Array.isArray(v)) return v.forEach(push);
    if (v && typeof v === "object") {
      const n = v as Node;
      nodes.push(n);
      if (Array.isArray(n["@graph"])) n["@graph"].forEach(push);
    }
  };
  $("script[type='application/ld+json']").each((_, el) => {
    const raw = $(el).contents().text();
    if (!raw) return;
    try {
      push(JSON.parse(raw));
    } catch {
      try {
        push(JSON.parse(raw.replace(/[\n\r\t]/g, " ")));
      } catch {
        // ignore malformed block
      }
    }
  });
  return nodes;
}

function isType(n: Node, type: string): boolean {
  const t = n["@type"];
  return t === type || (Array.isArray(t) && t.includes(type));
}

function firstOffer(product: Node): Node | null {
  const offers = product.offers;
  if (!offers || typeof offers !== "object") return null;
  const node = (Array.isArray(offers) ? offers[0] : offers) as Node | undefined;
  if (!node) return null;
  // AggregateOffer nests offers again
  if (isType(node, "AggregateOffer") && node.offers) {
    const inner = Array.isArray(node.offers) ? node.offers[0] : node.offers;
    if (inner && typeof inner === "object") return { ...(inner as Node), priceCurrency: node.priceCurrency ?? (inner as Node).priceCurrency };
    return node;
  }
  return node;
}

/** Product schema.org → partial product. */
export function extractFromJsonLd(nodes: Node[]): PartialProduct {
  const product = nodes.find((n) => isType(n, "Product") || isType(n, "IndividualProduct")) ?? null;
  if (!product) return {};

  const out: PartialProduct = {};
  out.title = str(product.name);
  out.description = str(product.description);

  const img = product.image;
  if (typeof img === "string") out.image = img;
  else if (Array.isArray(img)) {
    const first = img.find((i) => typeof i === "string" || (i && typeof i === "object"));
    out.image = typeof first === "string" ? first : str((first as Node | undefined)?.url);
  } else if (img && typeof img === "object") out.image = str((img as Node).url);

  const brand = product.brand;
  out.brand = typeof brand === "string" ? brand : str((brand as Node | undefined)?.name);

  const offer = firstOffer(product);
  if (offer) {
    out.price = num(offer.price ?? offer.lowPrice);
    const cur = str(offer.priceCurrency);
    out.currency = cur ? cur.toUpperCase() : null;
    if (offer.priceSpecification && typeof offer.priceSpecification === "object") {
      const ps = offer.priceSpecification as Node;
      out.price = out.price ?? num(ps.price);
      out.currency = out.currency ?? str(ps.priceCurrency)?.toUpperCase() ?? null;
    }
  }

  const weight = product.weight;
  if (weight && typeof weight === "object") {
    const w = weight as Node;
    const value = num(w.value);
    const unit = str(w.unitCode ?? w.unitText) ?? "";
    if (value) {
      const unitWord = /KGM|kg/i.test(unit) ? "kg" : /GRM|^g$/i.test(unit) ? "g" : /ONZ|oz/i.test(unit) ? "oz" : "lb";
      out.weight = `${value} ${unitWord}`;
      out.weight_lbs = parseWeight(out.weight);
    }
  } else if (typeof weight === "string") {
    out.weight = weight;
    out.weight_lbs = parseWeight(weight);
  }

  const specs: Record<string, string> = {};
  if (Array.isArray(product.additionalProperty)) {
    for (const p of product.additionalProperty) {
      const n = p as Node;
      const k = str(n.name);
      const v = n.value;
      if (k && v != null) specs[k] = String(v);
    }
  }
  for (const key of ["sku", "mpn", "gtin", "gtin13", "color", "material"] as const) {
    const v = str(product[key]);
    if (v) specs[key.toUpperCase()] = v;
  }
  if (Object.keys(specs).length) out.specifications = specs;

  return out;
}

/** OpenGraph / product meta tags → partial product. */
export function extractFromMeta($: CheerioAPI): PartialProduct {
  const meta = (sel: string) => str($(`meta[property='${sel}'], meta[name='${sel}']`).first().attr("content"));
  const out: PartialProduct = {};

  out.title = meta("og:title") ?? meta("twitter:title") ?? str($("title").first().text());
  out.image = meta("og:image") ?? meta("twitter:image");
  out.description = meta("og:description") ?? meta("description");
  out.brand = meta("product:brand") ?? meta("og:brand");

  const amount = num(meta("product:price:amount") ?? meta("og:price:amount") ?? meta("twitter:data1"));
  const currency = str(meta("product:price:currency") ?? meta("og:price:currency"));
  if (amount) {
    out.price = amount;
    out.currency = currency?.toUpperCase() ?? null;
  }

  // Microdata itemprop fallbacks
  if (!out.price) {
    const priceEl = $("[itemprop='price']").first();
    const p = num(priceEl.attr("content") ?? priceEl.text());
    if (p) {
      out.price = p;
      out.currency = str($("[itemprop='priceCurrency']").first().attr("content"))?.toUpperCase() ?? null;
    }
  }
  if (!out.price) {
    const parsed = parsePriceText(str($("[itemprop='price'], .price, [class*='price']").first().text()));
    if (parsed.price) {
      out.price = parsed.price;
      out.currency = parsed.currency;
    }
  }
  if (!out.title) out.title = str($("[itemprop='name']").first().text()) ?? str($("h1").first().text());

  return out;
}

/**
 * Tier 2 — generic schema.org / OpenGraph parser. Works on any store that
 * publishes structured data, which is most of them. This is what makes adding
 * a new store cheap: a URL/region mapping is enough to get title + price.
 */
export const structuredDataResolver: ExtractionResolver = {
  name: "structured-data",
  defaultConfidence: 0.8,
  available: () => true,
  shouldRun: () => true,
  async resolve(ctx: ResolveContext): Promise<ResolverResult> {
    const page = await ctx.getHtml();
    if (!page) return { product: {} };
    try {
      const $ = cheerio.load(page.html);
      const ld = extractFromJsonLd(parseJsonLd($));
      const og = extractFromMeta($);
      // JSON-LD outranks OG; OG fills gaps.
      const product: PartialProduct = { ...og, ...Object.fromEntries(Object.entries(ld).filter(([, v]) => v != null)) };
      if (product.price != null && !product.currency) product.currency = ctx.scraper.defaultCurrency;
      const confidence: ResolverResult["confidence"] = {};
      for (const k of Object.keys(product) as (keyof PartialProduct)[]) {
        if (ld[k] == null && og[k] != null) confidence[k] = 0.7;
      }
      return { product, confidence };
    } catch (err) {
      logger.warn("structured-data resolver failed", { error: err instanceof Error ? err.message : String(err) });
      return { product: {} };
    }
  },
};
