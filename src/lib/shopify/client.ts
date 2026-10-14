import { logger } from "@/lib/logger";
import { isPublicHostname } from "@/features/extraction/stores";

/**
 * A Shopify storefront's own product record: `/products/<handle>.json` (price
 * with currency, variants, grams) and `/products/<handle>.js` (availability
 * and the selected variant's stock). Public on every Shopify shop that has not
 * switched it off; exact where a page read is a guess, and free.
 *
 * Only ever fetched from a public hostname over https, without following
 * redirects, and only the fields below are kept — this is not a proxy.
 */
export interface ShopifyVariant {
  id: number;
  title: string | null;
  price: number | null;
  compare_at_price: number | null;
  currency: string | null;
  grams: number | null;
  available: boolean | null;
  sku: string | null;
  options: string[];
}

export interface ShopifyProduct {
  id: number | null;
  handle: string;
  title: string;
  vendor: string | null;
  product_type: string | null;
  tags: string[];
  description_html: string | null;
  images: string[];
  options: Array<{ name: string; values: string[] }>;
  variants: ShopifyVariant[];
}

const HANDLE = /\/products\/([a-z0-9][a-z0-9-]*)/i;

/** The product handle in a Shopify product URL, or null. Collections paths (`/collections/x/products/y`) count. */
export function shopifyHandleOf(url: string): { origin: string; handle: string } | null {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:" || !isPublicHostname(u.hostname)) return null;
    const handle = u.pathname.match(HANDLE)?.[1];
    return handle ? { origin: u.origin, handle } : null;
  } catch {
    return null;
  }
}

/** `?variant=123` on a Shopify product URL. */
export function shopifyVariantIdOf(url: string): number | null {
  try {
    const v = new URL(url).searchParams.get("variant");
    return v && /^\d{5,}$/.test(v) ? Number(v) : null;
  } catch {
    return null;
  }
}

const MAX_BYTES = 2_000_000;
const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  Accept: "application/json",
};

async function getJson(url: string, timeoutMs: number, signal?: AbortSignal): Promise<unknown | null> {
  const timeout = AbortSignal.timeout(timeoutMs);
  const res = await fetch(url, { headers: HEADERS, redirect: "manual", signal: signal ? AbortSignal.any([signal, timeout]) : timeout });
  if (res.status !== 200) return null;
  if (!/json|javascript/i.test(res.headers.get("content-type") ?? "")) return null;
  const length = Number(res.headers.get("content-length") ?? 0);
  if (length > MAX_BYTES) return null;
  const text = await res.text();
  if (text.length > MAX_BYTES) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

const num = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" ? parseFloat(v) : NaN;
  return Number.isFinite(n) ? n : null;
};
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

function absoluteImage(src: unknown): string | null {
  const s = str(src);
  if (!s) return null;
  return s.startsWith("//") ? `https:${s}` : s;
}

/** `/products/<handle>.json` → product. Prices are "42.00" strings with `price_currency`. */
function fromProductJson(raw: unknown): ShopifyProduct | null {
  const p = (raw as { product?: Record<string, unknown> } | null)?.product;
  if (!p || typeof p !== "object" || !str(p.title) || !Array.isArray(p.variants)) return null;
  const options = Array.isArray(p.options)
    ? (p.options as Array<Record<string, unknown>>).map((o) => ({ name: str(o.name) ?? "Option", values: Array.isArray(o.values) ? (o.values as unknown[]).map(String) : [] }))
    : [];
  return {
    id: num(p.id),
    handle: str(p.handle) ?? "",
    title: str(p.title)!,
    vendor: str(p.vendor),
    product_type: str(p.product_type),
    tags: typeof p.tags === "string" ? p.tags.split(",").map((t) => t.trim()).filter(Boolean) : Array.isArray(p.tags) ? (p.tags as unknown[]).map(String) : [],
    description_html: str(p.body_html),
    images: Array.isArray(p.images) ? (p.images as Array<Record<string, unknown>>).map((i) => absoluteImage(i?.src)).filter((s): s is string => !!s) : [],
    options,
    variants: (p.variants as Array<Record<string, unknown>>).map((v) => ({
      id: num(v.id) ?? 0,
      title: str(v.title),
      price: num(v.price),
      compare_at_price: num(v.compare_at_price),
      currency: str(v.price_currency)?.toUpperCase() ?? null,
      grams: num(v.grams) ?? (num(v.weight) != null && str(v.weight_unit) ? toGrams(num(v.weight)!, str(v.weight_unit)!) : null),
      available: null,
      sku: str(v.sku),
      options: [v.option1, v.option2, v.option3].map(str).filter((s): s is string => !!s),
    })),
  };
}

/** `/products/<handle>.js` → product. Prices are integer cents, no currency; carries `available`. */
function fromProductJs(raw: unknown): ShopifyProduct | null {
  const p = raw as Record<string, unknown> | null;
  if (!p || typeof p !== "object" || !str(p.title) || !Array.isArray(p.variants)) return null;
  const options = Array.isArray(p.options)
    ? (p.options as Array<Record<string, unknown>>).map((o) => ({ name: str(o.name) ?? "Option", values: Array.isArray(o.values) ? (o.values as unknown[]).map(String) : [] }))
    : [];
  return {
    id: num(p.id),
    handle: str(p.handle) ?? "",
    title: str(p.title)!,
    vendor: str(p.vendor),
    product_type: str(p.type),
    tags: Array.isArray(p.tags) ? (p.tags as unknown[]).map(String) : [],
    description_html: str(p.description),
    images: Array.isArray(p.images) ? (p.images as unknown[]).map(absoluteImage).filter((s): s is string => !!s) : [],
    options,
    variants: (p.variants as Array<Record<string, unknown>>).map((v) => ({
      id: num(v.id) ?? 0,
      title: str(v.title),
      price: num(v.price) != null ? num(v.price)! / 100 : null,
      compare_at_price: num(v.compare_at_price) != null ? num(v.compare_at_price)! / 100 : null,
      currency: null,
      // `.js` reports `weight` in grams; `grams` on older themes.
      grams: num(v.grams) ?? num(v.weight),
      available: typeof v.available === "boolean" ? v.available : null,
      sku: str(v.sku),
      options: [v.option1, v.option2, v.option3].map(str).filter((s): s is string => !!s),
    })),
  };
}

function toGrams(weight: number, unit: string): number | null {
  switch (unit.toLowerCase()) {
    case "g": return weight;
    case "kg": return weight * 1000;
    case "lb": return weight * 453.592;
    case "oz": return weight * 28.3495;
    default: return null;
  }
}

/** Both records merged: `.json` for price + currency + grams, `.js` for availability. Null when the store is not Shopify (or has the endpoints off). */
export async function fetchShopifyProduct(url: string, opts: { timeoutMs?: number; signal?: AbortSignal } = {}): Promise<ShopifyProduct | null> {
  const target = shopifyHandleOf(url);
  if (!target) return null;
  const timeoutMs = opts.timeoutMs ?? 4_000;
  const t0 = Date.now();
  try {
    const [json, js] = await Promise.all([
      getJson(`${target.origin}/products/${target.handle}.json`, timeoutMs, opts.signal).then(fromProductJson).catch(() => null),
      getJson(`${target.origin}/products/${target.handle}.js`, timeoutMs, opts.signal).then(fromProductJs).catch(() => null),
    ]);
    const product = json ?? js;
    if (!product) {
      logger.info("shopify: no product record", { host: target.origin, ms: Date.now() - t0 });
      return null;
    }
    if (json && js) {
      const byId = new Map(js.variants.map((v) => [v.id, v]));
      product.variants = json.variants.map((v) => ({ ...v, available: byId.get(v.id)?.available ?? null, price: v.price ?? byId.get(v.id)?.price ?? null }));
      if (product.images.length === 0) product.images = js.images;
    }
    logger.info("shopify: product fetched", { host: target.origin, variants: product.variants.length, ms: Date.now() - t0 });
    return product;
  } catch (err) {
    if (!opts.signal?.aborted) logger.info("shopify: product request failed", { host: target.origin, error: err instanceof Error ? err.message : String(err) });
    return null;
  }
}
