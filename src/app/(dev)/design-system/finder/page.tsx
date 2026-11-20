import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { finderResultTemplate } from "@/features/finder/email/finder-result-email";
import { FOUND_RUN, RECORDED_META } from "@/features/finder/fixtures";
import { reduceFinderEvents, selectRankedCandidates } from "@/features/finder/state/reducer";

import { FinderPreview } from "./_components/finder-preview";

export const metadata: Metadata = {
  title: "Price finder preview",
  robots: { index: false, follow: false },
};

/**
 * Sign-off preview of "Tell us what you want", the AI price finder: the real
 * components, driven by a recorded event stream instead of the (not yet
 * built) backend. Dev-only, like the rest of this route group.
 */
export default function FinderPreviewPage() {
  if (process.env.NODE_ENV === "production") notFound();

  const finished = reduceFinderEvents(FOUND_RUN);
  const [best, ...alternatives] = selectRankedCandidates(finished);
  if (!best || !finished.query) notFound();
  const email = finderResultTemplate({ query: finished.query, best, alternatives });

  return (
    <main className="flex min-h-dvh flex-col gap-8 px-4 pb-48 pt-10">
      <header className="mx-auto flex w-full max-w-[1180px] flex-col gap-3">
        <h1 className="text-[32px] font-extrabold leading-[1.05]">Price finder preview</h1>
        <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
          The finder&apos;s real components played from a recorded run, for sign-off before the backend is built. Use
          the controls at the bottom right to play, pause, change speed and jump between states.
        </p>
        <details className="max-w-2xl rounded-2xl border border-border bg-card px-4 py-3 text-[13px] leading-relaxed">
          <summary className="cursor-pointer font-semibold">How the recorded run was made</summary>
          <ul className="mt-2 flex list-disc flex-col gap-1.5 pl-5 text-muted-foreground">
            {RECORDED_META.howProduced.map((line) => (
              <li key={line}>{line}</li>
            ))}
            <li>
              Rate: $1 = GH₵{RECORDED_META.exchangeRate.usdGhsMidMarket} mid-market ({RECORDED_META.exchangeRate.provider}),
              GH₵{RECORDED_META.exchangeRate.applied} with the FX buffer. Produced by{" "}
              <code className="text-[12px]">{RECORDED_META.producedBy}</code>.
            </li>
          </ul>
        </details>
      </header>
      <FinderPreview email={{ subject: email.subject, html: email.html }} />
    </main>
  );
}
