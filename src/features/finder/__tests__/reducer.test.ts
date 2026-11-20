import { describe, expect, it } from "vitest";

import { FOUND_RUN, NOT_FOUND_RUN, STILL_CONFIRMING_RUN } from "../fixtures";
import {
  createInitialFinderState,
  finderReducer,
  reduceFinderEvents,
  selectRankedCandidates,
} from "../state/reducer";
import type { FinderCandidate, FinderEvent, FinderQuote } from "../types";

const store = { id: "ebay", name: "eBay" };

function candidate(id: string): FinderCandidate {
  return {
    id,
    title: `Item ${id}`,
    store,
    productUrl: `https://www.ebay.com/itm/${id}`,
    imageUrl: null,
    condition: "New",
    listingPriceUsd: 10,
    seller: null,
  };
}

function quote(totalGhs: number): FinderQuote {
  return { totalGhs, totalUsd: totalGhs / 15, exchangeRate: 15, rows: [] };
}

const start: FinderEvent = { type: "run_started", at: 0, query: "headphones", budgetGhs: 1500 };

describe("finderReducer", () => {
  it("ignores everything before a run starts", () => {
    const state = finderReducer(createInitialFinderState(), { type: "candidate_found", at: 5, candidate: candidate("a") });
    expect(state).toEqual(createInitialFinderState());
  });

  it("starts a run on the working screen with every step pending", () => {
    const state = reduceFinderEvents([start]);
    expect(state.phase).toBe("working");
    expect(state.query).toBe("headphones");
    expect(state.budgetGhs).toBe(1500);
    expect(state.steps.every((s) => s.status === "pending")).toBe(true);
  });

  it("narrates a step as it starts and replaces the label with the summary when done", () => {
    const active = reduceFinderEvents([start, { type: "step_started", at: 1, step: "search", label: "Searching eBay" }]);
    expect(active.steps.find((s) => s.key === "search")).toMatchObject({ status: "active", label: "Searching eBay" });
    expect(active.narration).toBe("Searching eBay");

    const done = finderReducer(active, { type: "step_done", at: 2, step: "search", summary: "Found 39 listings", details: ["25 not new"] });
    expect(done.steps.find((s) => s.key === "search")).toMatchObject({ status: "done", label: "Found 39 listings", details: ["25 not new"] });
    expect(done.narration).toBe("Found 39 listings");
  });

  it("does not reopen a finished step when a late start arrives", () => {
    const state = reduceFinderEvents([
      start,
      { type: "step_done", at: 2, step: "price", summary: "Checked" },
      { type: "step_started", at: 3, step: "price", label: "Checking" },
    ]);
    expect(state.steps.find((s) => s.key === "price")?.status).toBe("done");
  });

  it("tracks each store from searching to its listing count", () => {
    const state = reduceFinderEvents([
      start,
      { type: "store_search_started", at: 1, store },
      { type: "store_search_started", at: 1, store },
      { type: "store_search_done", at: 2, storeId: "ebay", listings: 39 },
    ]);
    expect(state.stores).toEqual([{ store, status: "done", listings: 39 }]);
  });

  it("adds a candidate once and walks it from found to priced", () => {
    const found = reduceFinderEvents([
      start,
      { type: "candidate_found", at: 1, candidate: candidate("a") },
      { type: "candidate_found", at: 1, candidate: candidate("a") },
    ]);
    expect(found.candidates).toHaveLength(1);
    expect(found.candidates[0]?.status).toBe("found");

    const checking = finderReducer(found, { type: "price_check_started", at: 2, candidateId: "a" });
    expect(checking.candidates[0]?.status).toBe("checking");

    const priced = finderReducer(checking, { type: "candidate_priced", at: 3, candidateId: "a", quote: quote(900), stockCheck: true });
    expect(priced.candidates[0]).toMatchObject({ status: "priced", stockCheck: true, quote: quote(900) });

    // A late "checking" event cannot un-price it.
    expect(finderReducer(priced, { type: "price_check_started", at: 4, candidateId: "a" }).candidates[0]?.status).toBe("priced");
    expect(finderReducer(priced, { type: "price_confirming", at: 4, candidateId: "a" }).candidates[0]?.status).toBe("priced");
  });

  it("shows no total while a price is still being confirmed", () => {
    const state = reduceFinderEvents([
      start,
      { type: "candidate_found", at: 1, candidate: candidate("a") },
      { type: "price_confirming", at: 2, candidateId: "a" },
    ]);
    expect(state.candidates[0]).toMatchObject({ status: "confirming", quote: null });
  });

  it("ranks the result best first and attaches each candidate's reason", () => {
    const state = reduceFinderEvents([
      start,
      { type: "step_started", at: 1, step: "compare", label: "Comparing" },
      ...["a", "b", "c"].map((id, i): FinderEvent => ({ type: "candidate_found", at: 2 + i, candidate: candidate(id) })),
      { type: "candidate_priced", at: 6, candidateId: "a", quote: quote(1200), stockCheck: false },
      { type: "candidate_priced", at: 7, candidateId: "b", quote: quote(900), stockCheck: false },
      { type: "candidate_priced", at: 8, candidateId: "c", quote: quote(1000), stockCheck: false },
      { type: "result_ready", at: 9, bestId: "b", alternativeIds: ["c", "a", "missing"], why: { b: "Lowest" } },
    ]);

    expect(state.phase).toBe("result");
    expect(state.finishedAt).toBe(9);
    expect(state.result).toEqual({ bestId: "b", alternativeIds: ["c", "a"] });
    expect(selectRankedCandidates(state).map((c) => c.id)).toEqual(["b", "c", "a"]);
    expect(state.candidates.find((c) => c.id === "b")?.why).toBe("Lowest");
    // The step that was still running when the result landed is closed.
    expect(state.steps.find((s) => s.key === "compare")?.status).toBe("done");
  });

  it("never makes an unconfirmed price the best pick", () => {
    const state = reduceFinderEvents([
      start,
      { type: "candidate_found", at: 1, candidate: candidate("a") },
      { type: "candidate_found", at: 1, candidate: candidate("b") },
      { type: "candidate_found", at: 1, candidate: candidate("c") },
      { type: "price_confirming", at: 2, candidateId: "a" },
      { type: "candidate_priced", at: 3, candidateId: "b", quote: quote(1100), stockCheck: false },
      { type: "candidate_priced", at: 3, candidateId: "c", quote: quote(1000), stockCheck: false },
      { type: "result_ready", at: 4, bestId: "a", alternativeIds: ["b", "c"], why: {} },
    ]);
    expect(state.result).toEqual({ bestId: "c", alternativeIds: ["a", "b"] });
  });

  it("promotes the first confirmed price when a result arrives with none", () => {
    const shown = reduceFinderEvents([
      start,
      { type: "candidate_found", at: 1, candidate: candidate("a") },
      { type: "price_confirming", at: 2, candidateId: "a" },
      { type: "result_ready", at: 3, bestId: "a", alternativeIds: [], why: {} },
    ]);
    expect(shown.result).toEqual({ bestId: null, alternativeIds: ["a"] });

    const confirmed = finderReducer(shown, { type: "candidate_priced", at: 4, candidateId: "a", quote: quote(800), stockCheck: false });
    expect(confirmed.result).toEqual({ bestId: "a", alternativeIds: [] });
  });

  it("closes on nothing found with the handoff text", () => {
    const state = reduceFinderEvents([
      start,
      { type: "step_started", at: 1, step: "search", label: "Searching" },
      { type: "nothing_found", at: 2, message: "Nothing we can stand behind.", whatsappText: "Please find: PS5" },
    ]);
    expect(state.phase).toBe("nothing_found");
    expect(state.nothingFound).toEqual({ message: "Nothing we can stand behind.", whatsappText: "Please find: PS5" });
    expect(state.narration).toBe("Nothing we can stand behind.");
    expect(state.steps.find((s) => s.key === "search")?.status).toBe("done");
  });

  it("starts fresh when a second run begins", () => {
    const first = reduceFinderEvents([start, { type: "candidate_found", at: 1, candidate: candidate("a") }]);
    const second = finderReducer(first, { ...start, at: 10, query: "scooter" });
    expect(second.candidates).toEqual([]);
    expect(second.query).toBe("scooter");
    expect(second.startedAt).toBe(10);
  });
});

describe("recorded runs", () => {
  it("the found run ends with a priced best pick and two alternatives", () => {
    const state = reduceFinderEvents(FOUND_RUN);
    expect(state.phase).toBe("result");
    const ranked = selectRankedCandidates(state);
    expect(ranked).toHaveLength(3);
    expect(ranked.every((c) => c.status === "priced" && c.quote != null && c.why)).toBe(true);
    const totals = ranked.map((c) => c.quote!.totalGhs);
    expect([...totals].sort((a, b) => a - b)).toEqual(totals);
  });

  it("every breakdown adds up to its landed total", () => {
    for (const c of reduceFinderEvents(FOUND_RUN).candidates) {
      const sum = c.quote!.rows.reduce((acc, r) => acc + r.amountGhs, 0);
      expect(Math.round(sum * 100)).toBe(Math.round(c.quote!.totalGhs * 100));
    }
  });

  it("the still-confirming run holds one price back, then confirms it", () => {
    const resultAt = STILL_CONFIRMING_RUN.find((e) => e.type === "result_ready")!.at;
    const atResult = reduceFinderEvents(STILL_CONFIRMING_RUN.filter((e) => e.at <= resultAt));
    const statuses = selectRankedCandidates(atResult).map((c) => c.status);
    expect(statuses).toEqual(["priced", "confirming", "priced"]);
    expect(selectRankedCandidates(atResult)[2]?.stockCheck).toBe(true);

    const end = reduceFinderEvents(STILL_CONFIRMING_RUN);
    expect(selectRankedCandidates(end).map((c) => c.status)).toEqual(["priced", "priced", "priced"]);
  });

  it("the nothing-found run hands off to a buyer", () => {
    const state = reduceFinderEvents(NOT_FOUND_RUN);
    expect(state.phase).toBe("nothing_found");
    expect(state.nothingFound?.whatsappText).toContain("PS5 Slim digital");
  });
});
