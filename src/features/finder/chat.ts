import { priceContextFacts } from "@/features/extraction/price-context";
import { z } from "zod";

import { TomameCategory } from "@/config/categories";

import { formatGhs } from "./format";
import { parseSpecOutput, type ParsedFinderSpec } from "./spec";
import { reduceFinderEvents, selectRankedCandidates } from "./state/reducer";
import type { FinderEvent, FinderRunStatus } from "./types";

/**
 * The shopping assistant's rules that need no network. Pure.
 *
 * The model's turn is data: parsed with this schema, each search through the
 * same guard a one-line request gets (`parseSpecOutput`), and anything that
 * does not fit is dropped rather than searched.
 */

const CATEGORY_VALUES = Object.values(TomameCategory) as [string, ...string[]];

/** Searches one turn may start: enough for a short list, not a shopping spree on our vendor budget. */
export const MAX_SEARCHES_PER_TURN = 4;

export const ChatSearchSchema = z.object({
  product: z.string().describe("The item in a few words, as a shopper would name it, e.g. 'iPhone 17 Pro 256GB unlocked'."),
  search_query: z.string().describe("What to type into a US store's search box for exactly this, 2 to 8 words."),
  must_haves: z.array(z.string()).describe("Attributes the customer stated, plus 'unlocked' for phones. Empty when none."),
  budget_ghs: z.number().nullable().describe("The customer's stated maximum for this item in Ghana cedis, or null."),
  category: z.enum(CATEGORY_VALUES).nullable().describe("The closest category from the list; null when unclear."),
});

export const ChatTurnOutputSchema = z.object({
  reply: z.string().describe("What to say to the customer: short, warm, plain words, at most three sentences."),
  searches: z.array(ChatSearchSchema).describe("One entry per item to search for now. Empty when asking a question first or answering about results."),
});
export type ChatTurnOutput = z.infer<typeof ChatTurnOutputSchema>;

export interface ChatTurn {
  reply: string;
  searches: ParsedFinderSpec[];
}

const clean = (s: string) => s.replace(/\s+/g, " ").trim();

/** Model output → the turn: a reply we can show and the searches that pass the spec guard, de-duplicated. */
export function parseChatTurn(raw: unknown): ChatTurn | null {
  const parsed = ChatTurnOutputSchema.safeParse(raw);
  if (!parsed.success) return null;
  const reply = clean(parsed.data.reply).slice(0, 1_200);
  const seen = new Set<string>();
  const searches: ParsedFinderSpec[] = [];
  for (const s of parsed.data.searches) {
    const spec = parseSpecOutput({ ...s, is_product_request: true }, null);
    if (!spec) continue;
    const key = spec.searchQuery.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    searches.push(spec);
    if (searches.length >= MAX_SEARCHES_PER_TURN) break;
  }
  if (!reply && searches.length === 0) return null;
  return { reply: reply || "Searching for that now.", searches };
}

/** The history list's line for a chat: the first thing asked, trimmed at a word. */
export function chatTitle(firstMessage: string): string {
  const text = clean(firstMessage);
  if (text.length <= 80) return text;
  const cut = text.slice(0, 80);
  const space = cut.lastIndexOf(" ");
  return `${(space > 40 ? cut.slice(0, space) : cut).replace(/[\s,.;:-]+$/, "")}…`;
}

/** What a run's row looks like to the results summary. */
export interface ChatRunSnapshot {
  id: string;
  query: string;
  status: FinderRunStatus;
  events: FinderEvent[];
}

/**
 * The searches' findings in a few lines for the model: item, state, and the
 * ranked results with their landed totals exactly as the calculator gave them.
 */
export function summariseChatRuns(runs: readonly ChatRunSnapshot[]): string | null {
  if (runs.length === 0) return null;
  return runs
    .map((run) => {
      const state = reduceFinderEvents(run.events);
      const item = state.spec?.product ?? run.query;
      if (run.status === "pending" || run.status === "running") return `- ${item}: still searching.`;
      if (state.phase !== "result") return `- ${item}: nothing we could stand behind. ${state.nothingFound?.message ?? ""}`.trim();
      const ranked = selectRankedCandidates(state).slice(0, 3);
      const lines = ranked.map((c, i) => {
        const price = c.quote ? `${formatGhs(c.quote.totalGhs)} landed in Accra` : "price still being confirmed";
        const facts = c.quote ? priceContextFacts(c.priceContext ?? null) : null;
        return `  ${i === 0 ? "best" : `option ${i + 1}`}: ${c.title} at ${c.store.name}, ${price}${facts ? `; ${facts}` : ""}`;
      });
      return [`- ${item}:`, ...lines].join("\n");
    })
    .join("\n");
}

/** The last messages the model is shown: enough for context, bounded in cost. */
export function recentHistory<T extends { role: "user" | "assistant" }>(messages: readonly T[], max = 20): T[] {
  const tail = messages.slice(-max);
  // The API wants a customer message first.
  const first = tail.findIndex((m) => m.role === "user");
  return first <= 0 ? tail : tail.slice(first);
}
