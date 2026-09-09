import * as cheerio from "cheerio";
import { logger } from "@/lib/logger";
import type { ExtractionResolver, ResolveContext, ResolverResult } from "./types";

/**
 * Tier 1 — the store-specific Cheerio parser over the fetched page.
 * Highest confidence: selectors written against the real markup.
 */
export const platformHtmlResolver: ExtractionResolver = {
  name: "platform-html",
  defaultConfidence: 0.9,
  needsHtml: true,
  available: () => true,
  shouldRun: () => true,
  async resolve(ctx: ResolveContext): Promise<ResolverResult> {
    const page = await ctx.getHtml();
    if (!page) return { product: {} };
    try {
      const $ = cheerio.load(page.html);
      const product = ctx.scraper.extract($);
      if (product.price != null && !product.currency) product.currency = ctx.scraper.defaultCurrency;
      return { product };
    } catch (err) {
      logger.warn("platform-html resolver failed", {
        platform: ctx.platform,
        error: err instanceof Error ? err.message : String(err),
      });
      return { product: {} };
    }
  },
};
