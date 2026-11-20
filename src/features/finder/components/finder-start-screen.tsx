"use client";

import { MotionConfig } from "motion/react";

import { useStartFinder } from "../hooks/useFinder";
import { FinderAsk } from "./finder-ask";

/** `/app/find`: the ask screen on its own. Submitting starts a run and opens it. */
export function FinderStartScreen({ defaultQuery = "", signedIn }: { defaultQuery?: string; signedIn: boolean }) {
  const finder = useStartFinder();
  return (
    <MotionConfig reducedMotion="user">
      <div className="@container w-full">
        <FinderAsk defaultQuery={defaultQuery} notifies={signedIn} pending={finder.pending} onSubmit={(request) => finder.start(request.query, request.budgetGhs)} />
        {finder.error && (
          <p role="alert" className="mx-auto -mt-6 max-w-2xl px-4 pb-8 text-sm font-medium text-destructive @md:px-6">
            {finder.error}
          </p>
        )}
      </div>
    </MotionConfig>
  );
}
