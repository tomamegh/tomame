/**
 * The AI price finder's event stream and the screen state built from it.
 *
 * Every event is something the server-side job did: the screen narrates the
 * stream and never invents a step, a store or a figure. Every GH₵ amount
 * arrives already calculated by the pricing calculator; nothing here adds,
 * converts or rounds money.
 */

export const FINDER_STEP_KEYS = ["understand", "search", "shortlist", "price", "freight", "compare"] as const;
export type FinderStepKey = (typeof FINDER_STEP_KEYS)[number];

/** What a step reads as before the job has reached it. */
export const FINDER_STEP_PENDING_LABEL: Record<FinderStepKey, string> = {
  understand: "Understand your request",
  search: "Search the stores we buy from",
  shortlist: "Keep only exact matches",
  price: "Check each price at the store",
  freight: "Work out freight to Accra",
  compare: "Compare landed totals",
};

export interface FinderStoreRef {
  id: string;
  name: string;
}

export interface FinderSpec {
  product: string;
  mustHaves: string[];
  budgetGhs: number | null;
  newOnly: boolean;
}

export type FinderBreakdownKey = "item" | "tax" | "fee" | "store_shipping" | "freight" | "customs";

export interface FinderBreakdownRow {
  key: FinderBreakdownKey;
  label: string;
  amountGhs: number;
  /** The working behind the figure: "$39.98 at GH₵15.01 to the dollar". */
  note?: string;
}

export interface FinderQuote {
  totalGhs: number;
  totalUsd: number;
  exchangeRate: number;
  rows: FinderBreakdownRow[];
}

export interface FinderCandidate {
  id: string;
  title: string;
  store: FinderStoreRef;
  productUrl: string;
  imageUrl: string | null;
  condition: "New";
  listingPriceUsd: number;
  seller: string | null;
}

export type FinderEvent =
  | { type: "run_started"; at: number; query: string; budgetGhs: number | null }
  | { type: "step_started"; at: number; step: FinderStepKey; label: string }
  | { type: "step_done"; at: number; step: FinderStepKey; summary: string; details?: string[] }
  | { type: "spec_parsed"; at: number; spec: FinderSpec }
  | { type: "store_search_started"; at: number; store: FinderStoreRef }
  | { type: "store_search_done"; at: number; storeId: string; listings: number }
  | { type: "candidate_found"; at: number; candidate: FinderCandidate }
  | { type: "price_check_started"; at: number; candidateId: string }
  /** The store would not confirm the price yet; the job keeps trying. */
  | { type: "price_confirming"; at: number; candidateId: string }
  | { type: "candidate_priced"; at: number; candidateId: string; quote: FinderQuote; stockCheck: boolean }
  | { type: "result_ready"; at: number; bestId: string; alternativeIds: string[]; why: Record<string, string> }
  | { type: "nothing_found"; at: number; message: string; whatsappText: string };

export type FinderPhase = "asking" | "working" | "result" | "nothing_found";
export type FinderStepStatus = "pending" | "active" | "done";

export interface FinderStepState {
  key: FinderStepKey;
  status: FinderStepStatus;
  label: string;
  details: string[];
}

export interface FinderStoreProgress {
  store: FinderStoreRef;
  status: "searching" | "done";
  listings: number | null;
}

/**
 * - `found`: seen in a search, not yet checked.
 * - `checking`: the price is being read from the store.
 * - `confirming`: the store has not confirmed the price; no total is shown.
 * - `priced`: the calculator's landed total is in `quote`.
 */
export type FinderCandidateStatus = "found" | "checking" | "confirming" | "priced";

export interface FinderCandidateState extends FinderCandidate {
  status: FinderCandidateStatus;
  quote: FinderQuote | null;
  stockCheck: boolean;
  why: string | null;
}

export interface FinderResult {
  bestId: string | null;
  alternativeIds: string[];
}

export interface FinderState {
  phase: FinderPhase;
  query: string | null;
  budgetGhs: number | null;
  /** Event time of `run_started` and of the closing event, in the stream's clock. */
  startedAt: number | null;
  finishedAt: number | null;
  steps: FinderStepState[];
  spec: FinderSpec | null;
  stores: FinderStoreProgress[];
  candidates: FinderCandidateState[];
  result: FinderResult | null;
  nothingFound: { message: string; whatsappText: string } | null;
  /** The latest line of narration, for the screen reader live region. */
  narration: string;
}
