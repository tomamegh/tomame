import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";

import { FINDER } from "@/config/finder";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";

import { applyShortlistOutput, ShortlistOutputSchema, type DropReason, type FinderListing } from "../shortlist";
import { FinderSpecOutputSchema, parseSpecOutput, type ParsedFinderSpec } from "../spec";

/**
 * The two model calls. The model reads words and picks ids; it is never shown
 * a price and nothing it says becomes one. Both calls fail soft: `null` means
 * "the model did not give us something we can use", and the caller decides.
 */

let client: Anthropic | null = null;
function getClient(): Anthropic | null {
  const key = env.extraction.anthropicApiKey;
  if (!key) return null;
  if (!client) client = new Anthropic({ apiKey: key, maxRetries: 1 });
  return client;
}

export function isFinderAiConfigured(): boolean {
  return env.extraction.anthropicApiKey !== null;
}

export interface TokenUsage {
  input: number;
  output: number;
}

const UNDERSTAND_SYSTEM = [
  "You turn a Ghanaian shopper's request into a search spec for US stores (Amazon, Walmart, eBay).",
  "The shopper writes in their own words; prices they mention are in Ghana cedis (GH₵, GHS, cedis).",
  "product: the item as a shopper would name it, keeping brand and model.",
  "search_query: what to type into a US store's search box to find exactly that item, without prices or budget words.",
  "must_haves: only attributes the shopper actually stated (size, colour, storage, edition, model). Do not add your own.",
  "budget_ghs: the maximum they stated in cedis, else null. Never convert currencies.",
  "is_product_request is false for greetings, questions, services, or anything that is not a physical product.",
].join("\n");

/** Request text → spec, or null when the request is not a product or the output does not fit. */
export async function understandRequest(
  query: string,
  typedBudgetGhs: number | null,
  usage?: TokenUsage,
): Promise<ParsedFinderSpec | null> {
  const anthropic = getClient();
  if (!anthropic) return null;
  const t0 = Date.now();
  try {
    const response = await anthropic.messages.parse(
      {
        model: FINDER.model,
        max_tokens: 1_000,
        output_config: { effort: "low", format: zodOutputFormat(FinderSpecOutputSchema) },
        system: UNDERSTAND_SYSTEM,
        messages: [{ role: "user", content: `Request: ${query}` }],
      },
      { timeout: FINDER.understandTimeoutMs },
    );
    if (usage) {
      usage.input += response.usage.input_tokens;
      usage.output += response.usage.output_tokens;
    }
    if (response.stop_reason === "refusal" || !response.parsed_output) return null;
    return parseSpecOutput(response.parsed_output, typedBudgetGhs);
  } catch (error) {
    logger.warn("finder: understand failed", { error: error instanceof Error ? error.message : String(error), ms: Date.now() - t0 });
    return null;
  }
}

const SHORTLIST_SYSTEM = [
  "You check store search results against what a shopper asked for.",
  "A match is EXACTLY the requested item, sold new, as a single unit, meeting every must-have.",
  "Reject: a different product or model; accessories, cases, parts or bundles built around a different item;",
  "used, renewed, refurbished or open-box listings; multipacks the shopper did not ask for.",
  "Variants that the shopper did not constrain (colour when no colour was asked) are matches.",
  "Answer with listing ids only. Put the closest matches first.",
].join("\n");

/** Listings → the exact matches by id, with the model's reason for each rejection. Null on any failure. */
export async function shortlistListings(
  spec: ParsedFinderSpec,
  listings: readonly FinderListing[],
  usage?: TokenUsage,
): Promise<{ matches: FinderListing[]; dropped: Partial<Record<DropReason, number>> } | null> {
  const anthropic = getClient();
  if (!anthropic || listings.length === 0) return null;
  const t0 = Date.now();
  const lines = listings.map((l) => `${l.id} | ${l.store} | ${l.title}${l.condition ? ` | condition: ${l.condition}` : ""}`);
  try {
    const response = await anthropic.messages.parse(
      {
        model: FINDER.model,
        max_tokens: 4_000,
        output_config: { effort: "low", format: zodOutputFormat(ShortlistOutputSchema) },
        system: SHORTLIST_SYSTEM,
        messages: [
          {
            role: "user",
            content: [
              `Requested: ${spec.product}`,
              spec.mustHaves.length ? `Must have: ${spec.mustHaves.join("; ")}` : "Must have: nothing beyond the product itself",
              "Condition: new only",
              "",
              "Listings (id | store | title):",
              ...lines,
            ].join("\n"),
          },
        ],
      },
      { timeout: FINDER.shortlistTimeoutMs },
    );
    if (usage) {
      usage.input += response.usage.input_tokens;
      usage.output += response.usage.output_tokens;
    }
    if (response.stop_reason === "refusal" || !response.parsed_output) return null;
    return applyShortlistOutput(response.parsed_output, listings);
  } catch (error) {
    logger.warn("finder: shortlist failed", { error: error instanceof Error ? error.message : String(error), ms: Date.now() - t0 });
    return null;
  }
}
