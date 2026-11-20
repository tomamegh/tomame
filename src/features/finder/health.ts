import type { FinderRunStatus } from "./types";

/**
 * The finder's line in the daily health email (quote-health style). Pure: the
 * query layer hands over the day's runs and the month's search budget.
 */

export interface FinderHealthRunInput {
  status: FinderRunStatus;
  vendor_searches: number;
  started_at: string | null;
  finished_at: string | null;
}

export interface FinderHealth {
  runs: number;
  done: number;
  noMatch: number;
  failed: number;
  /** Still pending or running at the time of the read. */
  open: number;
  /** no_match ÷ settled runs; null with nothing settled. */
  noMatchRate: number | null;
  /** Mean start-to-finish of settled runs, in seconds; null with none. */
  avgSeconds: number | null;
  searches24h: number;
  budget: { used: number; cap: number } | null;
}

export function buildFinderHealth(rows: readonly FinderHealthRunInput[], budget: { used: number; cap: number } | null): FinderHealth {
  const count = (s: FinderRunStatus) => rows.filter((r) => r.status === s).length;
  const done = count("done");
  const noMatch = count("no_match");
  const failed = count("failed");
  const settled = done + noMatch + failed;
  const durations = rows
    .filter((r) => r.started_at && r.finished_at && r.status !== "pending" && r.status !== "running")
    .map((r) => (Date.parse(r.finished_at!) - Date.parse(r.started_at!)) / 1000)
    .filter((s) => Number.isFinite(s) && s >= 0);
  return {
    runs: rows.length,
    done,
    noMatch,
    failed,
    open: rows.length - settled,
    noMatchRate: settled > 0 ? Math.round((noMatch / settled) * 1000) / 1000 : null,
    avgSeconds: durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : null,
    searches24h: rows.reduce((n, r) => n + (r.vendor_searches ?? 0), 0),
    budget,
  };
}

/** "Price finder (24 h): 12 runs, 9 found, 2 no match (18%), 1 failed; average 48 s; store searches 31 today, 140 of 300 this month." */
export function finderHealthLine(h: FinderHealth): string {
  if (h.runs === 0) {
    return `Price finder (24 h): no runs.${h.budget ? ` Store searches this month: ${h.budget.used} of ${h.budget.cap}.` : ""}`;
  }
  const rate = h.noMatchRate != null ? ` (${Math.round(h.noMatchRate * 100)}%)` : "";
  const open = h.open ? `, ${h.open} still running` : "";
  const avg = h.avgSeconds != null ? `; average ${h.avgSeconds} s` : "";
  const budget = h.budget ? `, ${h.budget.used} of ${h.budget.cap} this month` : "";
  return `Price finder (24 h): ${h.runs} run${h.runs === 1 ? "" : "s"}, ${h.done} found, ${h.noMatch} no match${rate}, ${h.failed} failed${open}${avg}; store searches ${h.searches24h} today${budget}.`;
}
