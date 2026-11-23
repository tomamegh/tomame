/**
 * How often the delivery promise was kept (Seamless Roadmap, Initiative 2). Pure.
 *
 * Three promises per delivered order, each compared with the day it was
 * delivered (Accra is UTC, so the ISO date is the local day):
 * - the estimate at payment (`orders.promised_to`, 123);
 * - the first firm date, given with the store's tracking (124);
 * - the last firm date, after any flight move or cancel.
 * Delivered on or before the date counts as kept.
 */

export interface PromiseAccuracyRow {
  orderId: string;
  orderNo: string;
  deliveredOn: string;
  estimateTo: string | null;
  /** Firm dates given, oldest first. */
  firmDates: string[];
}

export type PromiseKind = "estimate" | "firstFirm" | "lastFirm";

export interface PromiseScore {
  /** Delivered orders that were given this promise. */
  given: number;
  kept: number;
  /** Mean days late across the late ones; null when none was late. */
  avgDaysLate: number | null;
  maxDaysLate: number | null;
}

export interface LateOrder {
  orderId: string;
  orderNo: string;
  deliveredOn: string;
  /** The promise it missed: the last firm date if it had one, else the estimate. */
  promisedOn: string;
  promise: "firm" | "estimate";
  daysLate: number;
}

export interface PromiseAccuracy {
  delivered: number;
  scores: Record<PromiseKind, PromiseScore>;
  /** Delivered orders whose firm date changed at least once. */
  redated: number;
  /** Latest delivery first. */
  late: LateOrder[];
}

const DAY = 86_400_000;

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY);
}

function score(pairs: Array<{ promised: string; delivered: string }>): PromiseScore {
  const late = pairs.map((p) => daysBetween(p.promised, p.delivered)).filter((d) => d > 0);
  return {
    given: pairs.length,
    kept: pairs.length - late.length,
    avgDaysLate: late.length ? Math.round((late.reduce((a, b) => a + b, 0) / late.length) * 10) / 10 : null,
    maxDaysLate: late.length ? Math.max(...late) : null,
  };
}

export function promiseAccuracy(rows: readonly PromiseAccuracyRow[], lateLimit = 10): PromiseAccuracy {
  const pick = (date: (r: PromiseAccuracyRow) => string | null | undefined) =>
    rows.flatMap((r) => {
      const promised = date(r);
      return promised ? [{ promised, delivered: r.deliveredOn }] : [];
    });

  const late: LateOrder[] = [];
  for (const r of rows) {
    const firm = r.firmDates.at(-1) ?? null;
    const promisedOn = firm ?? r.estimateTo;
    if (!promisedOn) continue;
    const daysLate = daysBetween(promisedOn, r.deliveredOn);
    if (daysLate > 0) {
      late.push({ orderId: r.orderId, orderNo: r.orderNo, deliveredOn: r.deliveredOn, promisedOn, promise: firm ? "firm" : "estimate", daysLate });
    }
  }
  late.sort((a, b) => b.deliveredOn.localeCompare(a.deliveredOn) || b.daysLate - a.daysLate);

  return {
    delivered: rows.length,
    scores: {
      estimate: score(pick((r) => r.estimateTo)),
      firstFirm: score(pick((r) => r.firmDates[0])),
      lastFirm: score(pick((r) => r.firmDates.at(-1))),
    },
    redated: rows.filter((r) => new Set(r.firmDates).size > 1).length,
    late: late.slice(0, lateLimit),
  };
}

/** "12 of 14 on time", or null when nothing was promised. */
export function describeScore(s: PromiseScore): string | null {
  if (s.given === 0) return null;
  return `${s.kept} of ${s.given} on time`;
}
