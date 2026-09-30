"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";

import { BUY_FOR_ME_PATH } from "@/features/extraction/components/buy-for-me-mode";
import { bringResultsIntoView } from "./shop-scroll-anchor";

/**
 * The shop's "working on it" state between a press and the answer.
 *
 * Every filter, sort and page is a server navigation, and the App Router keeps
 * the old page on screen until the new one arrives — which on a slow phone
 * reads as "that did nothing" under a chip that has already changed its mind.
 * So the root notices the press (a link into the shop, or one of the shop's
 * forms submitting — portals included, since React events bubble through
 * them) and the results swap to skeleton cards until the next `token` (the
 * address the server rendered) lands.
 */
const PendingContext = createContext(false);

export function ShopPendingRoot({
  token,
  children,
}: {
  token: string;
  children: React.ReactNode;
}) {
  const [pending, setPending] = useState(false);
  const last = useRef(token);

  useEffect(() => {
    if (last.current === token) return;
    last.current = token;
    setPending(false);
  }, [token]);

  // A press that lands on the same address never changes the token; never
  // leave the grid behind a skeleton for it.
  useEffect(() => {
    if (!pending) return;
    const timer = setTimeout(() => setPending(false), 10_000);
    return () => clearTimeout(timer);
  }, [pending]);

  return (
    <PendingContext.Provider value={pending}>
      <div
        className="contents"
        onClickCapture={(e) => {
          if (
            e.defaultPrevented ||
            e.button !== 0 ||
            e.metaKey ||
            e.ctrlKey ||
            e.shiftKey ||
            e.altKey
          )
            return;
          const anchor = (e.target as HTMLElement).closest("a");
          const href = anchor?.getAttribute("href");
          if (!href || !href.startsWith(`${BUY_FOR_ME_PATH}?mode=browse`))
            return;
          if (href === token) return;
          setPending(true);
          bringResultsIntoView();
        }}
        onSubmitCapture={(e) => {
          if ((e.target as HTMLFormElement).dataset.shopForm != null)
            setPending(true);
          bringResultsIntoView();
        }}
      >
        {children}
      </div>
    </PendingContext.Provider>
  );
}

/** Stands in for the results while a new answer is on its way. */
export function ShopPendingResults({
  fallback,
  children,
}: {
  fallback: React.ReactNode;
  children: React.ReactNode;
}) {
  const pending = useContext(PendingContext);
  return (
    <div
      aria-busy={pending || undefined}
      className="flex min-w-0 flex-col gap-6"
    >
      {pending ? fallback : children}
    </div>
  );
}
