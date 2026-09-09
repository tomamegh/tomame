import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import * as cheerio from "cheerio";
import { z } from "zod";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { EXTRACTION } from "@/config/extraction";
import { TomameCategory } from "@/config/categories";
import { parseWeight } from "@/features/pricing/services/weight-parser";
import { hasRequiredFields, hasWeight, missingFields } from "./merge";
import type { ExtractionResolver, PartialProduct, ResolveContext, ResolverResult } from "./types";

const CATEGORY_VALUES = Object.values(TomameCategory) as [string, ...string[]];

const ProductSchema = z.object({
  title: z.string().nullable().describe("Full product title as shown on the page. null if not a product page."),
  price: z.number().nullable().describe("Current selling price as a plain number, for the selected/default variant. Not the list/strike-through price."),
  currency: z.string().nullable().describe("ISO 4217 code for the price, e.g. USD, GBP."),
  image_url: z.string().nullable().describe("Absolute URL of the main product image."),
  brand: z.string().nullable(),
  category: z.enum(CATEGORY_VALUES).nullable().describe("Closest Tomame category for this product."),
  weight_text: z.string().nullable().describe("Item weight exactly as listed (e.g. '1.2 pounds', '540 g'). Item weight, not shipping/package weight, unless only that is available."),
  dimensions_text: z.string().nullable().describe("Product dimensions as listed."),
  condition: z.string().nullable().describe("New, Used, Refurbished, etc. when stated."),
  is_product_page: z.boolean().describe("false if the text is a captcha, error, search results, or category listing."),
});

let client: Anthropic | null = null;
function getClient(): Anthropic | null {
  const key = env.extraction.anthropicApiKey;
  if (!key) return null;
  if (!client) client = new Anthropic({ apiKey: key, timeout: EXTRACTION.llmTimeoutMs, maxRetries: 1 });
  return client;
}

/**
 * Reduce a product page to the text a reader would see plus its structured
 * data blocks. Scripts, styles, nav, footers and hidden SVG are dropped;
 * whitespace is collapsed. Capped so a single call has a bounded cost.
 */
export function pageToText(html: string, maxChars: number = EXTRACTION.llmMaxInputChars): string {
  const $ = cheerio.load(html);
  const jsonLd: string[] = [];
  $("script[type='application/ld+json']").each((_, el) => {
    const t = $(el).contents().text().trim();
    if (t) jsonLd.push(t.slice(0, 8_000));
  });
  const metas: string[] = [];
  $("meta[property^='og:'], meta[property^='product:'], meta[name='description']").each((_, el) => {
    const p = $(el).attr("property") ?? $(el).attr("name");
    const c = $(el).attr("content");
    if (p && c) metas.push(`${p}: ${c}`);
  });
  $("script, style, noscript, svg, iframe, nav, footer, header, form, button, [aria-hidden='true']").remove();
  const body = $("body").text().replace(/[ \t\u00a0]+/g, " ").replace(/\s*\n\s*/g, "\n").trim();

  const parts = [
    metas.length ? `META TAGS:\n${metas.join("\n")}` : "",
    jsonLd.length ? `JSON-LD:\n${jsonLd.join("\n")}` : "",
    `PAGE TEXT:\n${body}`,
  ].filter(Boolean);
  return parts.join("\n\n").slice(0, maxChars);
}

/**
 * Tier 3 — Claude reads the page text against a strict schema. Runs only when
 * the cheaper tiers left a required field or the weight empty. Also the
 * durable answer to "Item Weight: 1.2 lb" buried in an arbitrary spec table.
 */
export const llmResolver: ExtractionResolver = {
  name: "llm",
  defaultConfidence: 0.6,
  needsHtml: false,
  available: () => env.extraction.anthropicApiKey !== null,
  shouldRun: (ctx) => !hasRequiredFields(ctx.current) || !hasWeight(ctx.current) || !ctx.current.category,
  async resolve(ctx: ResolveContext): Promise<ResolverResult> {
    const anthropic = getClient();
    if (!anthropic) return { product: {} };
    if (ctx.deadline - Date.now() < 8_000) return { product: {} };

    // Text-only mode: a structured tier already gave us the listing but not the
    // category/weight, and the page has not been fetched. Classify from what we
    // have rather than launching a browser for it.
    const textOnly = ctx.htmlState() === "unfetched" && hasRequiredFields(ctx.current);
    let text: string;
    if (textOnly) {
      const c = ctx.current;
      text = [
        `Title: ${c.title}`,
        c.brand ? `Brand: ${c.brand}` : "",
        c.price != null ? `Price: ${c.price} ${c.currency ?? ""}` : "",
        c.description ? `Description: ${c.description.slice(0, 2_000)}` : "",
        Object.keys(c.specifications).length ? `Specifications:\n${Object.entries(c.specifications).map(([k, v]) => `${k}: ${v}`).join("\n")}` : "",
      ].filter(Boolean).join("\n");
    } else {
      const page = await ctx.getHtml();
      if (!page) return { product: {} };
      text = pageToText(page.html);
    }
    const gaps = missingFields(ctx.current);
    const known = Object.entries(ctx.current)
      .filter(([k, v]) => v != null && !["specifications", "metadata", "description"].includes(k))
      .map(([k, v]) => `${k}: ${String(v)}`)
      .join("\n");

    try {
      const response = await anthropic.messages.parse({
        model: EXTRACTION.llmModel,
        max_tokens: 2_000,
        output_config: { effort: "low", format: zodOutputFormat(ProductSchema) },
        system:
          "You extract structured product data from e-commerce page text for a shipping-quote system. " +
          "Report only what the page states; use null for anything not present. Never invent a price or weight. " +
          "Prices: use the current selling price of the shown/selected variant, not a crossed-out list price, " +
          "and not a monthly installment amount.",
        messages: [
          {
            role: "user",
            content:
              `Store: ${ctx.platform}\nURL: ${ctx.url}\n` +
              (known ? `Already known (verify, correct only if clearly wrong):\n${known}\n` : "") +
              `Fields still missing: ${gaps.join(", ") || "none"}\n\n` +
              `<page>\n${text}\n</page>`,
          },
        ],
      });

      if (response.stop_reason === "refusal") {
        logger.warn("llm resolver: refusal", { url: ctx.url, category: response.stop_details?.category ?? null });
        return { product: {} };
      }
      const parsed = response.parsed_output;
      if (!parsed || !parsed.is_product_page) return { product: {}, messages: parsed ? ["The page did not look like a product page."] : [] };

      const product: PartialProduct = {
        title: parsed.title,
        price: parsed.price,
        currency: parsed.currency?.toUpperCase() ?? (parsed.price != null ? ctx.scraper.defaultCurrency : null),
        image: parsed.image_url,
        brand: parsed.brand,
        category: (parsed.category as TomameCategory | null) ?? null,
        weight: parsed.weight_text,
        weight_lbs: parseWeight(parsed.weight_text),
        dimensions: parsed.dimensions_text,
        metadata: {
          ...(parsed.condition ? { condition: parsed.condition } : {}),
          llm_usage: { input: response.usage.input_tokens, output: response.usage.output_tokens },
        },
      };
      logger.info("llm resolver: extracted", {
        url: ctx.url,
        mode: textOnly ? "text-only" : "page",
        filled: Object.entries(product).filter(([, v]) => v != null).map(([k]) => k),
        input_tokens: response.usage.input_tokens,
      });
      return { product };
    } catch (err) {
      if (err instanceof Anthropic.RateLimitError) {
        logger.warn("llm resolver: rate limited", { url: ctx.url });
      } else if (err instanceof Anthropic.APIError) {
        logger.error("llm resolver: api error", { url: ctx.url, status: err.status, error: err.message });
      } else {
        logger.error("llm resolver: failed", { url: ctx.url, error: err instanceof Error ? err.message : String(err) });
      }
      return { product: {} };
    }
  },
};
