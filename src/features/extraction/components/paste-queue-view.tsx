"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  ChatCircleText,
  CheckCircle,
  CircleNotch,
  LinkSimple,
  Tote,
  WarningCircle,
} from "@phosphor-icons/react/ssr";

import { AssistedRequestDialog } from "@/features/assisted/components";
import { describePendingWait, hostOf } from "@/features/bag/components/format";
import type { BagLinePending } from "@/features/bag/types";
import { ApiFetchError } from "@/lib/auth/api-helpers";
import { toast } from "@/lib/sonner";
import { cn } from "@/lib/utils";
import { useAddPasteToBag, useCreatePaste, usePastes } from "../hooks/usePastes";
import type { PasteStatus } from "../services/paste-status";

export interface PasteQueueViewProps {
  /** The viewer's recent pastes, server-rendered so the list is there on first paint. */
  initialPastes: PasteStatus[];
  /** Store display names from the scraper registry — never a literal list in JSX. */
  stores: readonly string[];
  /** Server render time, ISO. The wait copy is struck from this so SSR and hydration agree. */
  renderedAt: string;
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
 * price when they come back.
 */
export function PasteQueueView({ initialPastes, stores, renderedAt }: PasteQueueViewProps) {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [describing, setDescribing] = useState<PasteStatus | null>(null);

  const { data: pastes } = usePastes(initialPastes);
  const createPaste = useCreatePaste();
  const addToBag = useAddPasteToBag();

  // Same clock discipline as the bag: the first paint is the server's instant so
  // hydration matches, and it only advances after mount — by elapsed time rather
  // than by reading the browser's clock, so a skewed device still counts right.
  const [now, setNow] = useState(() => new Date(renderedAt));
  const anyReading = pastes.some((p) => p.status === "pending" || p.status === "running");
  useEffect(() => {
    if (!anyReading) return;
    const base = new Date(renderedAt).getTime();
    const mountedAt = Date.now();
    const id = setInterval(() => setNow(new Date(base + (Date.now() - mountedAt))), 1_000);
    return () => clearInterval(id);
  }, [anyReading, renderedAt]);

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
          if (paste.status === "ready" && paste.extraction_cache_id) {
            router.push(`/app/orders/review/${paste.extraction_cache_id}`);
          }
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

  const { reading, done } = useMemo(() => splitPastes(pastes), [pastes]);

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
            <PasteRow
              key={paste.id}
              paste={paste}
              now={now}
              onDescribe={() => setDescribing(paste)}
              onAddToBag={() => onAddToBag(paste)}
              busy={addToBag.isPending}
            />
          ))}
        </Group>
      )}

      {done.length > 0 && (
        <Group label="Recently pasted" delay={0.18}>
          {done.map((paste) => (
            <PasteRow
              key={paste.id}
              paste={paste}
              now={now}
              onDescribe={() => setDescribing(paste)}
              onAddToBag={() => onAddToBag(paste)}
              busy={addToBag.isPending}
            />
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
    if (paste.status === "pending" || paste.status === "running") reading.push(paste);
    else done.push(paste);
  }
  return { reading, done };
}

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

/**
 * One pasted link. The three states it can be in are the three things a customer
 * can do next: wait, look at the price, or ask a person.
 */
function PasteRow({
  paste,
  now,
  onDescribe,
  onAddToBag,
  busy,
}: {
  paste: PasteStatus;
  now: Date;
  onDescribe: () => void;
  onAddToBag: () => void;
  busy: boolean;
}) {
  const ready = paste.status === "ready" && !!paste.extraction_cache_id;
  // The same copy the bag uses, from the same helper, so a link cannot be
  // described one way here and another way there.
  const wait =
    paste.status === "ready"
      ? null
      : describePendingWait(
          {
            request_id: paste.id,
            status: paste.status === "failed" ? "failed" : paste.status,
            error: paste.error,
            queued_at: paste.created_at,
          } satisfies BagLinePending,
          now,
        );

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
          {hostOf(paste.product_url)}
        </a>
        {ready ? (
          <span className="flex items-center gap-1.5 text-[13px] leading-none font-medium text-tm-green">
            <CheckCircle weight="fill" className="size-3.5 shrink-0" aria-hidden />
            Priced and ready
          </span>
        ) : (
          wait && (
            <span className="flex flex-col gap-1">
              <span
                className={cn(
                  "flex items-center gap-1.5 text-[13px] leading-none font-medium",
                  wait.phase === "failed" ? "text-tm-amber" : "text-tm-text-2",
                )}
              >
                {wait.phase === "failed" ? (
                  <WarningCircle weight="fill" className="size-3.5 shrink-0" aria-hidden />
                ) : (
                  <CircleNotch className="size-3.5 shrink-0 animate-spin text-tm-coral" aria-hidden />
                )}
                {wait.title}
              </span>
              {wait.detail && <span className="text-xs leading-[1.4] text-tm-text-3">{wait.detail}</span>}
            </span>
          )
        )}
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-2">
        {ready ? (
          <Link
            href={`/app/orders/review/${paste.extraction_cache_id}`}
            className="inline-flex h-10 items-center gap-1.5 rounded-xl border-[1.5px] border-tm-border bg-card px-4 text-[13px] leading-none font-semibold transition-colors hover:bg-tm-tint"
          >
            See the landed price
            <ArrowRight weight="bold" className="size-3.5" aria-hidden />
          </Link>
        ) : (
          <button
            type="button"
            onClick={onAddToBag}
            disabled={busy || wait?.phase === "failed"}
            className="inline-flex h-10 items-center gap-1.5 rounded-xl border-[1.5px] border-tm-border bg-card px-4 text-[13px] leading-none font-semibold transition-colors hover:bg-tm-tint disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Tote weight="bold" className="size-3.5" aria-hidden />
            Add to bag
          </button>
        )}

        {(wait?.phase === "stuck" || wait?.phase === "failed") && (
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
