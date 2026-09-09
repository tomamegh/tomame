import type { ExtractionSource } from "@/config/extraction";
import type { SupportedPlatform, PlatformScraper, ScrapedProduct } from "../scrapers";
import type { Region } from "../url";

export type PartialProduct = Partial<ScrapedProduct>;

/** Which HTML source produced the page. */
export type HtmlSource = "direct" | "browserless";

export interface HtmlFetch {
  html: string;
  source: HtmlSource;
}

/**
 * Shared per-extraction context. `getHtml()` is memoized: the first resolver
 * that needs the page pays for the fetch, every later one reuses it.
 */
export interface ResolveContext {
  /** Canonical product URL. */
  url: string;
  platform: SupportedPlatform;
  scraper: PlatformScraper;
  region: Region | null;
  /** Absolute epoch ms after which resolvers should not start new network work. */
  deadline: number;
  getHtml(): Promise<HtmlFetch | null>;
  /** What earlier resolvers already found; lets later tiers target the gaps. */
  current: ScrapedProduct;
}

export interface ResolverResult {
  product: PartialProduct;
  /** 0..1 per field. Missing → default confidence for that resolver. */
  confidence?: Partial<Record<keyof ScrapedProduct, number>>;
  /** Customer-facing notes ("Weight not listed by the store"). */
  messages?: string[];
}

export interface ExtractionResolver {
  readonly name: ExtractionSource;
  /** Default confidence for fields this resolver reports without a per-field score. */
  readonly defaultConfidence: number;
  /** Whether this tier can run right now (key present, platform supported). */
  available(ctx: ResolveContext): boolean;
  /** Should this tier run given what is still missing? Cheap tiers say yes always. */
  shouldRun(ctx: ResolveContext): boolean;
  /** Return whatever was found. MUST NOT throw — return {} on failure. */
  resolve(ctx: ResolveContext): Promise<ResolverResult>;
}

export interface ChainOutcome {
  product: ScrapedProduct;
  /** Per-field confidence of the winning value. */
  confidence: Partial<Record<keyof ScrapedProduct, number>>;
  /** Per-field source of the winning value. */
  fieldSources: Partial<Record<keyof ScrapedProduct, ExtractionSource>>;
  /** Resolvers that ran, in order. */
  ran: ExtractionSource[];
  /** Available resolvers that did not run because the chain stopped early (fast mode / budget). */
  skipped: ExtractionSource[];
  /** Resolver that supplied the title (or the first that supplied anything). */
  primarySource: ExtractionSource | null;
  htmlSource: HtmlSource | null;
  /** The fetched page, so a later enrichment pass does not pay for it again. Not persisted. */
  html: HtmlFetch | null;
  messages: string[];
  durationMs: number;
}
