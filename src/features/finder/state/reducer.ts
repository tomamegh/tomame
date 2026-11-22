import {
  FINDER_STEP_KEYS,
  FINDER_STEP_PENDING_LABEL,
  type FinderCandidateState,
  type FinderEvent,
  type FinderResult,
  type FinderState,
  type FinderStepState,
} from "../types";

/**
 * Event stream → screen state. Pure, so the live job and the recorded preview
 * drive the same screen, and so a replayed or duplicated event changes nothing.
 */

function pendingSteps(): FinderStepState[] {
  return FINDER_STEP_KEYS.map((key) => ({
    key,
    status: "pending",
    label: FINDER_STEP_PENDING_LABEL[key],
    details: [],
  }));
}

export function createInitialFinderState(): FinderState {
  return {
    phase: "asking",
    query: null,
    budgetGhs: null,
    startedAt: null,
    finishedAt: null,
    steps: pendingSteps(),
    spec: null,
    stores: [],
    candidates: [],
    result: null,
    quickPick: null,
    nothingFound: null,
    narration: "",
  };
}

function updateCandidate(
  state: FinderState,
  id: string,
  update: (c: FinderCandidateState) => FinderCandidateState,
): FinderCandidateState[] {
  return state.candidates.map((c) => (c.id === id ? update(c) : c));
}

/** Any step still running when the job closes has, by definition, finished. */
function closeActiveSteps(steps: FinderStepState[]): FinderStepState[] {
  return steps.map((s) => (s.status === "active" ? { ...s, status: "done" } : s));
}

/**
 * The best pick must carry a confirmed total and need no stock check. If the
 * job names one that does not, the cheapest such candidate it listed takes its
 * place, and the named one stays an alternative.
 */
function resolveResult(candidates: FinderCandidateState[], bestId: string, alternativeIds: string[]): FinderResult {
  const byId = new Map(candidates.map((c) => [c.id, c]));
  const listed = [bestId, ...alternativeIds].filter((id, i, all) => byId.has(id) && all.indexOf(id) === i);
  const named = byId.get(bestId);

  const eligible = (c: FinderCandidateState | undefined) => c?.status === "priced" && c.quote != null && !c.stockCheck;
  let best: string | null = eligible(named) ? bestId : null;
  if (best == null) {
    const priced = listed
      .map((id) => byId.get(id)!)
      .filter((c) => eligible(c))
      .sort((a, b) => a.quote!.totalGhs - b.quote!.totalGhs);
    best = priced[0]?.id ?? null;
  }
  return { bestId: best, alternativeIds: listed.filter((id) => id !== best) };
}

export function finderReducer(state: FinderState, event: FinderEvent): FinderState {
  if (event.type === "run_started") {
    return {
      ...createInitialFinderState(),
      phase: "working",
      query: event.query,
      budgetGhs: event.budgetGhs,
      startedAt: event.at,
    };
  }
  // Nothing belongs to a run that has not started.
  if (state.phase === "asking") return state;

  switch (event.type) {
    case "step_started":
      return {
        ...state,
        steps: state.steps.map((s) =>
          s.key === event.step && s.status !== "done" ? { ...s, status: "active", label: event.label } : s,
        ),
        narration: event.label,
      };

    case "step_done":
      return {
        ...state,
        steps: state.steps.map((s) =>
          s.key === event.step ? { ...s, status: "done", label: event.summary, details: event.details ?? [] } : s,
        ),
        narration: event.summary,
      };

    case "spec_parsed":
      return { ...state, spec: event.spec };

    case "store_search_started":
      if (state.stores.some((s) => s.store.id === event.store.id)) return state;
      return { ...state, stores: [...state.stores, { store: event.store, status: "searching", listings: null }] };

    case "store_search_done":
      return {
        ...state,
        stores: state.stores.map((s) =>
          s.store.id === event.storeId ? { ...s, status: "done", listings: event.listings } : s,
        ),
      };

    case "candidate_found":
      if (state.candidates.some((c) => c.id === event.candidate.id)) return state;
      return {
        ...state,
        candidates: [
          ...state.candidates,
          { ...event.candidate, status: "found", quote: null, stockCheck: false, why: null },
        ],
      };

    case "price_check_started":
      return {
        ...state,
        candidates: updateCandidate(state, event.candidateId, (c) =>
          c.status === "found" ? { ...c, status: "checking" } : c,
        ),
      };

    case "price_confirming":
      return {
        ...state,
        candidates: updateCandidate(state, event.candidateId, (c) =>
          c.status === "priced" ? c : { ...c, status: "confirming", quote: null },
        ),
      };

    case "candidate_priced": {
      const candidates = updateCandidate(state, event.candidateId, (c) => ({
        ...c,
        status: "priced",
        quote: event.quote,
        priceContext: event.priceContext ?? c.priceContext ?? null,
        stockCheck: event.stockCheck,
        extractionCacheId: event.extractionCacheId ?? c.extractionCacheId ?? null,
      }));
      // A result shown without a best pick gets one as soon as a price lands.
      const result =
        state.result && state.result.bestId == null
          ? resolveResult(candidates, state.result.alternativeIds[0] ?? event.candidateId, state.result.alternativeIds)
          : state.result;
      return { ...state, candidates, result };
    }

    case "quick_pick":
      return {
        ...state,
        quickPick: {
          ...event.candidate,
          status: "priced",
          quote: event.quote,
          priceContext: event.priceContext ?? null,
          stockCheck: false,
          why: null,
          extractionCacheId: event.extractionCacheId,
          reason: event.reason,
        },
        narration: `Ready now: ${event.candidate.title} at ${event.candidate.store.name}. Still looking for a better price.`,
      };

    case "result_ready": {
      const candidates = state.candidates.map((c) => ({ ...c, why: event.why[c.id] ?? c.why }));
      return {
        ...state,
        phase: "result",
        finishedAt: event.at,
        steps: closeActiveSteps(state.steps),
        candidates,
        result: resolveResult(candidates, event.bestId, event.alternativeIds),
        specNote: event.specNote ?? null,
        narration: "Your results are ready.",
      };
    }

    case "nothing_found":
      return {
        ...state,
        phase: "nothing_found",
        finishedAt: event.at,
        steps: closeActiveSteps(state.steps),
        nothingFound: { message: event.message, whatsappText: event.whatsappText },
        narration: event.message,
      };
  }
}

export function reduceFinderEvents(events: readonly FinderEvent[]): FinderState {
  return events.reduce(finderReducer, createInitialFinderState());
}

/** The result's candidates in the order to show them: best first, then alternatives. */
export function selectRankedCandidates(state: FinderState): FinderCandidateState[] {
  if (!state.result) return state.candidates;
  const byId = new Map(state.candidates.map((c) => [c.id, c]));
  const ids = state.result.bestId ? [state.result.bestId, ...state.result.alternativeIds] : state.result.alternativeIds;
  return ids.map((id) => byId.get(id)).filter((c): c is FinderCandidateState => c != null);
}
