"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { useAddToBag } from "@/features/bag/hooks/useAddToBag";
import { toast } from "@/lib/sonner";

import { recordFinderHandoff, useFinderRun, useStartFinder, useUpdateFinderContact } from "../hooks/useFinder";
import { reduceFinderEvents } from "../state/reducer";
import type { FinderCandidateState, FinderRunView } from "../types";
import { FinderAsk } from "./finder-ask";
import { FinderExperience } from "./finder-experience";

interface FinderRunScreenProps {
  initial: FinderRunView;
  /** A signed-in customer: the WhatsApp switch is theirs to use. */
  signedIn: boolean;
}

/**
 * `/app/find/[id]`: one run, live. The server's events drive the same
 * reducer and screen as the design preview; nothing here invents a step or
 * a figure. "Add to bag" names the stored quote the run priced, never a price.
 */
export function FinderRunScreen({ initial, signedIn }: FinderRunScreenProps) {
  const router = useRouter();
  const run = useFinderRun(initial);
  const state = useMemo(() => reduceFinderEvents(run.events), [run.events]);
  const contact = useUpdateFinderContact(run.id);
  const addToBag = useAddToBag();
  const finder = useStartFinder();
  const [asking, setAsking] = useState(false);
  const [optIn, setOptIn] = useState(run.notifyWhatsapp);

  // The clock: the server's elapsed time at the last read, run on locally while working.
  const working = run.status === "pending" || run.status === "running";
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!working) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [working]);
  const elapsedMs = working ? run.elapsedMs + Math.max(0, now - run.fetchedAt) : run.elapsedMs;

  async function onAddToBag(candidate: FinderCandidateState) {
    if (!candidate.extractionCacheId) {
      toast.error({ title: "Not ready yet", description: "This price is still being confirmed with the store." });
      throw new Error("not ready");
    }
    try {
      await addToBag.mutateAsync({ extraction_cache_id: candidate.extractionCacheId, quantity: 1 });
      toast.success({ title: "In your bag", description: candidate.title });
      router.refresh();
    } catch (error) {
      toast.error({ title: "Could not add that", description: error instanceof Error ? error.message : "Try again." });
      throw error;
    }
  }

  async function onEmailSubmit(email: string) {
    await contact.mutateAsync({ email });
    toast.success({ title: "Saved", description: working ? `We'll email ${email} when it is ready.` : `We're emailing this to ${email}.` });
  }

  function onOptIn(next: boolean) {
    setOptIn(next);
    contact.mutate({ notify_whatsapp: next }, { onError: () => setOptIn(!next) });
  }

  if (asking) {
    return (
      <div className="@container w-full">
        <FinderAsk notifies={signedIn} pending={finder.pending} onSubmit={(request) => finder.start(request.query, request.budgetGhs)} />
        {finder.error && (
          <p role="alert" className="mx-auto max-w-2xl px-4 text-sm font-medium text-destructive">
            {finder.error}
          </p>
        )}
      </div>
    );
  }

  return (
    <FinderExperience
      flush
      state={state}
      elapsedMs={elapsedMs}
      customerEmail={run.email}
      whatsappOptIn={optIn}
      onWhatsappOptInChange={onOptIn}
      whatsappAvailable={signedIn}
      onEmailSubmit={run.emailEditable ? onEmailSubmit : undefined}
      onSubmit={(request) => finder.start(request.query, request.budgetGhs)}
      onReset={() => setAsking(true)}
      onAddToBag={onAddToBag}
      onHandoff={() => recordFinderHandoff(run.id)}
      buyerWhatsappNumber={run.buyerWhatsappNumber}
    />
  );
}
