import { z } from "zod";

import { TomameCategory } from "@/config/categories";

import { formatGhsCompact } from "./format";
import type { FinderSpec } from "./types";

/**
 * What the model may say about a request, and the guard on what it said.
 *
 * Pure. The model's output is data: it is parsed with this schema and anything
 * that does not fit is treated as "we could not read the request", which ends
 * the run as a calm no-match rather than a crash.
 */

const CATEGORY_VALUES = Object.values(TomameCategory) as [string, ...string[]];

export const FinderSpecOutputSchema = z.object({
  is_product_request: z.boolean().describe("False when the text is not a request for a physical product we could buy."),
  product: z.string().describe("The product in a few words, as a shopper would name it, e.g. 'PS5 Slim Digital Edition'."),
  search_query: z.string().describe("What to type into the store's own search box to find exactly this, 2 to 8 words."),
  must_haves: z.array(z.string()).describe("Short must-have attributes the customer stated: size, colour, storage, model. Empty when none."),
  budget_ghs: z.number().nullable().describe("The customer's stated maximum in Ghana cedis, or null when none was stated."),
  category: z.enum(CATEGORY_VALUES).nullable().describe("The closest category from the list; null when unclear."),
});
export type FinderSpecOutput = z.infer<typeof FinderSpecOutputSchema>;

/** The request as the pipeline uses it: the screen's `FinderSpec` plus what the search needs. */
export interface ParsedFinderSpec extends FinderSpec {
  searchQuery: string;
  category: string | null;
}

const clean = (s: string) => s.replace(/\s+/g, " ").trim();

/**
 * Model output → spec, or null when it is not one we can act on. New-only is
 * always true: the finder never offers used, renewed or open-box stock. A
 * budget typed beside the request wins over one read from the text.
 */
export function parseSpecOutput(raw: unknown, typedBudgetGhs: number | null): ParsedFinderSpec | null {
  const parsed = FinderSpecOutputSchema.safeParse(raw);
  if (!parsed.success) return null;
  const out = parsed.data;
  if (!out.is_product_request) return null;

  const product = clean(out.product).slice(0, 120);
  const searchQuery = clean(out.search_query).slice(0, 120);
  if (product.length < 2 || searchQuery.length < 2) return null;

  const modelBudget = out.budget_ghs != null && Number.isFinite(out.budget_ghs) && out.budget_ghs > 0 ? Math.round(out.budget_ghs) : null;
  const mustHaves = [...new Set(out.must_haves.map(clean).filter((m) => m.length > 0 && m.length <= 60))].slice(0, 6);
  const category = out.category ?? null;

  return {
    product,
    searchQuery,
    mustHaves,
    budgetGhs: typedBudgetGhs ?? modelBudget,
    newOnly: true,
    category,
  };
}

/** A spec stored on a run (a chat turn's search, or a re-driven run) back into the pipeline's shape; null when it is not one. */
export function storedSpec(raw: unknown): ParsedFinderSpec | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.product !== "string" || typeof r.searchQuery !== "string" || r.product.length < 2 || r.searchQuery.length < 2) return null;
  const mustHaves = Array.isArray(r.mustHaves) ? r.mustHaves.filter((m): m is string => typeof m === "string") : [];
  const budgetGhs = typeof r.budgetGhs === "number" && r.budgetGhs > 0 ? r.budgetGhs : null;
  const category = typeof r.category === "string" ? r.category : null;
  return { product: r.product, searchQuery: r.searchQuery, mustHaves, budgetGhs, newOnly: true, category };
}

/**
 * The cache key: same request, same viewer, inside the window → the same run.
 * Case, spacing, punctuation and the currency spelling do not make a request new.
 */
export function normaliseFinderQuery(query: string, budgetGhs: number | null = null): string {
  const text = query
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/gh₵|ghs|ghc|cedis?/g, " ghs ")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return budgetGhs != null ? `${text} | ${budgetGhs}` : text;
}

/** "PS5 Slim Digital Edition, new, up to GH₵9,000 landed": the understand step's summary line. */
export function specSummary(spec: FinderSpec): string {
  const parts = [spec.product, ...spec.mustHaves.filter((m) => !spec.product.toLowerCase().includes(m.toLowerCase())), "new"];
  const line = parts.join(", ");
  return spec.budgetGhs != null ? `${line}, up to ${formatGhsCompact(spec.budgetGhs)} landed` : line;
}
