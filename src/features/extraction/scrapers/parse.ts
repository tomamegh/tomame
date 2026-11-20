import type { Cheerio } from "cheerio";
import type { AnyNode } from "domhandler";

/**
 * Pure parsers for the typed product facts every resolver reports. They turn
 * vendor/page text into numbers and normalized strings and never invent a
 * value: anything they cannot read comes back as null / empty.
 */

/** Elements whose contents are never shown to a shopper. */
const NON_CONTENT = "script, style, noscript, template";

/**
 * The visible text of an element, with `script` / `style` / `noscript` /
 * `template` descendants removed first. Cheerio's `.text()` includes script
 * bodies, which is how Amazon's inline `P.when("A","load").execute(…)` reached
 * a customer's availability line (Ruko 1088, 2026-11-19). Every Cheerio
 * scraper reads element text through this. Never mutates the page.
 */
export function textOf<T extends AnyNode>(el: Cheerio<T>): string {
  if (el.length === 0) return "";
  if (el.find(NON_CONTENT).length === 0) return el.text();
  const copy = el.clone();
  copy.find(NON_CONTENT).remove();
  return copy.text();
}

/** Code, not copy: the shapes a script body or JSON blob has when it leaks into a scraped field. */
const SCRIPT_SHAPES: RegExp[] = [
  /\bfunction\s*\(/,
  /\bP\.when\(/,
  /\bwindow\.[A-Za-z_$]/,
  /\bdocument\.(?:getElement|querySelector|write|cookie)/,
  /=>\s*\{/,
  /\b(?:var|let|const)\s+[A-Za-z_$][\w$]*\s*=/,
  /\.execute\(\s*["']/,
  /\{\s*"[\w-]+"\s*:\s*(?:"|\{|\[|true|false|null|\d)/,
];

/** True when a scraped string is script or JSON rather than shopper-facing text. */
export function looksLikeScript(value: unknown): boolean {
  if (typeof value !== "string" || value.length < 8) return false;
  return SCRIPT_SHAPES.some((re) => re.test(value));
}

const PRICE_SYMBOL_CURRENCY: Record<string, string> = { $: "USD", "US$": "USD", "£": "GBP", "€": "EUR", "¥": "CNY", "GH₵": "GHS", "₵": "GHS" };

export interface ShelfPrice {
  price: number | null;
  currency: string | null;
  /** The text had a decimal separator followed by cents. */
  hasCents: boolean;
}

/**
 * A price as a store prints it: "$83.55", "US$1,299.00", "83,55 $",
 * "EUR 83,55", "1.299,00 €", "$84". The decimal separator is the LAST "." or
 * "," followed by one or two digits; any other separator groups thousands, so
 * "83,55" is 83.55 and never 8355 — the misread behind Ruko's $8,355 quote.
 * Currency from a symbol or ISO code in the text, else null.
 */
export function parseShelfPrice(raw: string | null | undefined): ShelfPrice {
  const none: ShelfPrice = { price: null, currency: null, hasCents: false };
  if (!raw) return none;
  const text = raw.replace(/\u00a0|\u202f/g, " ").trim();
  const m = text.match(/\d[\d.,\s]*\d|\d/);
  if (!m?.[0]) return none;
  const digits = m[0].replace(/\s+/g, "");
  const dec = digits.match(/^(.*)[.,](\d{1,2})$/);
  let value: number;
  let hasCents = false;
  if (dec && dec[1] !== undefined && dec[2] !== undefined) {
    value = parseFloat(`${dec[1].replace(/[.,]/g, "") || "0"}.${dec[2]}`);
    hasCents = true;
  } else {
    value = parseFloat(digits.replace(/[.,]/g, ""));
  }
  if (!Number.isFinite(value) || value <= 0) return none;
  let currency: string | null = null;
  const code = text.match(/\b(USD|GBP|EUR|CNY|GHS|CAD|AUD)\b/i)?.[1];
  if (code) currency = code.toUpperCase();
  else {
    const sym = text.match(/US\$|GH₵|[£$€¥₵]/)?.[0];
    if (sym) currency = PRICE_SYMBOL_CURRENCY[sym] ?? null;
  }
  return { price: Math.round(value * 100) / 100, currency, hasCents };
}

/** Read a JS value as a non-empty trimmed string, or null. */
export function cleanString(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.replace(/\s+/g, " ").trim();
  return t || null;
}

/**
 * "28773 reviews" / "28,773" / "(47)" / "38k" / "1.2K ratings" / 28773 → integer count.
 * Anything without a leading number (or a negative) is null.
 */
export function parseReviewCount(raw: unknown): number | null {
  if (typeof raw === "number") return Number.isFinite(raw) && raw >= 0 ? Math.round(raw) : null;
  if (typeof raw !== "string") return null;
  const m = raw.replace(/\u00a0/g, " ").match(/(\d[\d,]*(?:\.\d+)?)\s*([kKmM])?\b/);
  if (!m?.[1]) return null;
  let n = parseFloat(m[1].replace(/,/g, ""));
  if (!Number.isFinite(n)) return null;
  const suffix = m[2]?.toLowerCase();
  if (suffix === "k") n *= 1_000;
  else if (suffix === "m") n *= 1_000_000;
  return n >= 0 ? Math.round(n) : null;
}

/**
 * The price a customer pays, given a store's current price and its "was" /
 * strike-through / list price. An original BELOW the current price means the
 * vendor swapped them (Zyte read Fashion Nova's sale pages as price 64.99 /
 * regular 44.99, 2026-10-01), so the lower is the price and the higher the
 * original. Every mapper that reads two prices from one response goes through
 * this, so a sale is honoured whichever store or vendor it comes from.
 */
export function salePrice(current: number | null | undefined, original: number | null | undefined): { price: number | null; listPrice: number | null } {
  const c = typeof current === "number" && Number.isFinite(current) && current > 0 ? current : null;
  const o = typeof original === "number" && Number.isFinite(original) && original > 0 ? original : null;
  if (c != null && o != null && o < c) return { price: o, listPrice: c };
  return { price: c, listPrice: o };
}

/**
 * A store's shipping charge for one unit, in the listing's currency.
 * 24 / "24.00" / "$24" → 24; "Free" / "FREE shipping" / 0 → 0; anything else
 * (missing, negative, "See details", NaN) → null, meaning unknown. Never reads
 * a currency: vendors put garbage there (ScraperAPI eBay has returned
 * "delivery in – days"), so the caller prices it in the listing's currency.
 */
export function parseStoreShipping(raw: unknown): number | null {
  if (typeof raw === "number") return Number.isFinite(raw) && raw >= 0 ? Math.round(raw * 100) / 100 : null;
  if (typeof raw !== "string") return null;
  const t = raw.replace(/\u00a0/g, " ").trim();
  if (!t) return null;
  if (/\bfree\b/i.test(t)) return 0;
  const m = t.match(/^[^\d-]{0,4}(\d[\d,]*(?:\.\d{1,2})?)\s*[A-Za-z$£€¥]{0,4}$/);
  if (!m?.[1]) return null;
  const n = parseFloat(m[1].replace(/,/g, ""));
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null;
}

/** Store suffixes page parsers and vendors sometimes keep from <title>: "… | SHEIN USA", "… - Walmart.com". */
const TITLE_STORE_SUFFIX_RE =
  /\s*[|–-]\s*(SHEIN(?: USA)?|eBay|Walmart\.com|Amazon\.com|AliExpress.*|Etsy|Nike\.com|Target)\s*$/i;

/**
 * A product title fit to show: zero-width characters (which leak out of Amazon
 * titles via every vendor) and doubled whitespace removed, the <title> store
 * suffix dropped, the one HTML entity vendors leave behind decoded. Null when
 * nothing is left.
 */
export function cleanTitle(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const out = raw
    .replace(/\u200b|\u200c|\u200d|\ufeff/g, "")
    .replace(TITLE_STORE_SUFFIX_RE, "")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
  return out || null;
}

/**
 * "4.7 out of 5 stars" / "4.7 stars" / "4.7" / 4.7 / "9.2/10" → rating on a
 * 0–5 scale. Explicit phrasings win over a bare number, and a number that is a
 * count ("28,773 ratings", "47 reviews") is never read as the rating. A
 * denominator other than 5 is rescaled; a bare number above 5 is rejected
 * rather than guessed at.
 */
export function parseRating(raw: unknown): number | null {
  if (typeof raw === "number") return Number.isFinite(raw) && raw >= 0 && raw <= 5 ? round1(raw) : null;
  if (typeof raw !== "string") return null;
  const text = raw.replace(/\u00a0/g, " ").replace(/(\d),(\d)(?!\d{2}\b)/g, "$1.$2");

  const outOf = text.match(/(\d+(?:\.\d+)?)\s*(?:out of|\/)\s*(\d+(?:\.\d+)?)/i);
  if (outOf) return scaleRating(parseFloat(outOf[1]!), parseFloat(outOf[2]!));

  const stars = text.match(/(\d(?:\.\d+)?)\s*stars?\b/i);
  if (stars) return scaleRating(parseFloat(stars[1]!), 5);

  // Bare number (thousands groups kept whole): the first one not followed by a count word.
  const numbers = text.matchAll(/(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)(?![\d.,])\s*([a-z]*)/gi);
  for (const m of numbers) {
    if (/^(?:ratings?|reviews?)$/i.test(m[2] ?? "")) continue;
    return scaleRating(parseFloat(m[1]!.replace(/,/g, "")), 5);
  }
  return null;
}

function scaleRating(value: number, denom: number): number | null {
  if (!Number.isFinite(value) || !Number.isFinite(denom) || denom <= 0) return null;
  const scaled = denom === 5 ? value : (value / denom) * 5;
  return scaled >= 0 && scaled <= 5 ? round1(scaled) : null;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

const SCHEMA_CONDITION: Record<string, string> = {
  newcondition: "New",
  usedcondition: "Used",
  refurbishedcondition: "Refurbished",
  damagedcondition: "Damaged",
};

/** schema.org itemCondition ("https://schema.org/UsedCondition", "UsedCondition") → "Used". Other strings pass through trimmed. */
export function parseSchemaCondition(raw: unknown): string | null {
  const s = cleanString(raw);
  if (!s) return null;
  const token = s.split(/[/:#]/).pop()?.toLowerCase() ?? "";
  return SCHEMA_CONDITION[token] ?? s;
}

const SCHEMA_AVAILABILITY: Record<string, string> = {
  instock: "In Stock",
  outofstock: "Out of Stock",
  preorder: "Pre-order",
  presale: "Pre-sale",
  backorder: "Backorder",
  discontinued: "Discontinued",
  soldout: "Sold Out",
  limitedavailability: "Limited Availability",
  instoreonly: "In Store Only",
  onlineonly: "Online Only",
};

/** schema.org availability ("https://schema.org/InStock", "OutOfStock") → "In Stock". Free-text phrases pass through trimmed. */
export function parseSchemaAvailability(raw: unknown): string | null {
  const s = cleanString(raw);
  if (!s) return null;
  const token = s.split(/[/:#]/).pop() ?? "";
  return SCHEMA_AVAILABILITY[token.toLowerCase()] ?? s;
}

/**
 * Ordered, de-duplicated image URLs. Protocol-relative URLs become https;
 * root-relative paths (our own image proxy) are kept; anything else is dropped.
 * When `main` is given it is placed first.
 */
export function normalizeImages(candidates: ReadonlyArray<unknown>, main?: string | null): string[] {
  const out: string[] = [];
  const push = (v: unknown) => {
    const u = normalizeImageUrl(v);
    if (u && !out.includes(u)) out.push(u);
  };
  push(main);
  for (const c of candidates) push(c);
  return out;
}

export function normalizeImageUrl(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  if (!s) return null;
  if (s.startsWith("//")) return `https:${s}`;
  if (/^https?:\/\//i.test(s) || s.startsWith("/")) return s;
  return null;
}

/** "Size Name" / "Colour" / "color_name" → "size" / "color" / "color". Keys for `variants`. */
export function variantKey(name: string): string {
  const k = name
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s*\b(name|options?)\b\s*$/i, "")
    .trim()
    .replace(/\s+/g, "_");
  return k === "colour" ? "color" : k;
}

/** Add an option to a variants map, skipping blanks, placeholders and duplicates. */
export function addVariant(variants: Record<string, string[]>, key: string, value: unknown): void {
  const v = cleanString(value);
  const k = variantKey(key);
  if (!k || !v || /^-?\s*select\b|^choose\b|^please select/i.test(v)) return;
  const list = (variants[k] ??= []);
  if (!list.includes(v)) list.push(v);
}

/** schema.org / Zyte `aggregateRating` → rating (rescaled to 5 when `bestRating` differs) and integer count. */
export function parseAggregateRating(raw: unknown): { rating: number | null; review_count: number | null } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { rating: null, review_count: null };
  const ar = raw as Record<string, unknown>;
  const toNum = (v: unknown): number => (typeof v === "number" ? v : typeof v === "string" ? parseFloat(v.replace(",", ".")) : NaN);
  const best = ar.bestRating == null ? 5 : toNum(ar.bestRating);
  const value = toNum(ar.ratingValue);
  const rating = Number.isFinite(value) && Number.isFinite(best) && best > 0 ? parseRating(best === 5 ? value : (value / best) * 5) : null;
  return { rating, review_count: parseReviewCount(ar.reviewCount ?? ar.ratingCount) };
}

/** First letter upper-cased, underscores to spaces: "in_stock" → "In stock". */
export function humanizeToken(raw: unknown): string | null {
  const s = cleanString(typeof raw === "string" ? raw.replace(/_/g, " ") : raw);
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : null;
}
