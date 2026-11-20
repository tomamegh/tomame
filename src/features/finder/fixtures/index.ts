import type { FinderEvent } from "../types";
import recorded from "./recorded-run.json";

/**
 * The preview's event streams. `recorded-run.json` is written by
 * `scripts/finder-record-fixture.ts` from local catalogue rows priced by the
 * real calculator; its `meta.howProduced` says exactly what is and is not real.
 * The variants below only re-time or re-flag those same events, so every
 * figure on screen is still one the calculator produced.
 */

export interface RecordedFixtureMeta {
  producedBy: string;
  producedAt: string;
  howProduced: string[];
  exchangeRate: { usdGhsMidMarket: number; provider: string; fetchedAt: string; applied: number };
  catalogueRowIds: string[];
  shortlist: { listings: number; matches: number; withinBudget: number; dropped: Record<string, number> };
}

interface RecordedFixture {
  meta: RecordedFixtureMeta;
  runs: { found: FinderEvent[]; notFound: FinderEvent[] };
}

const fixture = recorded as unknown as RecordedFixture;

export const RECORDED_META: RecordedFixtureMeta = fixture.meta;

/** A run that ends with a best price and two alternatives. */
export const FOUND_RUN: readonly FinderEvent[] = fixture.runs.found;

/** A run that searches, finds nothing it can stand behind, and hands off to a buyer. */
export const NOT_FOUND_RUN: readonly FinderEvent[] = fixture.runs.notFound;

const resultAt = FOUND_RUN.find((e) => e.type === "result_ready")?.at ?? 0;

/** How long after the result the held-back price confirms in the variant below. */
const CONFIRM_DELAY_MS = 8_000;

/**
 * The same run with the two states a result card must handle: the first
 * alternative's price is still being confirmed when the result lands (it
 * confirms a few seconds later), and the second needs a stock check.
 */
export const STILL_CONFIRMING_RUN: readonly FinderEvent[] = (() => {
  const result = FOUND_RUN.find((e) => e.type === "result_ready");
  if (!result || result.type !== "result_ready") return FOUND_RUN;
  const [heldId, stockId] = result.alternativeIds;

  const events: FinderEvent[] = [];
  let held: FinderEvent | null = null;
  for (const e of FOUND_RUN) {
    if (e.type === "candidate_priced" && e.candidateId === heldId) {
      held = e;
      events.push({ type: "price_confirming", at: e.at, candidateId: e.candidateId });
    } else if (e.type === "candidate_priced" && e.candidateId === stockId) {
      events.push({ ...e, stockCheck: true });
    } else if (e.type === "step_done" && e.step === "price") {
      events.push({ ...e, summary: "2 of 3 prices confirmed. Still confirming one with the store." });
    } else {
      events.push(e);
    }
  }
  if (held) events.push({ ...held, at: resultAt + CONFIRM_DELAY_MS });
  return events;
})();

export type FinderScenarioKey = "asking" | "working" | "result" | "confirming" | "nothing_found" | "email";

export interface FinderScenario {
  key: FinderScenarioKey;
  label: string;
  run: readonly FinderEvent[];
  /** Where the clock jumps to; null leaves the run unstarted (the ask screen). */
  jumpTo: number | null;
}

const firstPricedAt = FOUND_RUN.find((e) => e.type === "candidate_priced")?.at ?? 0;
const lastAt = (run: readonly FinderEvent[]) => run.reduce((max, e) => Math.max(max, e.at), 0);

export const FINDER_SCENARIOS: readonly FinderScenario[] = [
  { key: "asking", label: "Asking", run: FOUND_RUN, jumpTo: null },
  { key: "working", label: "Working", run: FOUND_RUN, jumpTo: firstPricedAt + 1_500 },
  { key: "result", label: "Result", run: FOUND_RUN, jumpTo: lastAt(FOUND_RUN) },
  { key: "confirming", label: "Still confirming", run: STILL_CONFIRMING_RUN, jumpTo: resultAt + 400 },
  { key: "nothing_found", label: "Nothing found", run: NOT_FOUND_RUN, jumpTo: lastAt(NOT_FOUND_RUN) },
  { key: "email", label: "Email", run: FOUND_RUN, jumpTo: lastAt(FOUND_RUN) },
];

/** The signed-in customer the preview pretends to be. A sample address, not a real one. */
export const PREVIEW_CUSTOMER_EMAIL = "akosua.mensah@example.com";
