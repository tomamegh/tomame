import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { EXTRACTION } from "@/config/extraction";
import { TomameCategory, AMAZON_CATEGORY_MAP, EBAY_CATEGORY_MAP, MICROCENTER_CATEGORY_MAP, SHEIN_CATEGORY_MAP } from "@/config/categories";

/**
 * Category classification off the LLM hot path.
 *
 *   1. static maps  — the store-category names already known in config
 *   2. learned map  — store_category_map (one indexed read)
 *   3. Haiku        — title + breadcrumbs → enum, ~1 s, written back to (2)
 *
 * The result feeds the pricing group, so a wrong guess costs money; the
 * classifier is therefore asked for a confidence and low-confidence answers
 * are stored but flagged.
 */
export interface ClassifyInput {
  store: string;
  title: string | null;
  brand?: string | null;
  breadcrumbs: string[];
  /** Free-text category the store gave (e.g. ScraperAPI's "Home & Kitchen›Furniture"). */
  categoryText?: string | null;
}

export interface ClassifyResult {
  category: TomameCategory;
  confidence: number;
  source: "seed" | "map" | "llm";
}

const CATEGORY_VALUES = Object.values(TomameCategory) as [string, ...string[]];

const STATIC_MAPS = [AMAZON_CATEGORY_MAP, EBAY_CATEGORY_MAP, SHEIN_CATEGORY_MAP, MICROCENTER_CATEGORY_MAP];
let staticIndex: Map<string, TomameCategory> | null = null;
function staticLookup(name: string): TomameCategory | null {
  if (!staticIndex) {
    staticIndex = new Map();
    for (const m of STATIC_MAPS) for (const [k, v] of m) if (!staticIndex.has(k.toLowerCase())) staticIndex.set(k.toLowerCase(), v);
    for (const v of Object.values(TomameCategory)) staticIndex.set(v.toLowerCase(), v);
  }
  return staticIndex.get(name.trim().toLowerCase()) ?? null;
}

/** Breadcrumbs from the store, normalised into one lookup key. */
export function pathKey(breadcrumbs: string[]): string {
  return breadcrumbs.map((b) => b.trim().toLowerCase()).filter(Boolean).join(" › ");
}

export function crumbsFromText(text: string | null | undefined): string[] {
  if (!text) return [];
  return text.split(/›|>|\/|»/).map((c) => c.trim()).filter(Boolean);
}

const ClassificationSchema = z.object({
  category: z.enum(CATEGORY_VALUES).describe("The single closest Tomame category."),
  confidence: z.number().min(0).max(1).describe("How sure you are, 0–1."),
});

let client: Anthropic | null = null;
function getClient(): Anthropic | null {
  const key = env.extraction.anthropicApiKey;
  if (!key) return null;
  if (!client) client = new Anthropic({ apiKey: key, timeout: EXTRACTION.classifierTimeoutMs, maxRetries: 0 });
  return client;
}

async function classifyWithClaude(input: ClassifyInput, signal?: AbortSignal): Promise<ClassifyResult | null> {
  const anthropic = getClient();
  if (!anthropic || !input.title) return null;
  const t0 = Date.now();
  try {
    const response = await anthropic.messages.parse(
      {
        model: EXTRACTION.classifierModel,
        max_tokens: 200,
        output_config: { format: zodOutputFormat(ClassificationSchema) },
        system:
          "You classify e-commerce products into a fixed category list for a shipping-fee calculator. " +
          "Pick the single closest category from the schema. Prefer the most specific match; use Other only when nothing fits.",
        messages: [
          {
            role: "user",
            content: [
              `Store: ${input.store}`,
              `Title: ${input.title}`,
              input.brand ? `Brand: ${input.brand}` : "",
              input.breadcrumbs.length ? `Store category path: ${input.breadcrumbs.join(" › ")}` : "",
            ].filter(Boolean).join("\n"),
          },
        ],
      },
      { signal },
    );
    if (response.stop_reason === "refusal" || !response.parsed_output) return null;
    const category = response.parsed_output.category as TomameCategory;
    logger.info("category: classified", { store: input.store, category, confidence: response.parsed_output.confidence, ms: Date.now() - t0 });
    return { category, confidence: response.parsed_output.confidence, source: "llm" };
  } catch (err) {
    if (!signal?.aborted) logger.warn("category: classifier failed", { error: err instanceof Error ? err.message : String(err), ms: Date.now() - t0 });
    return null;
  }
}

/**
 * The DB module imports `server-only`, which throws outside Next's server
 * runtime (vitest included). Loading it lazily keeps the chain unit-testable;
 * a failed load just means no learned map this call.
 */
async function learnedMap() {
  try {
    return await import("@/db/queries/store-category-map");
  } catch {
    return null;
  }
}

export async function classifyCategory(input: ClassifyInput, signal?: AbortSignal): Promise<ClassifyResult | null> {
  const crumbs = input.breadcrumbs.length ? input.breadcrumbs : crumbsFromText(input.categoryText);

  // 1. Static maps — most specific crumb first.
  for (const crumb of [...crumbs].reverse()) {
    const hit = staticLookup(crumb);
    if (hit && hit !== TomameCategory.OTHER) return { category: hit, confidence: 0.9, source: "seed" };
  }

  const key = pathKey(crumbs);
  const db = key ? await learnedMap() : null;

  // 2. Learned map.
  if (db && key) {
    const row = await db.getStoreCategory(input.store, key);
    if (row && CATEGORY_VALUES.includes(row.tomame_category)) {
      return { category: row.tomame_category as TomameCategory, confidence: row.confidence ?? 0.8, source: "map" };
    }
  }

  // 3. Claude, then remember it for this store path.
  const guess = await classifyWithClaude({ ...input, breadcrumbs: crumbs }, signal);
  if (guess && db && key) {
    void db.upsertStoreCategory({
      store: input.store,
      sourcePath: key,
      tomameCategory: guess.category,
      source: "llm",
      confidence: guess.confidence,
      sampleTitle: input.title,
    });
  }
  return guess;
}
