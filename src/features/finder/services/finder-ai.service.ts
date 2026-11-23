import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";

import { FINDER } from "@/config/finder";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";

import { applyShortlistOutput, ShortlistOutputSchema, type FinderListing, type ShortlistResult } from "../shortlist";
import { parseSpecNote, SpecNoteOutputSchema, type SpreadOption } from "../spec-spread";
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
  "search_query: what to type into a US store's search box to find exactly that item, without prices or budget words. Use the name stores sell it under: when the shopper names a product by its use or a nickname (\"Kirkland beard spray\"), search its real name (\"Kirkland Minoxidil 5%\") and keep the shopper's words in product.",
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
  "Phones, tablets and watches locked to a US carrier (Verizon, AT&T, T-Mobile, Cricket, Boost...) are not matches unless the title says unlocked or the shopper named that carrier: a locked phone will not work in Ghana.",
  "Variants that the shopper did not constrain (colour when no colour was asked) are matches.",
  "Answer with listing ids only. Put the closest matches first.",
  "likely_meant: only when NO listing is a match. Shoppers often name a product by its use, a nickname or a description instead of its real name (\"Kirkland beard spray\" is Kirkland Minoxidil 5%; \"the PlayStation with no disc\" is the PS5 Digital Edition). If some listings are almost certainly what they mean, give their ids, the product's real name, and one short reason in plain words. A pack size the product is normally sold in (a 6-month supply) is fine here. Never use it for a merely similar product, a different brand, or a guess; when unsure, null.",
].join("\n");

/** Listings → the exact matches by id, with the model's reason for each rejection. Null on any failure. */
export async function shortlistListings(
  spec: ParsedFinderSpec,
  listings: readonly FinderListing[],
  usage?: TokenUsage,
): Promise<ShortlistResult | null> {
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

const SPEC_NOTE_SYSTEM = [
  "You help a shopper in Ghana understand why the options found for one request cost such different amounts.",
  "You get the request and each option's store, title and landed total in cedis, cheapest first.",
  "Write at most two short sentences in plain words: what makes the dearer options dearer, by the spec their titles state (panel type such as OLED vs LED or QNED, model or series, model year, size, storage, generation), and what that means for the shopper in everyday terms.",
  "Use only what the titles say plus the common meaning of those terms. Never invent a spec, a feature, a rating or a price; never say which to buy; never mention discounts.",
  "If the titles do not show what differs, say they are different models and the shopper can choose by budget.",
  "Write the totals exactly as given when you mention one.",
].join("\n");

/** Why the found options differ so much in price, from their titles. Null on any failure or nothing to say. */
export async function explainSpecSpread(product: string, options: readonly SpreadOption[], timeoutMs: number, usage?: TokenUsage): Promise<string | null> {
  const anthropic = getClient();
  if (!anthropic || options.length < 2 || timeoutMs < 1_000) return null;
  const t0 = Date.now();
  const lines = options.map((o) => `${o.store} | ${o.title} | GH₵${o.totalGhs.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
  try {
    const response = await anthropic.messages.parse(
      {
        model: FINDER.model,
        max_tokens: 600,
        output_config: { effort: "low", format: zodOutputFormat(SpecNoteOutputSchema) },
        system: SPEC_NOTE_SYSTEM,
        messages: [{ role: "user", content: [`Requested: ${product}`, "", "Options (store | title | landed total), cheapest first:", ...lines].join("\n") }],
      },
      { timeout: timeoutMs },
    );
    if (usage) {
      usage.input += response.usage.input_tokens;
      usage.output += response.usage.output_tokens;
    }
    if (response.stop_reason === "refusal") return null;
    return parseSpecNote(response.parsed_output);
  } catch (error) {
    logger.warn("finder: spec note failed", { error: error instanceof Error ? error.message : String(error), ms: Date.now() - t0 });
    return null;
  }
}
