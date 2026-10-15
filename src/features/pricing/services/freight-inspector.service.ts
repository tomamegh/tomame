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
  NO_MODEL_REASON,
  type FreightCorrections,
  type FreightDecision,
  type FreightInspection,
  type FreightInspectionStatus,
} from "../freight-inspection";

/**
 * FREIGHT INSPECTOR — a pricing-accuracy guard.
 *
 * Once per product, in the background after the quote is shown, a model looks
 * at the calculator's freight decision next to the product facts and says
 * whether it is plausible. When the store listed no weight it searches the web
 * for this exact item first (Gemini Flash-Lite + Exa through OpenRouter): an
 * eBay car part priced at the 1 lb category placeholder was the case that
 * prompted it (2026-10-15). When it is not plausible, it may correct the
 * calculator's INPUTS only — category, weight_lbs, fixed-freight item — each
 * checked against the set we offered. It never outputs money: the normal
 * calculator prices the corrected inputs, and `priceExtractionWith` applies
 * them on every later pricing of the product.
 *
 * Two steps, so the quote never waits on a model: `planFreightInspection`
 * decides (no model call) whether a check is needed and returns a `pending`
 * marker to store with the quote; `inspectFreight` runs the whole check.
 *
 * Fails open. A missing key, a timeout or any error stores "skipped"/"failed"
 * and the product prices deterministically. Never throws.
 */

const CATEGORY_VALUES = Object.values(TomameCategory) as [string, ...string[]];
const CATEGORY_SET = new Set<string>(CATEGORY_VALUES);
const NONE = "none";
const KEEP = "keep";

/**
 * No nullable fields: Gemini's structured output through OpenRouter handled a
 * flat schema reliably in the probe, so "keep" / 0 stand for "no change".
 */
const VerdictSchema = z.object({
  verdict: z.enum(["ok", "correct"]),
  category: z.enum([...CATEGORY_VALUES, KEEP]).describe('Corrected Tomame category, or "keep".'),
  weight_lbs: z.number().describe("Boxed shipping weight of ONE unit in pounds, or 0 to keep the current weight."),
  weight_implausible: z.boolean().describe("True only if a weight the store LISTED is clearly wrong for this item."),
  fixed_freight_item: z.string().describe('A fixed-freight code from the list, "none" for no fixed freight, or "keep".'),
  basis: z.enum(["found_listed", "found_similar", "estimated", "not_applicable"])
    .describe("found_listed: a listing of this exact item states its weight. found_similar: listings of near-identical items. estimated: no page states it. not_applicable: weight not at issue."),
  sources: z.array(z.string()).describe("URLs of the pages the weight came from; empty when estimated."),
  confidence: z.number().describe("0 to 1."),
  reason: z.string().describe("One or two short sentences; name the source of the weight."),
});
type Verdict = z.infer<typeof VerdictSchema>;

const VERDICT_JSON_SCHEMA = (() => {
  const schema = z.toJSONSchema(VerdictSchema) as Record<string, unknown>;
  delete schema.$schema;
  return schema;
})();

const SYSTEM = [
  "You audit the shipping-fee decision for one product bought abroad and shipped by air to Ghana. Freight is charged per pound of",
  "BOXED weight, so an underestimate loses us money on every unit and an overestimate overcharges the customer.",
  "A fee calculator chose how to price freight: a pricing group from the product category, a per-lb weight rate, or a pre-negotiated",
  "fixed-freight item (e.g. a laptop or phone).",
  "",
  "Mistakes to catch:",
  "- a fixed-freight item for a product that is not that item (a hoodie priced as a gaming laptop, an accessory priced as the device);",
  "- a clearly wrong category;",
  "- a missing or wrong weight: unit mix-ups (ounces or grams read as pounds, a bare number with no unit), and placeholders.",
  "",
  "When the store listed no weight, the calculator used a category placeholder or a size-based estimate; the weight source line says",
  "which. A placeholder is NOT evidence. Find the real weight:",
  "1. If you can search the web, search for the exact part number, model number or MPN in the title first (OEM parts catalogues, parts",
  "   retailers, Amazon, Ubuy, eBay listings of the same item). Look for 'shipping weight', 'package weight', then 'item weight'.",
  "2. Otherwise use near-identical items (same part for the same vehicle, same model in another colour).",
  "3. Only then estimate from what the item is, its size and materials.",
  "Convert carefully: 1 kg = 2.2046 lb, 1 lb = 16 oz = 453.6 g. A bare item weight needs packaging added (about 15%, at least 0.3 lb;",
  "more for fragile or bulky items). Large car body parts (grilles, bumpers, ducts, shutters, trim panels, dash assemblies) and anything",
  "with glass, metal or a motor ship heavier than they look.",
  "",
  'If the decision is reasonable, answer verdict "ok" with category "keep", weight_lbs 0 and fixed_freight_item "keep". Otherwise answer',
  '"correct" and change only the fields that must change. When the store listed no weight and you found or estimated a materially',
  "different one (off by more than about 20%), that is a correction: give it in weight_lbs. A listed weight is evidence: replace it only",
  "when it is clearly a unit mix-up or impossible for the item, and then set weight_implausible true.",
  "List the URLs your weight came from in sources and say in reason where it came from. You never set prices. Answer with JSON only.",
].join("\n");

let anthropic: Anthropic | null = null;
function getAnthropic(): Anthropic | null {
  const key = env.extraction.anthropicApiKey;
  if (!key) return null;
  if (!anthropic) anthropic = new Anthropic({ apiKey: key, maxRetries: 0 });
  return anthropic;
}

/** Which model answers, or null when none is configured. */
function provider(): "openrouter" | "anthropic" | null {
  if (env.extraction.openRouterApiKey) return "openrouter";
  if (env.extraction.anthropicApiKey) return "anthropic";
  return null;
}

export interface InspectFreightOptions {
  /** Canonical product URL, for the log. */
  url: string;
  /** A calculator already loaded for this request; loaded fresh otherwise. */
  calculator?: PricingCalculator;
  /** Override of `FREIGHT_INSPECTOR.timeoutMs` (tests). */
  timeoutMs?: number;
}

function weightSourceLabel(source: PricingBreakdown["weight_source"]): string {
  switch (source) {
    case "listed": return "listed by the store";
    case "minimum": return "listed by the store, raised to the minimum chargeable weight";
    case "estimated": return "estimated from the product's size in the title (no weight listed)";
    case "default": return "the category's placeholder weight (no weight listed; not evidence)";
    default: return "unknown";
  }
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
 * Why this decision is worth a model call. Every weight-priced decision is
 * checked (a listed weight cheaply, without a search); a flat-rate one only
 * with a risk signal. Empty means it is priced the boring way and the
 * inspector stays out of the way.
 */
export function riskSignals(product: ExtractionResult["product"], pricing: PricingBreakdown): string[] {
  const signals: string[] = [];
  if (pricing.fixed_freight_item_id) signals.push("fixed freight matched");
  if (pricing.pricing_method === "needs_review") signals.push("could not price");
  if (!product.category || product.category === TomameCategory.OTHER) signals.push("no category");
  if (pricing.pricing_method === "weight_expression" && pricing.weight_source !== "listed" && pricing.weight_source !== "minimum") signals.push("weight not listed");
  const w = product.weight_lbs;
  const { min, max } = FREIGHT_INSPECTOR.plausibleWeightLbs;
  if (w != null && (w < min || w > max)) signals.push("weight out of range");
  const itemGhs = pricing.item_price_usd * pricing.exchange_rate;
  if (itemGhs > 0 && pricing.flat_rate_ghs > itemGhs * FREIGHT_INSPECTOR.maxFreightToItemRatio) signals.push("freight dwarfs item");
  if (signals.length === 0 && pricing.pricing_method === "weight_expression") signals.push("priced by weight");
  return signals;
}

/** Item specifics worth a search or a sanity check: part numbers, model, weight, size. */
const USEFUL_SPEC = /part|mpn|model|oem|weight|dimension|size|material|placement|fitment/i;
function specLines(specs: Record<string, string> | null | undefined): string[] {
  return Object.entries(specs ?? {})
    .filter(([k, v]) => USEFUL_SPEC.test(k) && typeof v === "string" && v.trim() && v.length <= 200)
    .slice(0, 8)
    .map(([k, v]) => `Spec ${k}: ${v.trim()}`);
}

/** A web search pays off only when the weight itself is in doubt. */
function wantsWebSearch(signals: readonly string[]): boolean {
  return signals.some((s) => s === "weight not listed" || s === "weight out of range" || s === "could not price");
}

function isTimeout(err: unknown, signal: AbortSignal): boolean {
  if (signal.aborted) return true;
  const e = err as { name?: string; message?: string } | null;
  return /timeout|timed out|abort/i.test(`${e?.name ?? ""} ${e?.message ?? ""}`);
}

interface Prepared {
  calculator: PricingCalculator;
  key: string;
  before: FreightDecision;
  beforePricing: PricingBreakdown;
  signals: string[];
}

type Stamp = (status: FreightInspectionStatus, key: string, rest?: Partial<FreightInspection>) => FreightInspection;

function stamper(t0: number): Stamp {
  return (status, key, rest = {}) => ({
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
}

/**
 * Price the product as it stands and decide whether it needs a check. Returns
 * either a finished inspection (nothing to check, or nothing to check with) or
 * the inputs for a model call.
 */
async function prepare(extraction: ExtractionResult, opts: InspectFreightOptions, stamp: Stamp): Promise<FreightInspection | Prepared | null> {
  const { product, country } = extraction;
  if (!country || product.price == null || !(product.price > 0)) return null;

  const calculator = opts.calculator ?? (await loadPricingCalculator());
  const key = freightInspectionKey(product, calculator.activeFixedFreightItems.map((i) => i.id));
  const plain: ExtractionResult = { ...extraction, freight_inspection: undefined };

  const beforePriced = await priceExtractionWith(calculator, plain, 1, null, null);
  if (!beforePriced.pricing) return stamp("failed", key, { reason: `could not price: ${beforePriced.reason ?? "unknown"}` });
  const before = decisionOf(beforePriced.pricing);

  const signals = riskSignals(product, beforePriced.pricing);
  if (signals.length === 0) return stamp("clear", key, { before, after: before, reason: "no risk signal" });
  if (!provider()) return stamp("skipped", key, { before, reason: NO_MODEL_REASON });
  return { calculator, key, before, beforePricing: beforePriced.pricing, signals };
}

/**
 * The quote-time half: no model call. Null when there is nothing to inspect (no
 * price or no region — the product does not price at all); a finished
 * inspection when no check is needed; otherwise a `pending` marker, and the
 * caller runs `inspectFreight` in the background. Never throws.
 */
export async function planFreightInspection(extraction: ExtractionResult, opts: InspectFreightOptions): Promise<FreightInspection | null> {
  const stamp = stamper(Date.now());
  try {
    const prepared = await prepare(extraction, opts, stamp);
    if (prepared == null || "status" in prepared) return prepared;
    return stamp("pending", prepared.key, { before: prepared.before, reason: prepared.signals.join(", "), ms: null });
  } catch (err) {
    logger.warn("freight inspector: plan failed", { url: opts.url, error: err instanceof Error ? err.message : String(err) });
    return null;
  }
}

/**
 * Inspect one extraction's freight decision. Returns null when there is
 * nothing to inspect; otherwise a stored-ready inspection. Never throws.
 */
export async function inspectFreight(extraction: ExtractionResult, opts: InspectFreightOptions): Promise<FreightInspection | null> {
  const { product, country } = extraction;
  const t0 = Date.now();
  const base = stamper(t0);

  let key = "";
  try {
    const prepared = await prepare(extraction, opts, base);
    if (prepared == null || "status" in prepared) return prepared;
    const { calculator, before, beforePricing, signals } = prepared;
    key = prepared.key;

    // The fixed items this product could plausibly be: those whose shelf allows
    // its category (all of them when the category is unknown), plus the current
    // one. Short codes instead of uuids keep the prompt small and unguessable.
    const offered = calculator.activeFixedFreightItems
      .filter((i) => i.id === before.fixed_freight_item_id || fixedFreightCategoryAllows(i.category, product.category))
      .slice(0, FREIGHT_INSPECTOR.maxFixedItemsInPrompt);
    const codes = new Map(offered.map((i, n) => [`F${n + 1}`, i]));

    const breadcrumbs = Array.isArray(product.metadata?.breadcrumbs) ? (product.metadata.breadcrumbs as unknown[]).map(String) : [];
    const currentFixed = [...codes].find(([, i]) => i.id === before.fixed_freight_item_id)?.[0];
    const facts = [
      `Store: ${extraction.platform ?? "unknown"} (${country})`,
      `Title: ${product.title ?? "unknown"}`,
      product.brand ? `Brand: ${product.brand}` : "",
      ...specLines(product.specifications),
      breadcrumbs.length ? `Store category path: ${breadcrumbs.join(" › ")}` : "",
      `Category: ${product.category ?? "unknown"}`,
      `Listed weight: ${product.weight ?? "none"} → parsed ${product.weight_lbs ?? "none"} lb`,
      product.dimensions ? `Dimensions: ${product.dimensions}` : "",
      `Item price: ${product.price} ${product.currency ?? "USD"}`,
      `Product page: ${opts.url}`,
      "",
      "Calculator decision:",
      `- method: ${before.pricing_method}${before.pricing_group ? `, pricing group: ${before.pricing_group}` : ""}`,
      `- freight: GH₵${before.freight_ghs}`,
      `- fixed-freight item: ${before.fixed_freight_item ? `${currentFixed ?? "?"} ${before.fixed_freight_item}` : "none"}`,
      before.weight_lbs != null ? `- weight used: ${before.weight_lbs} lb` : "",
      before.weight_lbs != null ? `- weight source: ${weightSourceLabel(beforePricing.weight_source)}` : "",
      beforePricing.review_reason ? `- could not price: ${beforePricing.review_reason}` : "",
      `- why this is being checked: ${signals.join(", ")}`,
      "",
      "Fixed-freight items (code | name | shelf | freight GH₵):",
      ...[...codes].map(([code, i]) => `${code} | ${i.product_name} | ${i.category} | ${i.freight_rate_ghs}`),
      `${NONE} | no fixed freight, price by category`,
    ].filter((l) => l !== "").join("\n");

    const web = wantsWebSearch(signals);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? FREIGHT_INSPECTOR.timeoutMs);
    let answer: ModelAnswer | null;
    try {
      answer = provider() === "openrouter"
        ? await askOpenRouter(facts, web, controller.signal)
        : await askAnthropic(facts, controller.signal);
    } catch (err) {
      const timedOut = isTimeout(err, controller.signal);
      logger.warn("freight inspector: model call failed", { url: opts.url, timedOut, web, error: err instanceof Error ? err.message : String(err), ms: Date.now() - t0 });
      return base(timedOut ? "skipped" : "failed", key, { before, reason: timedOut ? "timeout" : "model error" });
    } finally {
      clearTimeout(timer);
    }
    if (!answer) return base("failed", key, { before, reason: "no verdict" });
    const { verdict, model } = answer;
    const sources = answer.sources.slice(0, FREIGHT_INSPECTOR.maxSources);
    const basis = verdict.basis === "not_applicable" ? null : verdict.basis;
    const confidence = Math.min(1, Math.max(0, verdict.confidence));

    const approved = (reason: string) =>
      base("approved", key, { before, after: before, model, confidence, reason, basis, sources });

    if (verdict.verdict === "ok") return approved(verdict.reason);
    if (!(confidence >= FREIGHT_INSPECTOR.minConfidence)) return approved(`ignored low-confidence correction: ${verdict.reason}`);

    // ── Validate each correction against what we offered ──────────────────
    const corrections: FreightCorrections = {};
    if (verdict.category !== KEEP && CATEGORY_SET.has(verdict.category) && verdict.category !== product.category) {
      corrections.category = verdict.category;
    }
    const finalCategory = corrections.category ?? product.category;
    const code = verdict.fixed_freight_item.trim();
    if (code.toLowerCase() === NONE) {
      if (before.fixed_freight_item_id) corrections.fixed_freight_item_id = null;
    } else if (code && code.toLowerCase() !== KEEP) {
      const chosen = codes.get(code.toUpperCase());
      if (chosen && chosen.id !== before.fixed_freight_item_id && fixedFreightCategoryAllows(chosen.category, finalCategory)) {
        corrections.fixed_freight_item_id = chosen.id;
      }
    }
    const w = verdict.weight_lbs;
    if (
      w > 0 && Number.isFinite(w) && w >= FREIGHT_INSPECTOR.minWeightLbs && w <= FREIGHT_INSPECTOR.maxWeightLbs
      && w !== product.weight_lbs
      && (product.weight_lbs == null || (verdict.weight_implausible && verdict.reason.trim().length > 0))
    ) {
      corrections.weight_lbs = Math.round(w * 100) / 100;
    }
    if (Object.keys(corrections).length === 0) return approved(`no valid correction: ${verdict.reason}`);

    // ── Reprice the corrected inputs through the normal path ──────────────
    const candidate = base("corrected", key, { corrections, before, model, confidence, reason: verdict.reason, basis, sources });
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
      model,
      web,
      basis,
      sources,
      confidence,
      reason: verdict.reason,
      ms: result.ms,
    });
    return result;
  } catch (err) {
    logger.warn("freight inspector: failed", { url: opts.url, error: err instanceof Error ? err.message : String(err) });
    return base("failed", key, { reason: "inspector error" });
  }
}

interface ModelAnswer {
  verdict: Verdict;
  /** The model that actually answered (OpenRouter may fall back). */
  model: string;
  sources: string[];
}

interface OpenRouterResponse {
  model?: string;
  choices?: { message?: { content?: string | null; annotations?: { type?: string; url_citation?: { url?: string } }[] } }[];
  usage?: { cost?: number };
  error?: { message?: string; code?: number };
}

/**
 * Gemini through OpenRouter, with OpenRouter's web plugin when `web`. Sources
 * are the pages the search really returned (`url_citation` annotations), never
 * URLs the model wrote itself: without a search Gemini invented listing URLs in
 * the probe, so a URL only counts when the search produced it.
 */
async function askOpenRouter(facts: string, web: boolean, signal: AbortSignal): Promise<ModelAnswer | null> {
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    signal,
    headers: {
      Authorization: `Bearer ${env.extraction.openRouterApiKey}`,
      "Content-Type": "application/json",
      "X-Title": "Tomame freight inspector",
    },
    body: JSON.stringify({
      models: FREIGHT_INSPECTOR.openRouterModels,
      max_tokens: FREIGHT_INSPECTOR.maxOutputTokens,
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: web ? facts : `${facts}\n\n(No web search for this check: judge from what you know.)` },
      ],
      response_format: { type: "json_schema", json_schema: { name: "freight_verdict", strict: true, schema: VERDICT_JSON_SCHEMA } },
      usage: { include: true },
      ...(web
        ? { plugins: [{ id: "web", engine: FREIGHT_INSPECTOR.webSearch.engine, max_results: FREIGHT_INSPECTOR.webSearch.maxResults }] }
        : {}),
    }),
  });
  const json = (await res.json().catch(() => ({}))) as OpenRouterResponse;
  if (!res.ok || json.error) throw new Error(`openrouter ${res.status}: ${json.error?.message ?? "no body"}`);

  const message = json.choices?.[0]?.message;
  const content = message?.content?.trim();
  if (!content) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(content.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, ""));
  } catch {
    return null;
  }
  const parsed = VerdictSchema.safeParse(raw);
  if (!parsed.success) return null;

  const cited = (message?.annotations ?? [])
    .map((a) => (a.type === "url_citation" ? a.url_citation?.url : undefined))
    .filter((u): u is string => typeof u === "string" && /^https?:\/\//.test(u));
  const verdict = parsed.data;
  // A "found" basis with nothing the search returned behind it is an estimate.
  if (web && cited.length === 0 && verdict.basis !== "not_applicable") verdict.basis = "estimated";
  if (!web && verdict.basis === "found_listed") verdict.basis = "estimated";

  logger.info("freight inspector: model answered", { model: json.model, web, cost: json.usage?.cost, basis: verdict.basis, weight_lbs: verdict.weight_lbs, sources: cited.length });
  return { verdict, model: json.model ?? FREIGHT_INSPECTOR.openRouterModels[0], sources: [...new Set(cited)] };
}

/** Haiku, without a search: the stand-in when OpenRouter is not configured. */
async function askAnthropic(facts: string, signal: AbortSignal): Promise<ModelAnswer | null> {
  const client = getAnthropic();
  if (!client) return null;
  const response = await client.messages.parse(
    {
      model: FREIGHT_INSPECTOR.fallbackModel,
      max_tokens: FREIGHT_INSPECTOR.maxOutputTokens,
      output_config: { format: zodOutputFormat(VerdictSchema) },
      system: SYSTEM,
      messages: [{ role: "user", content: `${facts}\n\n(No web search for this check: judge from what you know.)` }],
    },
    { signal },
  );
  const verdict = response.stop_reason === "refusal" ? null : (response.parsed_output ?? null);
  if (!verdict) return null;
  // Haiku cannot browse, so it cannot have read a listing.
  if (verdict.basis === "found_listed") verdict.basis = "estimated";
  return { verdict, model: FREIGHT_INSPECTOR.fallbackModel, sources: [] };
}
