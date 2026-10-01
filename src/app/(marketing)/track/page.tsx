import type { Metadata } from "next";

import { Eyebrow, MARKETING_GUTTER } from "../_components/marketing-primitives";
import { TrackLookup } from "@/features/tracking/components/track-lookup";

export const metadata: Metadata = {
  title: "Track a shipment",
  description: "Follow a Tomame order from the store to your door with its Tomame number.",
};

interface Props {
  searchParams: Promise<{ q?: string | string[] }>;
}

/**
 * `/track` (086) — public, no login. The reference may ride in the URL (it is
 * not personal); the second factor never does, it is POSTed. What a lookup
 * shows, and why a reference alone shows so little, is documented in
 * `features/tracking/public-tracking.ts`.
 *
 * Not under `/app`, so `src/lib/supabase/proxy.ts` lets it and `/api/track`
 * through with no session, like every marketing page.
 */
export default async function TrackPage({ searchParams }: Props) {
  const { q } = await searchParams;
  const initial = typeof q === "string" ? q.slice(0, 120) : "";
  return (
    <div className={`${MARKETING_GUTTER} flex max-w-[960px] flex-col gap-8 py-10 md:py-16`}>
      <header className="flex flex-col gap-3">
        <Eyebrow>Tracking</Eyebrow>
        <h1 className="font-display text-[32px] leading-[1.1] font-bold tracking-[-0.02em] text-tm-ink md:text-[44px]">
          Where is my order?
        </h1>
        <p className="max-w-[60ch] text-[15px] leading-[1.55] text-tm-text-2">
          Enter your Tomame number. It is on your receipt and in every message we send, and starts with TM-.
        </p>
      </header>
      <TrackLookup initialQuery={initial} />
    </div>
  );
}
