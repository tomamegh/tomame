import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { EXTRACTION } from "@/config/extraction";

/**
 * Zyte API — automatic (AI) product extraction from any URL, plus rendered
 * HTML. https://docs.zyte.com/zyte-api/usage/extract/index.html
 *
 * Verified live 2026-09-12 with `extractFrom: httpResponseBody`: Amazon 4.8 s,
 * Walmart 3.7 s, Nike 2.4 s, Etsy 17 s, SHEIN 42 s (all complete);
 * Target / Best Buy / Home Depot / AliExpress banned or empty. `browserHtml`
 * extraction was slower and no better on those, so the product tier uses the
 * HTTP source and the browser is only an HTML source for the parsers.
 *
 * Optional tier: skipped when ZYTE_API_KEY is unset.
 */
const EXTRACT = "https://api.zyte.com/v1/extract";

export function isZyteConfigured(): boolean {
  return env.extraction.zyteApiKey !== null;
}

export interface ZyteProduct {
  name?: string;
  /** Strings, e.g. "12.99". */
  price?: string;
  regularPrice?: string;
  currency?: string;
  currencyRaw?: string;
  availability?: string;
  brand?: { name?: string };
  breadcrumbs?: Array<{ name?: string; url?: string }>;
  mainImage?: { url?: string };
  images?: Array<{ url?: string }>;
  description?: string;
  features?: string[];
  additionalProperties?: Array<{ name?: string; value?: string }>;
  size?: string;
  color?: string;
  style?: string;
  sku?: string;
  gtin?: Array<{ type?: string; value?: string }>;
  mpn?: string;
  productId?: string;
  url?: string;
  canonicalUrl?: string;
  metadata?: { probability?: number; dateDownloaded?: string };
  [key: string]: unknown;
}

interface ExtractResponse {
  url?: string;
  statusCode?: number;
  product?: ZyteProduct;
  browserHtml?: string;
  httpResponseBody?: string;
  /** Error envelope (RFC 7807). */
  title?: string;
  detail?: string;
  type?: string;
}

function authHeader(): string | null {
  const key = env.extraction.zyteApiKey;
  return key ? `Basic ${Buffer.from(`${key}:`).toString("base64")}` : null;
}

async function post(body: Record<string, unknown>, timeoutMs: number, label: string, signal?: AbortSignal): Promise<ExtractResponse | null> {
  const auth = authHeader();
  if (!auth) return null;
  const t0 = Date.now();
  const timeout = AbortSignal.timeout(timeoutMs);
  try {
    const res = await fetch(EXTRACT, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: auth },
      body: JSON.stringify(body),
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    });
    const data = (await res.json().catch(() => null)) as ExtractResponse | null;
    if (!res.ok) {
      logger.warn("zyte: request failed", { label, status: res.status, title: data?.title, detail: data?.detail?.slice(0, 200), ms: Date.now() - t0 });
      return null;
    }
    logger.info("zyte: fetched", { label, ms: Date.now() - t0, keys: data ? Object.keys(data) : [] });
    return data;
  } catch (err) {
    if (!signal?.aborted) logger.warn("zyte: exception", { label, error: err instanceof Error ? err.message : String(err), ms: Date.now() - t0 });
    return null;
  }
}

/**
 * Product record for a URL. `probability` is Zyte's own confidence that the
 * page is a product; anything under 0.5 is a category/search/error page.
 */
export async function fetchZyteProduct(
  url: string,
  opts: { extractFrom?: "httpResponseBody" | "browserHtml"; geolocation?: string; signal?: AbortSignal } = {},
): Promise<ZyteProduct | null> {
  const data = await post(
    {
      url,
      product: true,
      productOptions: { extractFrom: opts.extractFrom ?? "httpResponseBody" },
      ...(opts.geolocation ? { geolocation: opts.geolocation } : {}),
    },
    EXTRACTION.zyteProductTimeoutMs,
    "product",
    opts.signal,
  );
  const product = data?.product;
  if (!product?.name) return null;
  const probability = product.metadata?.probability ?? 1;
  if (probability < 0.5) {
    logger.info("zyte: low product probability, ignoring", { url, probability });
    return null;
  }
  return product;
}

/** Browser-rendered HTML — the JS-heavy-store HTML source for the free parsers. */
export async function fetchZyteBrowserHtml(url: string, timeoutMs: number, signal?: AbortSignal): Promise<string | null> {
  const data = await post({ url, browserHtml: true }, timeoutMs, "browserHtml", signal);
  const html = data?.browserHtml;
  return typeof html === "string" && html.length > 500 ? html : null;
}
