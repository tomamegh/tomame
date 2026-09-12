/**
 * Pure parsers for the typed product facts every resolver reports. They turn
 * vendor/page text into numbers and normalized strings and never invent a
 * value: anything they cannot read comes back as null / empty.
 */

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
