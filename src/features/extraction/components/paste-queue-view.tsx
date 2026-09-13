"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  ArrowsClockwise,
  ChatCircleText,
  CheckCircle,
  LinkSimple,
  Tote,
  WarningCircle,
} from "@phosphor-icons/react/ssr";

import { AssistedRequestDialog } from "@/features/assisted/components";
import { describePendingWait, hostOf, type PendingWait } from "@/features/bag/components/format";
import type { BagLinePending } from "@/features/bag/types";
import { ApiFetchError } from "@/lib/auth/api-helpers";
import { toast } from "@/lib/sonner";
import { cn } from "@/lib/utils";
import { useAddPasteToBag, useCreatePaste, usePastes } from "../hooks/usePastes";
import type { PasteStatus } from "../services/paste-status";
import { ReadingIndicator } from "./reading-indicator";

export interface PasteQueueViewProps {
  /** The viewer's recent pastes, server-rendered so the list is there on first paint. */
  initialPastes: PasteStatus[];
  /** Store display names from the scraper registry — never a literal list in JSX. */
  stores: readonly string[];
  /** Server render time, ISO. The wait copy is struck from this so SSR and hydration agree. */
  renderedAt: string;
  /**
   * A paste to follow to its price — `?watch=<id>`, set by the `?url=` path
   * after it queues a link. The screen forwards to the quote the moment that
   * row is priced, so a link pasted on Home still lands on its price.
   */
  watchId?: string | null;
  /** Whether a finished paste will reach this viewer by bell and email — signed-in only. */
  notifies?: boolean;
}

/**
 * "Buy for me" — `/app/orders/new`.
 *
 * This route used to be a dead click. With no `?url=` it did
 * `router.replace("/app")`, so the nav tab appeared to do nothing at all; with a
 * `?url=` it was a spinner you could not leave. Both are gone: pasting queues the
 * link (049) and answers immediately, and this screen is where the queue lives.
 *
 * Nothing here waits. A link is added, it reads in the background, and the
 * customer can paste the next one or walk away entirely — the bag will have the
 * price when they come back, and a signed-in customer is told when it lands.
 *
 * The one thing it does on the customer's behalf: the link they JUST pasted is
 * followed, and forwarded to its price the moment it is priced — as long as
 * they have not started typing the next one, because pulling a screen out from
 * under a half-typed URL is worse than one extra click.
 */
export function PasteQueueView({
  initialPastes,
  stores,
  renderedAt,
  watchId: initialWatchId = null,
  notifies = false,
}: PasteQueueViewProps) {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [describing, setDescribing] = useState<PasteStatus | null>(null);
  // WHICH row is being re-read, not merely that one is: `createPaste.isPending`
  // is one mutation shared by the screen, so keying the spinner off it put every
  // lapsed row into the reading state at once.
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [watchId, setWatchId] = useState<string | null>(initialWatchId);

  const { data: pastes } = usePastes(initialPastes);
  const createPaste = useCreatePaste();
  const addToBag = useAddPasteToBag();

  // The first paint is the server's instant so hydration matches; after mount the
  // clock is simply the real one.
  //
  // It used to advance from `renderedAt` plus time-since-mount, to sidestep
  // client clock skew. That is wrong for anything queued AFTER the page was
  // rendered: a paste created at 14:39 measured against a clock still reading
  // 14:35 has NEGATIVE elapsed time, so the copy sat on "Reading this page…"
  // forever and the 5 s and 20 s marks never arrived. Skew of a few seconds is
  // the lesser evil, and the customer's own sense of "how long have I waited"
  // runs on their clock anyway.
  const [now, setNow] = useState(() => new Date(renderedAt));
  const anyReading = pastes.some((p) => p.outcome === "reading");
  useEffect(() => {
    setNow(new Date());
    if (!anyReading) return;
    const id = setInterval(() => setNow(new Date()), 1_000);
    return () => clearInterval(id);
  }, [anyReading]);

  // Follow the watched paste. Once it settles, the watch is over whichever way
  // it went: a priced quote is opened; anything else stays on this screen where
  // its row explains itself and offers the way out.
  const typing = url.trim().length > 0;
  useEffect(() => {
    if (!watchId) return;
    const watched = pastes.find((p) => p.id === watchId);
    if (!watched || watched.outcome === "reading") return;

    setWatchId(null);
    if (watched.outcome === "priced" && watched.extraction_cache_id && !typing) {
      router.replace(`/app/orders/review/${watched.extraction_cache_id}`);
      return;
    }
    // Drop `?watch=` so a reload does not re-arm a watch that has already ended.
    if (initialWatchId && typeof window !== "undefined") {
      window.history.replaceState(null, "", "/app/orders/new");
    }
  }, [pastes, watchId, typing, router, initialWatchId]);

  const onPaste = useCallback(() => {
    const trimmed = url.trim();
    if (!trimmed) return;
    createPaste.mutate(
      { product_url: trimmed },
      {
        onSuccess: (paste) => {
          setUrl("");
          // Already read? Go straight to the price — making someone wait on a
          // screen for something we already hold would be perverse.
          // Only a PRICED quote has somewhere to go. A link that was read but
          // never priced, or whose quote has lapsed, stays on this screen where
          // the row says so and offers the way out.
          if (paste.outcome === "priced" && paste.extraction_cache_id) {
            router.push(`/app/orders/review/${paste.extraction_cache_id}`);
            return;
          }
          if (paste.outcome === "reading") setWatchId(paste.id);
        },
        onError: (error) => {
          if (error instanceof ApiFetchError && error.status === 429) {
            toast.error({ title: "Steady on", description: "That is a lot of links. Try again in a few minutes." });
            return;
          }
          toast.error({ title: "Could not read that link", description: error.message });
        },
      },
    );
  }, [createPaste, router, url]);

  const onAddToBag = useCallback(
    (paste: PasteStatus) => {
      addToBag.mutate(
        { extraction_request_id: paste.id, quantity: 1 },
        {
          onSuccess: () => {
            toast.success({ title: "In your bag", description: "We'll price it there as soon as we have it." });
            router.refresh();
          },
          onError: (error) => toast.error({ title: "Could not add that", description: error.message }),
        },
      );
    },
    [addToBag, router],
  );

  /** A lapsed quote is re-read by pasting it again — same link, fresh job. */
  const onRetry = useCallback(
    (paste: PasteStatus) => {
      setRetryingId(paste.id);
      createPaste.mutate(
        { product_url: paste.product_url },
        {
          onSuccess: (next) => {
            if (next.outcome === "priced" && next.extraction_cache_id) {
              router.push(`/app/orders/review/${next.extraction_cache_id}`);
              return;
            }
            if (next.outcome === "reading") setWatchId(next.id);
          },
          onError: (error) => toast.error({ title: "Could not read that link", description: error.message }),
          onSettled: () => setRetryingId(null),
        },
      );
    },
    [createPaste, router],
  );

  const { reading, done } = useMemo(() => splitPastes(pastes), [pastes]);

  const rowProps = (paste: PasteStatus) => ({
    paste,
    now,
    notifies,
    onDescribe: () => setDescribing(paste),
    onAddToBag: () => onAddToBag(paste),
    onRetry: () => onRetry(paste),
    busy: addToBag.isPending,
    retrying: retryingId === paste.id,
  });

  return (
    <div className="flex flex-col gap-7">
      <header className="tm-up flex flex-col gap-2 [animation-duration:0.5s]">
        <h1 className="font-display text-[30px] leading-[1.05] font-bold tracking-[-0.02em] sm:text-[38px]">
          What should we buy for you?
        </h1>
        <p className="text-sm leading-[1.5] text-tm-text-2">
          Paste a link from {stores.slice(0, 3).join(", ")} or anywhere else. We read it in the
          background — add as many as you like and come back when you are ready.
        </p>
      </header>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          onPaste();
        }}
        className="tm-up flex flex-col gap-2.5 sm:flex-row [animation-delay:0.06s] [animation-duration:0.5s]"
      >
        <label className="sr-only" htmlFor="paste-url">
          Product link
        </label>
        <div className="flex h-[52px] flex-1 items-center gap-2.5 rounded-[14px] border border-tm-border bg-card px-4">
          <LinkSimple className="size-[18px] shrink-0 text-tm-coral" aria-hidden />
          <input
            id="paste-url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            inputMode="url"
            placeholder="https://…"
            className="min-w-0 flex-1 bg-transparent text-[15px] leading-none outline-none placeholder:text-tm-text-3"
          />
        </div>
        <button
          type="submit"
          disabled={!url.trim() || createPaste.isPending}
          className={cn(
            "tm-cta-gradient flex h-[52px] items-center justify-center gap-2 rounded-[14px] px-6 text-[15px] leading-none font-bold text-white",
            "transition-opacity disabled:cursor-not-allowed disabled:opacity-60",
          )}
        >
          {createPaste.isPending ? "Adding…" : "Read this link"}
          {!createPaste.isPending && <ArrowRight weight="bold" className="size-4" aria-hidden />}
        </button>
      </form>

      {reading.length > 0 && (
        <Group label={`Reading now · ${reading.length}`} delay={0.12}>
          {reading.map((paste) => (
            <PasteRow key={paste.id} {...rowProps(paste)} />
          ))}
        </Group>
      )}

      {done.length > 0 && (
        <Group label="Recently pasted" delay={0.18}>
          {done.map((paste) => (
            <PasteRow key={paste.id} {...rowProps(paste)} />
          ))}
        </Group>
      )}

      {pastes.length === 0 && (
        <p className="tm-up rounded-[24px] border border-tm-border bg-card px-6 py-12 text-center text-sm leading-[1.5] text-tm-text-2 [animation-delay:0.12s] [animation-duration:0.5s]">
          Nothing pasted yet. Drop a product link above and we will price it in cedis, all in.
        </p>
      )}

      <AssistedRequestDialog
        open={describing != null}
        onOpenChange={(next) => !next && setDescribing(null)}
        extractionRequestId={describing?.id ?? null}
        productUrl={describing?.product_url ?? null}
        displayUrl={describing?.product_url ?? ""}
      />
    </div>
  );
}

/**
 * Still-reading links first, because they are the ones the customer is waiting
 * on. Everything else keeps the server's newest-first order.
 */
function splitPastes(pastes: PasteStatus[]): { reading: PasteStatus[]; done: PasteStatus[] } {
  const reading: PasteStatus[] = [];
  const done: PasteStatus[] = [];
  for (const paste of pastes) {
    if (paste.outcome === "reading") reading.push(paste);
    else done.push(paste);
  }
  return { reading, done };
}

const ROW_ACTION = cn(
  "inline-flex h-10 items-center gap-1.5 rounded-xl border-[1.5px] border-tm-border bg-card px-4",
  "text-[13px] leading-none font-semibold transition-colors hover:bg-tm-tint",
  "disabled:cursor-not-allowed disabled:opacity-50",
);

/**
 * What to say about a link whose job has finished. Three settled states, three
 * different things the customer should be offered — collapsing them into one
 * "ready" is what let the screen promise a price it did not have.
 */
const SETTLED_COPY: Record<
  Exclude<PasteStatus["outcome"], "reading">,
  { label: string; tone: "green" | "amber" }
> = {
  priced: { label: "Priced and ready", tone: "green" },
  unpriced: { label: "We read the page but found no price", tone: "amber" },
  expired: { label: "This quote has lapsed", tone: "amber" },
};

function Group({ label, delay, children }: { label: string; delay: number; children: React.ReactNode }) {
  return (
    <section
      aria-label={label}
      className="tm-up overflow-hidden rounded-[24px] border border-tm-border bg-card [animation-duration:0.5s]"
      style={{ animationDelay: `${delay}s` }}
    >
      <header className="px-[18px] py-4 text-sm leading-none font-bold text-tm-text-2 lg:px-[22px]">
        {label}
      </header>
      <ul>{children}</ul>
    </section>
  );
}

/** Whole seconds since the paste was queued, never negative. */
function secondsSince(iso: string, now: Date): number {
  const ms = now.getTime() - new Date(iso).getTime();
  return Number.isFinite(ms) && ms > 0 ? Math.floor(ms / 1000) : 0;
}

/**
 * One pasted link. The states it can be in are the things a customer can do
 * next: wait, look at the price, ask a person — or, once a person has it,
 * nothing at all except read who has it.
 */
function PasteRow({
  paste,
  now,
  notifies,
  onDescribe,
  onAddToBag,
  onRetry,
  busy,
  retrying,
}: {
  paste: PasteStatus;
  now: Date;
  notifies: boolean;
  onDescribe: () => void;
  onAddToBag: () => void;
  onRetry: () => void;
  busy: boolean;
  retrying: boolean;
}) {
  const priced = paste.outcome === "priced" && !!paste.extraction_cache_id;
  const host = hostOf(paste.product_url);

  // The same copy the bag uses, from the same helper, so a link cannot be
  // described one way here and another way there. An open assisted request
  // wins over everything — see `describePendingWait`.
  const wait: PendingWait | null =
    paste.outcome === "reading" || paste.assisted
      ? describePendingWait(
          {
            request_id: paste.id,
            status: paste.status === "running" ? "running" : paste.status === "failed" ? "failed" : "pending",
            error: paste.error,
            queued_at: paste.created_at,
            assisted_open: paste.assisted != null,
          } satisfies BagLinePending,
          now,
          { notifies },
        )
      : null;
  const settled = wait || paste.outcome === "reading" ? null : SETTLED_COPY[paste.outcome];
  const assisted = wait?.phase === "assisted";

  // A row still being read is the one thing on this screen that has to LOOK
  // alive. It gets the full indicator; settled rows get a line of text.
  if (wait && !assisted) {
    const troubled = wait.phase === "stuck" || wait.phase === "failed";
    return (
      <li className="flex flex-col gap-3 border-t border-tm-hairline px-[18px] py-4 lg:flex-row lg:items-center lg:justify-between lg:gap-6 lg:px-[22px]">
        <a
          href={paste.product_url}
          target="_blank"
          rel="noreferrer"
          className="sr-only"
          title={paste.product_url}
        >
          Open {host}
        </a>
        <ReadingIndicator
          host={host}
          title={wait.title}
          detail={wait.detail}
          elapsedSeconds={wait.phase === "failed" ? null : secondsSince(paste.created_at, now)}
          tone={troubled ? "amber" : "neutral"}
          className="min-w-0 flex-1"
        />

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {/* Carry on: the bag holds its place and prices it the moment it lands. */}
          {wait.phase !== "failed" && (
            <button type="button" onClick={onAddToBag} disabled={busy} className={ROW_ACTION}>
              <Tote weight="bold" className="size-3.5" aria-hidden />
              Add to bag
            </button>
          )}
          {/* A person is the answer once the machine has run out of road. */}
          {troubled && (
            <button
              type="button"
              onClick={onDescribe}
              className="inline-flex h-10 items-center gap-1.5 rounded-xl px-3 text-[13px] leading-none font-semibold text-tm-coral transition-colors hover:underline"
            >
              <ChatCircleText weight="bold" className="size-3.5" aria-hidden />
              Describe it instead
            </button>
          )}
        </div>
      </li>
    );
  }

  return (
    <li className="flex flex-col gap-3 border-t border-tm-hairline px-[18px] py-4 lg:flex-row lg:items-center lg:justify-between lg:px-[22px]">
      <div className="flex min-w-0 flex-col gap-1.5">
        <a
          href={paste.product_url}
          target="_blank"
          rel="noreferrer"
          className="truncate text-[15px] leading-[1.3] font-semibold text-tm-ink hover:underline"
          title={paste.product_url}
        >
          {host}
        </a>
        {assisted && wait ? (
          <span className="flex flex-col gap-1">
            <span className="flex items-center gap-1.5 text-[13px] leading-none font-medium text-tm-green">
              <CheckCircle weight="fill" className="size-3.5 shrink-0" aria-hidden />
              {wait.title}
            </span>
            {wait.detail && <span className="text-xs leading-[1.4] text-tm-text-3">{wait.detail}</span>}
          </span>
        ) : settled ? (
          <span
            className={cn(
              "flex items-center gap-1.5 text-[13px] leading-none font-medium",
              settled.tone === "green" ? "text-tm-green" : "text-tm-amber",
            )}
          >
            {settled.tone === "green" ? (
              <CheckCircle weight="fill" className="size-3.5 shrink-0" aria-hidden />
            ) : (
              <WarningCircle weight="fill" className="size-3.5 shrink-0" aria-hidden />
            )}
            {settled.label}
          </span>
        ) : null}
      </div>

      {/*
        One action per outcome, and never one that leads nowhere. "See the landed
        price" appears ONLY for a priced, still-valid quote. And NOTHING once a
        buyer has the link: "Read it again" and "Describe it instead" beside "A
        buyer is on it" invite a duplicate request and a re-read nobody asked for
        — Kelvin: "we do not open that channel; close it".
      */}
      {!assisted && (
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {priced ? (
            <Link href={`/app/orders/review/${paste.extraction_cache_id}`} className={ROW_ACTION}>
              See the landed price
              <ArrowRight weight="bold" className="size-3.5" aria-hidden />
            </Link>
          ) : paste.outcome === "expired" ? (
            <button type="button" onClick={onRetry} disabled={retrying} className={ROW_ACTION}>
              <ArrowsClockwise weight="bold" className="size-3.5" aria-hidden />
              {retrying ? "Reading…" : "Read it again"}
            </button>
          ) : null}

          {(paste.outcome === "unpriced" || paste.outcome === "expired") && (
            <button
              type="button"
              onClick={onDescribe}
              className="inline-flex h-10 items-center gap-1.5 rounded-xl px-3 text-[13px] leading-none font-semibold text-tm-coral transition-colors hover:underline"
            >
              <ChatCircleText weight="bold" className="size-3.5" aria-hidden />
              Describe it instead
            </button>
          )}
        </div>
      )}
    </li>
  );
}
