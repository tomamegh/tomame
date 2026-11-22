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
  /** `extractionCacheId` is the stored quote "Add to bag" names; the browser never sends a price. */
  | { type: "candidate_priced"; at: number; candidateId: string; quote: FinderQuote; stockCheck: boolean; extractionCacheId?: string }
  /**
   * A fast answer while the full search runs: an exact match we had already
   * priced, from a store we trust (Amazon, then Walmart), read again just now
   * as new, in stock and with its price confirmed. Kept apart from
   * `candidates` until the result, which ranks it with the rest.
   */
  | { type: "quick_pick"; at: number; candidate: FinderCandidate; quote: FinderQuote; extractionCacheId: string; reason: string }
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
  /** The stored quote behind `quote`, once priced through the extraction chain. */
  extractionCacheId?: string | null;
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
  /** The fast answer, shown while the run works; null until one lands. */
  quickPick: (FinderCandidateState & { reason: string }) | null;
  nothingFound: { message: string; whatsappText: string } | null;
  /** The latest line of narration, for the screen reader live region. */
  narration: string;
}

// ── The live run, as `GET /api/finder/[id]` returns it ──────────────────────

export type FinderRunStatus = "pending" | "running" | "done" | "no_match" | "failed";

export interface FinderRunView {
  id: string;
  status: FinderRunStatus;
  query: string;
  events: FinderEvent[];
  /** Where the result is (or was) emailed; null when we have no address for this viewer. */
  email: string | null;
  /** True when the address is the visitor's own typed one, which they may change. */
  emailEditable: boolean;
  notifyWhatsapp: boolean;
  /** Run time so far (or in total once finished), measured on the server, in ms. */
  elapsedMs: number;
  /** Tomame's buyer line from site settings; null hides the WhatsApp hand-off. */
  buyerWhatsappNumber: string | null;
}

// ── The shopping assistant (107) ────────────────────────────────────────────

export interface FinderChatMessageView {
  id: string;
  role: "user" | "assistant";
  content: string;
  /** The searches this turn started, in the order the items were named. */
  runIds: string[];
  /** 108: the links this turn queued from the customer's message, in the order pasted. */
  pasteIds: string[];
  createdAt: string;
}

export interface FinderChatView {
  id: string;
  title: string;
  /** Where results are emailed; null when we have no address for this viewer. */
  email: string | null;
  /** A visitor types their own address; an account's is fixed. */
  emailEditable: boolean;
  /** 109: the WhatsApp number we reach this customer on (chat's for a visitor, profile's for an account); null asks for it. */
  phone: string | null;
  messages: FinderChatMessageView[];
  /** Every run the chat started, keyed by id, as the run screen reads it. */
  runs: Record<string, FinderRunView>;
  /** Every link pasted in the chat, keyed by id, as the paste queue reports it (108). */
  pastes: Record<string, import("@/features/extraction/services/paste-status").PasteStatus>;
  buyerWhatsappNumber: string | null;
}

/** One line of history: a chat and what its searches found. */
export interface FinderChatSummary {
  id: string;
  title: string;
  updatedAt: string;
  items: { product: string; status: FinderRunStatus; totalGhs: number | null; imageUrl: string | null }[];
}

/** One pasted link in the Chats tab's history (107): the paste queue's own verdict, never a price. */
export interface PastedLinkSummary {
  id: string;
  /** The listing's title once read, else the store's host. */
  title: string;
  storeHost: string;
  outcome: "reading" | "priced" | "unpriced" | "unavailable" | "expired";
  /** The quote when priced, else the paste's row on Buy for me. */
  href: string;
  pastedAt: string;
}
