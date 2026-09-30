import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { FREIGHT_INSPECTOR } from "@/config/freight-inspector";
import { TomameCategory } from "@/config/categories/tomame_category";
import { fixedFreightCategoryAllows, type PricingBreakdown, type PricingCalculator } from "@/lib/pricing";
import { priceExtractionWith } from "@/features/extraction/quote.service";
import type { ExtractionResult } from "@/features/extraction/types";
import { loadPricingCalculator } from "./pricing.service";
import {
  freightInspectionKey,
  type FreightCorrections,
  type FreightDecision,
  type FreightInspection,
  type FreightInspectionStatus,
} from "../freight-inspection";

/**
 * FREIGHT INSPECTOR — a pricing-accuracy guard.
 *
 * Once per product, at extraction time, Haiku looks at the calculator's freight
 * decision next to the product facts and says whether it is plausible. When it
 * is not, it may correct the calculator's INPUTS only — category, weight_lbs,
 * fixed-freight item — each checked against the set we offered. It never
 * outputs money: the normal calculator prices the corrected inputs, and
 * `priceExtractionWith` applies them on every later pricing of the product.
 *
 * Fails open. A missing key, a timeout or any error stores "skipped"/"failed"
 * and the product prices deterministically. Never throws.
 */

const CATEGORY_VALUES = Object.values(TomameCategory) as [string, ...string[]];
const CATEGORY_SET = new Set<string>(CATEGORY_VALUES);
const NONE = "none";

const VerdictSchema = z.object({
  verdict: z.enum(["ok", "correct"]),
  category: z.enum(CATEGORY_VALUES).nullable().describe("Corrected Tomame category, or null to keep the current one."),
  weight_lbs: z.number().nullable().describe("Shipping weight of ONE unit in pounds, or null to keep the current weight."),
  weight_implausible: z.boolean().describe("True only if the extracted weight is clearly wrong for this item."),
  fixed_freight_item: z.string().nullable().describe('A fixed-freight code from the list, "none" for no fixed freight, or null to keep the current choice.'),
  confidence: z.number().min(0).max(1),
  reason: z.string().describe("One short sentence."),
});
type Verdict = z.infer<typeof VerdictSchema>;

const SYSTEM =
  "You audit the shipping-fee decision for one product bought abroad and shipped by air to Ghana. " +
  "A fee calculator chose how to price freight: a pricing group from the product category, a per-lb weight rate, " +
  "or a pre-negotiated fixed-freight item (e.g. a laptop or phone). Mistakes to catch: a fixed-freight item for a product " +
  "that is not that item (a hoodie priced as a gaming laptop, an accessory priced as the device), a clearly wrong category, " +
  "and a missing or implausible weight (unit mix-ups: ounces or grams read as pounds, a bare number with no unit). " +
  'If the decision is reasonable, answer verdict "ok" with every correction null. Otherwise answer "correct" and set only the ' +
  "fields that must change. You never set prices. Be conservative: correct only obvious mistakes.";

let client: Anthropic | null = null;
function getClient(): Anthropic | null {
  const key = env.extraction.anthropicApiKey;
  if (!key) return null;
  if (!client) client = new Anthropic({ apiKey: key, timeout: FREIGHT_INSPECTOR.timeoutMs, maxRetries: 0 });
  return client;
}

export interface InspectFreightOptions {
  /** Canonical product URL, for the log. */
  url: string;
  /** A calculator already loaded for this request; loaded fresh otherwise. */
  calculator?: PricingCalculator;
  /** Override of `FREIGHT_INSPECTOR.timeoutMs` (tests). */
  timeoutMs?: number;
}

function decisionOf(p: PricingBreakdown): FreightDecision {
  return {
    pricing_method: p.pricing_method,
    pricing_group: p.pricing_group,
    freight_ghs: p.flat_rate_ghs,
    fixed_freight_item: p.fixed_freight_item ?? null,
    fixed_freight_item_id: p.fixed_freight_item_id ?? null,
    weight_lbs: p.weight_lbs ?? null,
  };
}

function sameDecision(a: FreightDecision, b: FreightDecision): boolean {
  return a.pricing_method === b.pricing_method && a.pricing_group === b.pricing_group && a.freight_ghs === b.freight_ghs
    && a.fixed_freight_item_id === b.fixed_freight_item_id && a.weight_lbs === b.weight_lbs;
}

/**
 * Why this decision is worth a model call. Empty means it is priced the boring
 * way (a category flat rate, or a listed weight in a plausible range) and the
 * inspector stays out of the way: most quotes pay no latency and no tokens.
 */
export function riskSignals(product: ExtractionResult["product"], pricing: PricingBreakdown): string[] {
  const signals: string[] = [];
  if (pricing.fixed_freight_item_id) signals.push("fixed freight matched");
  if (pricing.pricing_method === "needs_review") signals.push("could not price");
  if (!product.category || product.category === TomameCategory.OTHER) signals.push("no category");
  if (pricing.pricing_method === "weight_expression" && pricing.weight_source !== "listed") signals.push("weight not listed");
  const w = product.weight_lbs;
  const { min, max } = FREIGHT_INSPECTOR.plausibleWeightLbs;
  if (w != null && (w < min || w > max)) signals.push("weight out of range");
  const itemGhs = pricing.item_price_usd * pricing.exchange_rate;
  if (itemGhs > 0 && pricing.flat_rate_ghs > itemGhs * FREIGHT_INSPECTOR.maxFreightToItemRatio) signals.push("freight dwarfs item");
  return signals;
}

function isTimeout(err: unknown, signal: AbortSignal): boolean {
  if (signal.aborted) return true;
  const e = err as { name?: string; message?: string } | null;
  return /timeout|timed out|abort/i.test(`${e?.name ?? ""} ${e?.message ?? ""}`);
}

/**
 * Inspect one extraction's freight decision. Returns null when there is
 * nothing to inspect (no price or unsupported region — the product does not
 * price at all); otherwise a stored-ready inspection. Never throws.
 */
export async function inspectFreight(extraction: ExtractionResult, opts: InspectFreightOptions): Promise<FreightInspection | null> {
  const { product, country } = extraction;
  if (!country || product.price == null || !(product.price > 0)) return null;

  const t0 = Date.now();
  const base = (status: FreightInspectionStatus, key: string, rest: Partial<FreightInspection> = {}): FreightInspection => ({
    status,
    model: null,
    inspected_at: new Date().toISOString(),
    input_key: key,
    corrections: {},
    before: null,
    after: null,
    confidence: null,
    reason: null,
    ms: Date.now() - t0,
    ...rest,
  });

  let key = "";
  try {
    const calculator = opts.calculator ?? (await loadPricingCalculator());
    const items = calculator.activeFixedFreightItems;
    key = freightInspectionKey(product, items.map((i) => i.id));
    const plain: ExtractionResult = { ...extraction, freight_inspection: undefined };

    const beforePriced = await priceExtractionWith(calculator, plain, 1, null, null);
    if (!beforePriced.pricing) return base("failed", key, { reason: `could not price: ${beforePriced.reason ?? "unknown"}` });
    const before = decisionOf(beforePriced.pricing);

    const signals = riskSignals(product, beforePriced.pricing);
    if (signals.length === 0) return base("clear", key, { before, after: before, reason: "no risk signal" });

    const anthropic = getClient();
    if (!anthropic) return base("skipped", key, { before, reason: "no ANTHROPIC_API_KEY" });

    // The fixed items this product could plausibly be: those whose shelf allows
    // its category (all of them when the category is unknown), plus the current
    // one. Short codes instead of uuids keep the prompt small and unguessable.
    const offered = items
      .filter((i) => i.id === before.fixed_freight_item_id || fixedFreightCategoryAllows(i.category, product.category))
      .slice(0, FREIGHT_INSPECTOR.maxFixedItemsInPrompt);
    const codes = new Map(offered.map((i, n) => [`F${n + 1}`, i]));

    const breadcrumbs = Array.isArray(product.metadata?.breadcrumbs) ? (product.metadata.breadcrumbs as unknown[]).map(String) : [];
    const currentFixed = [...codes].find(([, i]) => i.id === before.fixed_freight_item_id)?.[0];
    const facts = [
      `Store: ${extraction.platform ?? "unknown"} (${country})`,
      `Title: ${product.title ?? "unknown"}`,
      product.brand ? `Brand: ${product.brand}` : "",
      breadcrumbs.length ? `Store category path: ${breadcrumbs.join(" › ")}` : "",
      `Category: ${product.category ?? "unknown"}`,
      `Listed weight: ${product.weight ?? "none"} → parsed ${product.weight_lbs ?? "none"} lb`,
      product.dimensions ? `Dimensions: ${product.dimensions}` : "",
      `Item price: ${product.price} ${product.currency ?? "USD"}`,
      "",
      "Calculator decision:",
      `- method: ${before.pricing_method}${before.pricing_group ? `, pricing group: ${before.pricing_group}` : ""}`,
      `- freight: GH₵${before.freight_ghs}`,
      `- fixed-freight item: ${before.fixed_freight_item ? `${currentFixed ?? "?"} ${before.fixed_freight_item}` : "none"}`,
      before.weight_lbs != null ? `- weight used: ${before.weight_lbs} lb` : "",
      beforePriced.pricing.review_reason ? `- could not price: ${beforePriced.pricing.review_reason}` : "",
      "",
      "Fixed-freight items (code | name | shelf | freight GH₵):",
      ...[...codes].map(([code, i]) => `${code} | ${i.product_name} | ${i.category} | ${i.freight_rate_ghs}`),
      `${NONE} | no fixed freight, price by category`,
    ].filter((l) => l !== "").join("\n");

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? FREIGHT_INSPECTOR.timeoutMs);
    let verdict: Verdict | null;
    try {
      const response = await anthropic.messages.parse(
        {
          model: FREIGHT_INSPECTOR.model,
          max_tokens: FREIGHT_INSPECTOR.maxOutputTokens,
          output_config: { format: zodOutputFormat(VerdictSchema) },
          system: SYSTEM,
          messages: [{ role: "user", content: facts }],
        },
        { signal: controller.signal },
      );
      verdict = response.stop_reason === "refusal" ? null : (response.parsed_output ?? null);
    } catch (err) {
      const timedOut = isTimeout(err, controller.signal);
      logger.warn("freight inspector: model call failed", { url: opts.url, timedOut, error: err instanceof Error ? err.message : String(err), ms: Date.now() - t0 });
      return base(timedOut ? "skipped" : "failed", key, { before, model: FREIGHT_INSPECTOR.model, reason: timedOut ? "timeout" : "model error" });
    } finally {
      clearTimeout(timer);
    }
    if (!verdict) return base("failed", key, { before, model: FREIGHT_INSPECTOR.model, reason: "no verdict" });

    const approved = (reason: string) =>
      base("approved", key, { before, after: before, model: FREIGHT_INSPECTOR.model, confidence: verdict.confidence, reason });

    if (verdict.verdict === "ok") return approved(verdict.reason);
    if (!(verdict.confidence >= FREIGHT_INSPECTOR.minConfidence)) return approved(`ignored low-confidence correction: ${verdict.reason}`);

    // ── Validate each correction against what we offered ──────────────────
    const corrections: FreightCorrections = {};
    if (verdict.category && CATEGORY_SET.has(verdict.category) && verdict.category !== product.category) {
      corrections.category = verdict.category;
    }
    const finalCategory = corrections.category ?? product.category;
    const code = verdict.fixed_freight_item?.trim();
    if (code && code.toLowerCase() === NONE) {
      if (before.fixed_freight_item_id) corrections.fixed_freight_item_id = null;
    } else if (code) {
      const chosen = codes.get(code.toUpperCase());
      if (chosen && chosen.id !== before.fixed_freight_item_id && fixedFreightCategoryAllows(chosen.category, finalCategory)) {
        corrections.fixed_freight_item_id = chosen.id;
      }
    }
    const w = verdict.weight_lbs;
    if (
      w != null && Number.isFinite(w) && w >= FREIGHT_INSPECTOR.minWeightLbs && w <= FREIGHT_INSPECTOR.maxWeightLbs
      && w !== product.weight_lbs
      && (product.weight_lbs == null || (verdict.weight_implausible && verdict.reason.trim().length > 0))
    ) {
      corrections.weight_lbs = Math.round(w * 100) / 100;
    }
    if (Object.keys(corrections).length === 0) return approved(`no valid correction: ${verdict.reason}`);

    // ── Reprice the corrected inputs through the normal path ──────────────
    const candidate = base("corrected", key, { corrections, before, model: FREIGHT_INSPECTOR.model, confidence: verdict.confidence, reason: verdict.reason });
    const afterPriced = await priceExtractionWith(calculator, { ...extraction, freight_inspection: candidate }, 1, null, null);
    if (!afterPriced.pricing) return approved(`correction did not price: ${verdict.reason}`);
    const after = decisionOf(afterPriced.pricing);
    // A correction may rescue a product from review, never send one there.
    if (after.pricing_method === "needs_review" && before.pricing_method !== "needs_review") {
      return approved(`correction would need review, ignored: ${verdict.reason}`);
    }
    if (sameDecision(before, after)) return approved(`correction changed nothing: ${verdict.reason}`);

    const result: FreightInspection = { ...candidate, after, ms: Date.now() - t0 };
    logger.info("freight inspector: corrected", {
      store: extraction.platform,
      url: opts.url,
      title: product.title,
      corrections,
      before,
      after,
      confidence: verdict.confidence,
      reason: verdict.reason,
      ms: result.ms,
    });
    return result;
  } catch (err) {
    logger.warn("freight inspector: failed", { url: opts.url, error: err instanceof Error ? err.message : String(err) });
    return base("failed", key, { reason: "inspector error" });
  }
}
