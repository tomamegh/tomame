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
