/**
 * What an operator has done in the guide (081), kept in this browser only.
 *
 * It is a convenience — a returning operator lands where they left off and the
 * Overview stops offering the tour once it is done — so it lives in
 * localStorage, and every read survives a private window, a blocked store or
 * a value some older build wrote.
 */

export const GUIDE_STORAGE_KEY = "tm.warehouse.guide.v1";

export interface GuideProgress {
  visited: string[];
  practiceDone: boolean;
  quizPassed: boolean;
  quizBest: number;
  checklist: string[];
  tourDismissed: boolean;
}

export const EMPTY_PROGRESS: GuideProgress = Object.freeze({
  visited: [],
  practiceDone: false,
  quizPassed: false,
  quizBest: 0,
  checklist: [],
  tourDismissed: false,
}) as GuideProgress;

function strings(value: unknown): string[] {
  return Array.isArray(value) ? [...new Set(value.filter((v): v is string => typeof v === "string"))].slice(0, 64) : [];
}

export function parseProgress(raw: string | null | undefined): GuideProgress {
  if (!raw) return EMPTY_PROGRESS;
  try {
    const data = JSON.parse(raw) as Record<string, unknown>;
    if (!data || typeof data !== "object") return EMPTY_PROGRESS;
    return {
      visited: strings(data.visited),
      practiceDone: data.practiceDone === true,
      quizPassed: data.quizPassed === true,
      quizBest: typeof data.quizBest === "number" && Number.isFinite(data.quizBest) ? Math.max(0, Math.floor(data.quizBest)) : 0,
      checklist: strings(data.checklist),
      tourDismissed: data.tourDismissed === true,
    };
  } catch {
    return EMPTY_PROGRESS;
  }
}

/** Share of the guide's sections an operator has read, 0–100. */
export function readPercent(progress: GuideProgress, sectionIds: readonly string[]): number {
  if (sectionIds.length === 0) return 0;
  const seen = sectionIds.filter((id) => progress.visited.includes(id)).length;
  return Math.round((seen / sectionIds.length) * 100);
}

/** Done means practised and passed — reading alone is not the bar. */
export function isGuideComplete(progress: GuideProgress): boolean {
  return progress.practiceDone && progress.quizPassed;
}

export function markVisited(progress: GuideProgress, id: string): GuideProgress {
  return progress.visited.includes(id) ? progress : { ...progress, visited: [...progress.visited, id] };
}

export function toggleChecklist(progress: GuideProgress, id: string): GuideProgress {
  const on = progress.checklist.includes(id);
  return { ...progress, checklist: on ? progress.checklist.filter((c) => c !== id) : [...progress.checklist, id] };
}

export function markPracticeDone(progress: GuideProgress): GuideProgress {
  return progress.practiceDone ? progress : { ...progress, practiceDone: true };
}

/** Keep the best score; a pass is never taken away by a later attempt. */
export function recordQuiz(progress: GuideProgress, correct: number, passed: boolean): GuideProgress {
  const quizBest = Math.max(progress.quizBest, correct);
  const quizPassed = progress.quizPassed || passed;
  if (quizBest === progress.quizBest && quizPassed === progress.quizPassed) return progress;
  return { ...progress, quizBest, quizPassed };
}

export function dismissTour(progress: GuideProgress): GuideProgress {
  return progress.tourDismissed ? progress : { ...progress, tourDismissed: true };
}
