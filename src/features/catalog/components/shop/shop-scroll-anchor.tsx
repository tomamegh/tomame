"use client";

import { useEffect, useRef } from "react";

/**
 * Brings the results back into view after a filter, sort or page change —
 * only when they are ABOVE the viewport.
 *
 * Every shop link navigates with `scroll={false}`: Next's default of jumping to
 * the top of the document would throw the customer above the heading, the mode
 * switch and the search box on every tick of a checkbox (the complaint that
 * gave the department row `preserveScroll`). But pressing "Next page" at the
 * bottom of the grid and staying at the bottom of a new page is wrong too. The
 * shop's Suspense boundary is keyed by the address, so this mounts once per
 * answer: if the top of the results has scrolled out above the viewport, it is
 * brought back to just under the nav; otherwise nothing moves. It runs when
 * the rendered address (`token`) changes, not on mount: the App Router keeps
 * this instance across a same-route navigation.
 */
const HEADER_CLEARANCE_PX = 80;
export const SHOP_RESULTS_ID = "shop-results";

export function ShopScrollAnchor({ id, token }: { id: string; token: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const seen = useRef(token);

  useEffect(() => {
    // Not on first paint: a page load (or a back navigation the browser
    // restores) is where the customer is meant to be.
    if (seen.current === token) return;
    seen.current = token;
    // Measured a frame after commit: a boundary that has just come out of its
    // fallback can still be laid out as hidden in the commit that mounts it,
    // and a hidden box reports a top of zero.
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => {
        const el = ref.current;
        if (el) bringResultsIntoView(el);

      });
    });
    return () => cancelAnimationFrame(frame);
  }, [token]);

  return <span ref={ref} id={id} aria-hidden className="block" />;
}

/**
 * Scroll so the results' top sits just under the sticky header — only when it
 * is currently above that line. Shared with the pending state, which calls it
 * the moment a press is made so the skeleton appears where the answer will.
 */
export function bringResultsIntoView(el: HTMLElement | null = document.getElementById(SHOP_RESULTS_ID)) {
  if (!el || el.getBoundingClientRect().top >= HEADER_CLEARANCE_PX - 8) return;
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  // Explicit rather than `scrollIntoView` + scroll-margin: clears the sticky
  // app header (65px) with a little air.
  const top = el.getBoundingClientRect().top + window.scrollY - HEADER_CLEARANCE_PX;
  window.scrollTo({ top: Math.max(0, top), behavior: reduce ? "auto" : "smooth" });
}
