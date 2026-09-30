"use client";

import { useEffect, useRef } from "react";

/**
 * `setInterval`, but only while the page is actually being looked at.
 *
 * Polling hooks reach for this instead of a bare `setInterval`. React Query's
 * `refetchInterval` pauses itself when the window loses focus
 * (`refetchIntervalInBackground` defaults to false); hand-rolled polling does
 * not, and a two-second poll against an endpoint that re-prices a whole bag is
 * not something to leave running in a tab nobody is watching.
 *
 * It fires once immediately on becoming visible again, so a customer returning
 * to the tab sees current state rather than waiting out the next tick.
 */
export function useVisibleInterval(callback: () => void, ms: number, active: boolean): void {
  // Held in a ref so the interval does not tear down and rebuild on every
  // poll-driven re-render — which would reset the timer each tick and, with a
  // fast enough render loop, mean it never fires at all.
  const latest = useRef(callback);
  latest.current = callback;

  useEffect(() => {
    if (!active) return;
    const run = () => latest.current();

    let timer: ReturnType<typeof setInterval> | null = null;

    const stop = () => {
      if (timer !== null) {
        clearInterval(timer);
        timer = null;
      }
    };

    const start = () => {
      if (timer !== null) return;
      timer = setInterval(run, ms);
    };

    const sync = () => {
      if (document.visibilityState === "visible") {
        // Catch up first: whatever happened while the tab was hidden is news.
        run();
        start();
      } else {
        stop();
      }
    };

    if (document.visibilityState === "visible") start();
    document.addEventListener("visibilitychange", sync);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", sync);
    };
  }, [active, ms]);
}

export interface BackoffOptions {
  /** First delay, and the delay again after the page becomes visible. */
  minMs: number;
  /** Ceiling the delay grows to. */
  maxMs: number;
  /** Multiplier applied after every tick. */
  factor: number;
}

/** The delay after `current`: grown by `factor`, capped at `maxMs`. Pure. */
export function nextBackoffDelay(current: number, { minMs, maxMs, factor }: BackoffOptions): number {
  return Math.min(maxMs, Math.max(minMs, Math.round(current * factor)));
}

/**
 * Like `useVisibleInterval`, but each tick waits longer than the last, from
 * `minMs` up to `maxMs`. For a poll whose answer usually lands early and then
 * may take a while: the first few seconds stay responsive, and a slow job does
 * not keep asking every two seconds. Restarts from `minMs` whenever it is
 * re-activated or the tab becomes visible again.
 */
export function useVisibleBackoff(callback: () => void, options: BackoffOptions, active: boolean): void {
  const latest = useRef(callback);
  latest.current = callback;
  const { minMs, maxMs, factor } = options;

  useEffect(() => {
    if (!active) return;
    const opts = { minMs, maxMs, factor };
    let delay = minMs;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const stop = () => {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
    };

    const schedule = () => {
      if (timer !== null) return;
      timer = setTimeout(() => {
        timer = null;
        latest.current();
        delay = nextBackoffDelay(delay, opts);
        schedule();
      }, delay);
    };

    const sync = () => {
      if (document.visibilityState === "visible") {
        latest.current();
        delay = minMs;
        schedule();
      } else {
        stop();
      }
    };

    if (document.visibilityState === "visible") schedule();
    document.addEventListener("visibilitychange", sync);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", sync);
    };
  }, [active, minMs, maxMs, factor]);
}
