"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, MotionConfig, motion } from "motion/react";
import { ArrowRight, ChatCircleText, Rows, SquaresFour, Tag, Tote } from "@phosphor-icons/react/ssr";

import { StoreImage as Image } from "@/components/store-image";
import { PriceDisplay } from "@/components/price/price-display";
import { Button } from "@/components/ui/button";
import { StatusPill } from "@/components/ui/status-pill";
import { safeImageSrc } from "@/features/app-home/components/format";
import { useAddToBag } from "@/features/bag/hooks/useAddToBag";
import { hostOf } from "@/features/bag/components/format";
import { formatGhs, formatUsd } from "@/features/marketing/format";
import { PayHoldNotice } from "@/features/quote-checks/components/pay-hold-notice";
import { riseIn, SPRING } from "@/lib/motion/presets";
import { toast } from "@/lib/sonner";
import { cn } from "@/lib/utils";
import { priceContextParts, storePriceDisclaimer } from "../price-context";
import { useCreatePaste, usePasteBatchPreview } from "../hooks/usePastes";
import type { PasteBatchLine } from "../services/paste-batch";
import type { PasteStatus } from "../services/paste-status";
import { batchRowStatus, type BatchRowStatus } from "./batch-format";
import { ReadingSteps, ReadingStepsCompact, readingStageOf } from "./reading-indicator";
import { CachedPriceNote, ManualQuoteNote, QuoteExpiryLine, QuoteReceipt, ReadingClock, RefreshNote, RefreshQuoteButton } from "./paste-quote-parts";

export type BatchView = "list" | "cards";

export interface PasteBatchPanelProps {
  /** The batch's pastes, in the order they were added. */
  pastes: PasteStatus[];
  /** Open the describe-it form for a link we could not read. */
  onDescribe: (paste: PasteStatus) => void;
  /** Forget the batch (the links stay in Recently pasted). Absent in a chat, where the links stay in the thread. */
  onDone?: () => void;
}

interface Row {
  paste: PasteStatus;
  line: PasteBatchLine | null;
  status: BatchRowStatus;
}

/**
 * The links of one batch (plan 2b), each reading in the background with its
 * own status, filling in image, title and landed total as they land.
 *
 * Two views: all together (a compact list, one combined landed total with the
 * consolidation saving, "Add all ready items to bag") and one at a time (swipe
 * through the quotes). Every figure is the server's (`POST /api/pastes/preview`):
 * the combined total is the bag's own sum, nothing is added up here.
 */
export function PasteBatchPanel({ pastes, onDescribe, onDone }: PasteBatchPanelProps) {
  const router = useRouter();
  const [view, setView] = useState<BatchView>("list");
  const [added, setAdded] = useState<ReadonlySet<string>>(new Set());
  const [addingId, setAddingId] = useState<string | null>(null);
  const [addingAll, setAddingAll] = useState(false);
  const [refreshingId, setRefreshingId] = useState<string | null>(null);
  const addToBag = useAddToBag();
  const createPaste = useCreatePaste();

  // A stale or expired quote is read again: a fresh price at today's rate (110).
  const onRefresh = useCallback(
    (paste: PasteStatus) => {
      setRefreshingId(paste.id);
      createPaste
        .mutateAsync({ product_url: paste.product_url })
        .then(() => router.refresh())
        .catch((error: unknown) => toast.error({ title: "Couldn't re-check that link", description: error instanceof Error ? error.message : undefined }))
        .finally(() => setRefreshingId(null));
    },
    [createPaste, router],
  );

  // A row being re-checked joins the preview once its fresh read lands, which re-asks for it.
  const pricedIds = useMemo(() => pastes.filter((p) => p.outcome === "priced" && !p.rechecking && p.extraction_cache_id).map((p) => p.id), [pastes]);
  const preview = usePasteBatchPreview(pricedIds);
  const lineByPaste = useMemo(() => new Map((preview.data?.lines ?? []).map((l) => [l.request_id, l])), [preview.data]);

  const rows: Row[] = pastes.map((paste) => {
    const line = lineByPaste.get(paste.id) ?? null;
    return { paste, line, status: batchRowStatus(paste, line) };
  });
  const addable = rows.filter((r) => r.status.addable && r.line && !added.has(r.line.extraction_cache_id));
  const stillReading = rows.filter((r) => r.status.kind === "reading" || r.status.kind === "pricing").length;

  const addOne = useCallback(
    async (line: PasteBatchLine) => {
      await addToBag.mutateAsync({ extraction_cache_id: line.extraction_cache_id, quantity: 1 });
      setAdded((prev) => new Set(prev).add(line.extraction_cache_id));
    },
    [addToBag],
  );

  const onAddOne = useCallback(
    (line: PasteBatchLine) => {
      setAddingId(line.extraction_cache_id);
      addOne(line)
        .then(() => {
          toast.success({ title: "Added to your bag", description: line.title ?? undefined });
          router.refresh();
        })
        .catch((error: unknown) => toast.error({ title: "Couldn't add that to your bag", description: error instanceof Error ? error.message : undefined }))
        .finally(() => setAddingId(null));
    },
    [addOne, router],
  );

  const onAddAll = useCallback(async () => {
    setAddingAll(true);
    let done = 0;
    // One at a time: the first add may create the bag, and the rest must land in it.
    for (const row of addable) {
      try {
        await addOne(row.line!);
        done += 1;
      } catch {
        // Counted below; the rest still go in.
      }
    }
    setAddingAll(false);
    router.refresh();
    if (done === addable.length) {
      toast.success({ title: done === 1 ? "1 item added to your bag" : `${done} items added to your bag` });
    } else {
      toast.error({ title: `Added ${done} of ${addable.length}`, description: "Some items couldn't be added. Try those from their quotes." });
    }
  }, [addOne, addable, router]);

  if (pastes.length === 0) return null;
  const many = pastes.length > 1;

  return (
    <MotionConfig reducedMotion="user">
      <section aria-labelledby="batch-heading" className="flex flex-col gap-3">
        <header className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
          <h2 id="batch-heading" className="tm-title-3 text-foreground">
            {many ? `Your links · ${pastes.length}` : "Your link"}
          </h2>
          <div className="flex items-center gap-1">
            {many && (
              <div role="group" aria-label="View" className="flex rounded-[12px] bg-muted p-0.5">
                <ViewToggle active={view === "list"} onClick={() => setView("list")} icon={<Rows className="size-4" aria-hidden />} label="All together" />
                <ViewToggle active={view === "cards"} onClick={() => setView("cards")} icon={<SquaresFour className="size-4" aria-hidden />} label="One at a time" />
              </div>
            )}
            {onDone && (
              <Button variant="ghost" size="sm" className="min-h-11 rounded-xl px-3" onClick={onDone}>
                Done
              </Button>
            )}
          </div>
        </header>

        {view === "list" || !many ? (
          <div className="overflow-hidden rounded-[20px] border border-border bg-card">
            <ul>
              <AnimatePresence initial={false}>
                {rows.map((row) => (
                  <motion.li key={row.paste.id} className="border-t border-border first:border-t-0" layout="position" variants={riseIn} initial="hidden" animate="visible" exit="exit" transition={SPRING.layout}>
                    <BatchListRow
                      row={row}
                      single={!many}
                      added={row.line ? added.has(row.line.extraction_cache_id) : false}
                      onDescribe={() => onDescribe(row.paste)}
                      onRefresh={() => onRefresh(row.paste)}
                      refreshing={refreshingId === row.paste.id}
                    />
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>

            <div className="flex flex-col gap-3 border-t border-border bg-muted/40 p-4">
              {preview.data && preview.data.lines.some((l) => l.total_ghs != null) ? (
                <div className="flex items-end justify-between gap-3">
                  <div className="flex min-w-0 flex-col gap-1">
                    <span className="text-[13px] font-semibold text-foreground">{many ? "Together, landed in Accra" : "Landed in Accra"}</span>
                    {preview.data.consolidation_saving_ghs > 0 && (
                      <span className="tm-nums text-[12.5px] font-medium text-tm-green-ink dark:text-tm-green">
                        Includes {formatGhs(preview.data.consolidation_saving_ghs)} saved by shipping together
                      </span>
                    )}
                  </div>
                  <span className="text-right">
                    <span className="tm-nums block text-[22px] leading-none font-bold text-foreground">{formatGhs(preview.data.total_ghs)}</span>
                    {preview.data.total_usd > 0 && (
                      <span className="tm-nums text-[12px] font-medium text-muted-foreground">≈ {formatUsd(preview.data.total_usd)}</span>
                    )}
                  </span>
                </div>
              ) : (
                <p className="tm-caption text-muted-foreground">Prices appear here as each link is read.</p>
              )}
              {preview.data && preview.data.lines.some((l) => l.total_ghs != null) ? (
                <p className="text-[12px] leading-snug text-muted-foreground">{storePriceDisclaimer(rows[0]?.line?.store ?? null, many)}</p>
              ) : null}
              {stillReading > 0 && (
                <p className="tm-caption text-muted-foreground">
                  {stillReading === 1 ? "1 link is" : `${stillReading} links are`} still reading. You can leave this page; the reads carry on.
                </p>
              )}
              <Button variant="primary" size="lg" className="w-full" onClick={onAddAll} loading={addingAll} disabled={addable.length === 0}>
                {!addingAll && <Tote weight="bold" className="size-[18px]" aria-hidden />}
                {addingAll
                  ? "Adding to your bag"
                  : addable.length <= 1
                    ? addable.length === 1 ? "Add 1 item to bag" : "Nothing to add yet"
                    : `Add all ${addable.length} items to bag`}
              </Button>
            </div>
          </div>
        ) : (
          <BatchCards
            rows={rows}
            added={added}
            addingId={addingId}
            onAdd={onAddOne}
            onDescribe={onDescribe}
            onRefresh={onRefresh}
            refreshingId={refreshingId}
          />
        )}
      </section>
    </MotionConfig>
  );
}

function ViewToggle({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex min-h-10 items-center gap-1.5 rounded-[10px] px-2.5 text-[13px] font-semibold transition-colors",
        "focus-visible:ring-2 focus-visible:ring-tm-coral focus-visible:outline-none",
        active ? "bg-card text-foreground shadow-[0_1px_3px_rgba(43,36,34,0.12)]" : "text-muted-foreground hover:text-foreground",
      )}
    >
      {icon}
      <span className="hidden min-[400px]:inline">{label}</span>
      <span className="sr-only min-[400px]:hidden">{label}</span>
    </button>
  );
}

function Thumb({ image, host, className }: { image: string | null; host: string; className?: string }) {
  const src = safeImageSrc(image);
  return (
    <span className={cn("relative flex shrink-0 items-center justify-center overflow-hidden rounded-[12px] border border-border bg-white", className)}>
      {src ? (
        <Image src={src} alt="" fill sizes="96px" className="object-contain p-1" />
      ) : (
        <span aria-hidden className="text-[15px] font-bold text-muted-foreground uppercase">
          {host.charAt(0)}
        </span>
      )}
    </span>
  );
}

/** The store's discount or our earlier read, as facts (price-context.ts). */
function PriceNote({ paste, store }: { paste: PasteStatus; store: string | null }) {
  const parts = priceContextParts(paste.price_context ?? null, store);
  if (parts.length === 0) return null;
  return (
    <span className="flex items-start gap-1 text-[12px] leading-[1.35] font-medium text-tm-green">
      <Tag weight="duotone" className="mt-px size-3.5 shrink-0" aria-hidden />
      <span className="min-w-0">{parts.join(" · ")}</span>
    </span>
  );
}

function BatchListRow({
  row,
  added,
  single,
  onDescribe,
  onRefresh,
  refreshing,
}: {
  row: Row;
  added: boolean;
  single: boolean;
  onDescribe: () => void;
  onRefresh: () => void;
  refreshing: boolean;
}) {
  const { paste, line, status } = row;
  const host = hostOf(paste.product_url);
  const working = !added && (status.kind === "reading" || status.kind === "pricing");
  const stage = readingStageOf(paste.status, status.kind === "pricing");
  const title = line?.title ?? paste.title ?? host;
  const href = paste.extraction_cache_id ? `/app/orders/review/${paste.extraction_cache_id}` : null;
  // Notes, the breakdown and the 24-hour line run the row's full width, so a phone never squeezes them.
  const hasDetail =
    (status.kind === "reading" && !paste.rechecking) || status.kind === "manual" || status.refreshable || line?.total_ghs != null;

  return (
    <div className="grid grid-cols-[48px_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 px-4 py-3">
      <Thumb image={line?.image ?? null} host={host} className="size-12" />
      <div className="flex min-w-0 flex-col gap-1.5">
        {href ? (
          <Link href={href} className="truncate text-[14px] leading-[1.3] font-semibold text-foreground hover:underline" title={title}>
            {title}
          </Link>
        ) : (
          <a href={paste.product_url} target="_blank" rel="noreferrer" className="truncate text-[14px] leading-[1.3] font-semibold text-foreground hover:underline" title={paste.product_url}>
            {title}
          </a>
        )}
        <div className="flex min-w-0 items-center gap-2">
          {added ? (
            <StatusPill tone="success">In your bag</StatusPill>
          ) : (
            <StatusPill tone={status.tone} pulse={status.pulse}>
              {status.label}
            </StatusPill>
          )}
          <span className="truncate text-[12px] text-muted-foreground">{line?.store ?? host}</span>
        </div>
        {working && !single && <ReadingStepsCompact host={host} stage={stage} />}
        {working && single && (
          <div className="pt-1.5">
            <ReadingSteps host={host} stage={stage} />
          </div>
        )}
      </div>
      <div className="flex flex-col items-end gap-1 text-right">
        {line?.total_ghs != null ? (
          <span className="tm-nums text-[15px] leading-none font-bold text-foreground">{formatGhs(line.total_ghs)}</span>
        ) : status.refreshable ? (
          <RefreshQuoteButton expired={status.kind === "expired"} loading={refreshing} onClick={onRefresh} className="px-3" />
        ) : status.askable ? (
          <button
            type="button"
            onClick={onDescribe}
            className="inline-flex min-h-11 items-center gap-1.5 text-[13px] font-semibold text-tm-coral-strong hover:underline focus-visible:ring-2 focus-visible:ring-tm-coral focus-visible:outline-none dark:text-tm-coral"
          >
            <ChatCircleText weight="bold" className="size-4" aria-hidden />
            Ask a buyer
          </button>
        ) : null}
      </div>
      {hasDetail && (
        <div className="col-span-3 flex min-w-0 flex-col gap-1.5">
          {status.kind === "reading" && !paste.rechecking && <ReadingClock queuedAt={paste.queued_at} />}
          {status.kind === "manual" && <ManualQuoteNote className="pt-1" />}
          {status.refreshable && <RefreshNote expired={status.kind === "expired"} className="pt-0.5" />}
          {line?.total_ghs != null && <PriceNote paste={paste} store={line.store} />}
          {line?.total_ghs != null && !added && (
            <>
              <CachedPriceNote checkedAt={paste.priced_from_cache_at} />
              {single ? (
                <QuoteReceipt rows={line.receipt} className="pt-1.5" />
              ) : (
                line.receipt.length > 0 && (
                  <details className="group">
                    <summary className="cursor-pointer text-[12.5px] font-semibold text-tm-coral-strong select-none dark:text-tm-coral">
                      See the breakdown
                    </summary>
                    <QuoteReceipt rows={line.receipt} className="pt-2" />
                  </details>
                )
              )}
              <QuoteExpiryLine expiresAt={paste.quote_expires_at} />
            </>
          )}
        </div>
      )}
    </div>
  );
}

function BatchCards({
  rows,
  added,
  addingId,
  onAdd,
  onDescribe,
  onRefresh,
  refreshingId,
}: {
  rows: Row[];
  added: ReadonlySet<string>;
  addingId: string | null;
  onAdd: (line: PasteBatchLine) => void;
  onDescribe: (paste: PasteStatus) => void;
  onRefresh: (paste: PasteStatus) => void;
  refreshingId: string | null;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);

  const onScroll = () => {
    const el = scroller.current;
    const first = el?.firstElementChild as HTMLElement | null;
    if (!el || !first) return;
    const step = first.offsetWidth + 12;
    setIndex(Math.min(rows.length - 1, Math.max(0, Math.round(el.scrollLeft / step))));
  };

  return (
    <div className="flex flex-col gap-2">
      <div
        ref={scroller}
        onScroll={onScroll}
        role="region"
        aria-roledescription="carousel"
        aria-label="Your quotes, one at a time"
        className="no-scrollbar -mx-5 flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-smooth px-5 pb-1 md:-mx-8 md:px-8"
      >
        {rows.map(({ paste, line, status }, i) => {
          const host = hostOf(paste.product_url);
          const title = line?.title ?? paste.title ?? host;
          const isAdded = line ? added.has(line.extraction_cache_id) : false;
          return (
            <article
              key={paste.id}
              aria-roledescription="slide"
              aria-label={`${i + 1} of ${rows.length}`}
              className="flex w-[86%] max-w-[360px] shrink-0 snap-center flex-col gap-3 rounded-[20px] border border-border bg-card p-4"
            >
              <Thumb image={line?.image ?? null} host={host} className="aspect-[4/3] w-full" />
              <div className="flex items-center gap-2">
                <StatusPill tone={isAdded ? "success" : status.tone} pulse={!isAdded && status.pulse}>
                  {isAdded ? "In your bag" : status.label}
                </StatusPill>
                <span className="truncate text-[12px] text-muted-foreground">{line?.store ?? host}</span>
              </div>
              <h3 className="line-clamp-2 min-h-[2.6em] text-[15px] leading-[1.3] font-semibold text-foreground" title={title}>
                {title}
              </h3>
              {line?.total_ghs != null ? (
                <>
                  <PriceDisplay amount={formatGhs(line.total_ghs)} usd={line.total_usd != null ? `≈ ${formatUsd(line.total_usd)}` : null} />
                  <PriceNote paste={paste} store={line.store} />
                  <CachedPriceNote checkedAt={paste.priced_from_cache_at} />
                  <QuoteReceipt rows={line.receipt} />
                  <QuoteExpiryLine expiresAt={paste.quote_expires_at} />
                </>
              ) : (
                status.kind === "reading" || status.kind === "pricing" ? (
                  <div className="flex min-h-[52px] flex-col gap-2">
                    <ReadingSteps host={hostOf(paste.product_url)} stage={readingStageOf(paste.status, status.kind === "pricing")} />
                    {status.kind === "reading" && !paste.rechecking && <ReadingClock queuedAt={paste.queued_at} />}
                  </div>
                ) : status.kind === "manual" ? (
                  <ManualQuoteNote className="min-h-[52px]" />
                ) : status.refreshable ? (
                  <RefreshNote expired={status.kind === "expired"} className="min-h-[52px]" />
                ) : (
                  <p className="tm-caption min-h-[52px] text-muted-foreground">
                    {line?.pricing_unavailable_reason ?? paste.error ?? "We couldn't read a price from this page."}
                  </p>
                )
              )}
              {line?.pay_hold && line.pay_hold.kind !== "freight_check" && (
                <PayHoldNotice hold={line.pay_hold} extractionId={line.extraction_cache_id} compact />
              )}
              <div className="mt-auto flex gap-2 pt-1">
                {paste.extraction_cache_id && !status.refreshable && (
                  <Button asChild variant="outline" size="touch" className="flex-1">
                    <Link href={`/app/orders/review/${paste.extraction_cache_id}`}>
                      Full quote
                      <ArrowRight className="size-4" aria-hidden />
                    </Link>
                  </Button>
                )}
                {status.refreshable ? (
                  <RefreshQuoteButton expired={status.kind === "expired"} loading={refreshingId === paste.id} onClick={() => onRefresh(paste)} className="flex-1" />
                ) : status.askable ? (
                  <Button variant="outline" size="touch" className="flex-1" onClick={() => onDescribe(paste)}>
                    <ChatCircleText weight="bold" className="size-4" aria-hidden />
                    Ask a buyer
                  </Button>
                ) : line && status.addable ? (
                  <Button
                    variant={isAdded ? "outline" : "primary"}
                    size="touch"
                    className="flex-1"
                    onClick={() => onAdd(line)}
                    loading={addingId === line.extraction_cache_id}
                    disabled={isAdded}
                    done={isAdded}
                  >
                    {isAdded ? "Added" : "Add to bag"}
                  </Button>
                ) : null}
              </div>
            </article>
          );
        })}
      </div>
      {rows.length > 1 && (
        <p aria-live="polite" className="tm-nums flex items-center justify-center gap-1.5 text-[12px] font-medium text-muted-foreground">
          {rows.map((r, i) => (
            <span key={r.paste.id} aria-hidden className={cn("size-1.5 rounded-full transition-colors", i === index ? "bg-tm-coral" : "bg-border")} />
          ))}
          <span className="sr-only">
            Quote {index + 1} of {rows.length}
          </span>
        </p>
      )}
    </div>
  );
}

