import { logger } from "@/lib/logger";
import {
  isApifyConfigured,
  scrapeAmazonWithApify,
  scrapeEbayWithApify,
  scrapeMicrocenterWithApify,
  scrapeSheinWithApify,
} from "@/lib/apify/client";
import { SupportedPlatform } from "../scrapers/registry";
import { mapApifyAmazonProduct } from "../scrapers/amazon";
import { mapApifyEbayProduct } from "../scrapers/ebay";
import { mapApifyMicrocenterProduct } from "../scrapers/microcenter";
import { mapApifySheinProduct } from "../scrapers/shein";
import { hasRequiredFields } from "./merge";
import type { ExtractionResolver, ResolveContext, ResolverResult } from "./types";

/**
 * Tier 4 — Apify community actors. Slow (10–100s) and per-run billed, so it
 * only runs when the page could not be read at all or still lacks a required
 * field, and only when a token is configured.
 */
export const apifyResolver: ExtractionResolver = {
  name: "apify",
  defaultConfidence: 0.85,
  needsHtml: false,
  available: () => isApifyConfigured(),
  shouldRun: (ctx) => !hasRequiredFields(ctx.current),
  async resolve(ctx: ResolveContext): Promise<ResolverResult> {
    if (ctx.deadline - Date.now() < 15_000) return { product: {} };
    try {
      switch (ctx.platform) {
        case SupportedPlatform.AMAZON: {
          const item = await scrapeAmazonWithApify(ctx.url);
          return { product: item ? mapApifyAmazonProduct(item, ctx.url) : {} };
        }
        case SupportedPlatform.EBAY: {
          const item = await scrapeEbayWithApify(ctx.url);
          return { product: item ? mapApifyEbayProduct(item) : {} };
        }
        case SupportedPlatform.SHEIN: {
          const item = await scrapeSheinWithApify(ctx.url);
          return { product: item ? mapApifySheinProduct(item) : {} };
        }
        case SupportedPlatform.MICROCENTER: {
          const item = await scrapeMicrocenterWithApify(ctx.url);
          return { product: item ? mapApifyMicrocenterProduct(item) : {} };
        }
        default:
          return { product: {} };
      }
    } catch (err) {
      logger.error("apify resolver failed", { url: ctx.url, error: err instanceof Error ? err.message : String(err) });
      return { product: {} };
    }
  },
};
