"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  ArrowsClockwise,
  CaretDown,
  ChatCircleDots,
  ChatCircleText,
  CheckCircle,
  LinkSimple,
  MagnifyingGlass,
  Plus,
  Sparkle,
  Storefront,
  Tote,
  WarningCircle,
} from "@phosphor-icons/react/ssr";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { AssistedRequestDialog } from "@/features/assisted/components";
import { PASTE_BATCH_MAX } from "../services/paste-batch";
import { splitLinks } from "./batch-format";
import { readBatch, writeBatch } from "./batch-storage";
import { PasteBatchPanel } from "./paste-batch-panel";
import { describePendingWait, hostOf, type PendingWait } from "@/features/bag/components/format";
import type { BagLinePending } from "@/features/bag/types";
import { ApiFetchError } from "@/lib/api-client";
import { toast } from "@/lib/sonner";
import { FINDER } from "@/config/finder";
import { useStartFinder } from "@/features/finder/hooks/useFinder";
import { cn } from "@/lib/utils";
import { useAddPasteToBag, useCreatePaste, usePastes } from "../hooks/usePastes";
import type { PasteStatus } from "../services/paste-status";
import { AskPanel } from "./ask-panel";
import { buyForMeHref, looksLikeUrl, type BuyForMeMode } from "./buy-for-me-mode";
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
  /** Whether a finished paste will reach this viewer by bell and email, signed-in only. */
  notifies?: boolean;
  /** Which of the three ways is open. Comes from `?mode=`; paste is the default. */
  mode?: BuyForMeMode;
  /**
   * The pre-priced catalogue, rendered on the SERVER and handed down as a node.
   *
   * It has to arrive this way. The browse panel prices every card with the live
   * pricing engine, which is server-only by the rules in CLAUDE.md, and this
   * component is a client island. Passing the finished tree as a prop keeps the
   * pricing where it belongs and keeps the paste form, the reading rows and the
   * mode switch in one place instead of duplicating them per mode.
   */
  browse?: React.ReactNode;
  /**
   * How many products the catalogue holds. Zero hides the browse mode entirely:
   * offering a shelf we cannot fill is worse than not offering it.
   *
   * IT IS NEVER PRINTED. The switch used to carry this as a badge, and it is not
   * the customer's business how many rows we have scraped — the number moves
   * with a cron job, it says nothing about whether the thing they want is in
   * there, and a small one reads as a small company. It decides whether a mode
   * is worth offering and nothing else.
   */
  catalogueCount?: number;
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
 *
 * THREE WAYS, ONE TAB, AND THEY ARE EQUALS. Pasting a link is one way to say
 * what you want. Looking through what we have already read and priced is
 * another, and until recently it had no way in that did not start with pasting a
 * link. Asking a person to go and buy it is the third, and it had no way in at
 * all: the concierge route — the thing this company actually does — could only
 * be discovered by pasting a link that FAILED and then noticing "Describe it
 * instead" in the wreckage. The switch under the title names all three, and the
 * choice lives in `?mode=`, so the back button works and a browsed shelf is an
 * address. See `buy-for-me-mode.ts` for why paste is still the default.
 *
 * Reading rows stay on screen in ALL THREE. A link being read right now is the
 * one time-sensitive thing here, and hiding it behind a mode switch would mean a
 * customer who wandered off to browse, or to write out what they want, never
 * sees it land. Recently pasted is the opposite: settled, referable, and no
 * longer the point of the screen, so it is a quiet card at the bottom of the
 * paste mode showing the last few, and it opens in place when there are more.
 */
export function PasteQueueView({
  initialPastes,
  stores,
  renderedAt,
  watchId: initialWatchId = null,
  notifies = false,
  mode = "paste",
  browse = null,
  catalogueCount = 0,
}: PasteQueueViewProps) {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const [describing, setDescribing] = useState<PasteStatus | null>(null);
  // The links of the batch being built on this visit (plan 2b), by paste id.
  // Kept in sessionStorage so a reload or a trip to a quote and back keeps the
  // batch; the reads themselves live on the server and carry on regardless.
  const [batchIds, setBatchIds] = useState<string[]>([]);
  const [queueing, setQueueing] = useState(false);
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
    // The mode goes back into the address with it: stripping to the bare path
    // would silently throw a browsing customer back to the paste half.
    if (initialWatchId && typeof window !== "undefined") {
      window.history.replaceState(null, "", buyForMeHref(mode));
    }
  }, [pastes, watchId, typing, router, initialWatchId, mode]);

  // Restore the batch after mount (sessionStorage is not there on the server),
  // keeping only ids this viewer still has.
  useEffect(() => {
    const known = new Set(pastes.map((p) => p.id));
    const saved = readBatch().filter((id) => known.has(id));
    // A link queued on another page (Home, `?url=`) and still reading joins the batch.
    const reading = pastes.filter((p) => p.outcome === "reading" && !saved.includes(p.id)).map((p) => p.id);
    setBatchIds([...saved, ...reading].slice(0, PASTE_BATCH_MAX));
    // Once, on mount: later changes come from this screen's own actions.
  }, []);
  useEffect(() => writeBatch(batchIds), [batchIds]);
  const batchIdsRef = useRef(batchIds);
  useEffect(() => {
    batchIdsRef.current = batchIds;
  }, [batchIds]);

  /**
   * Queue links one after another and add them to the batch. `follow` keeps
   * the single-link fast path: a lone link that is already priced opens its
   * quote, and one still reading is followed there when it lands.
   */
  const queueLinks = useCallback(
    async (links: string[], { follow }: { follow: boolean }) => {
      const room = PASTE_BATCH_MAX - batchIds.length;
      const take = links.slice(0, Math.max(0, room));
      if (take.length === 0) {
        toast.error({ title: `A batch holds up to ${PASTE_BATCH_MAX} links`, description: "Add these to your bag, then start another." });
        return;
      }
      if (take.length < links.length) {
        toast.info({ title: `Added the first ${take.length}`, description: `A batch holds up to ${PASTE_BATCH_MAX} links.` });
      }
      setQueueing(true);
      const added: PasteStatus[] = [];
      const before = [...batchIdsRef.current];
      let repeats = 0;
      for (const link of take) {
        try {
          const paste = await createPaste.mutateAsync({ product_url: link });
          added.push(paste);
          // The server answers a link this viewer already pasted with the same row,
          // so a repeat would otherwise change nothing on screen and say nothing.
          if (before.includes(paste.id)) repeats += 1;
          // Each row joins the batch as it is created, so it starts reading in place.
          setBatchIds((prev) => (prev.includes(paste.id) ? prev : [...prev, paste.id].slice(0, PASTE_BATCH_MAX)));
        } catch (error) {
          if (error instanceof ApiFetchError && error.status === 429) {
            toast.error({ title: "Please wait a few minutes", description: error.message });
            break;
          }
          toast.error({ title: "We couldn't take that link", description: error instanceof Error ? error.message : undefined });
        }
      }
      setQueueing(false);
      if (added.length === 0) return;
      setUrl("");
      const fresh = added.length - repeats;
      if (!follow || before.length > 0) {
        if (fresh === 0) {
          toast.info({ title: repeats === 1 ? "That link is already in your list" : "Those links are already in your list" });
        } else {
          const total = Math.min(before.length + fresh, PASTE_BATCH_MAX);
          toast.success({
            title: fresh === 1 ? "Link added" : `${fresh} links added`,
            description: `${total} of ${PASTE_BATCH_MAX}. We're reading ${fresh === 1 ? "it" : "them"} now; paste the next one whenever you're ready.`,
          });
        }
      }

      const only = added.length === 1 && links.length === 1 ? added[0]! : null;
      if (follow && only) {
        // Already read? Go straight to the price. Only a PRICED quote has
        // somewhere to go; anything else stays here, where its row explains.
        if (only.outcome === "priced" && only.extraction_cache_id) {
          router.push(`/app/orders/review/${only.extraction_cache_id}`);
          return;
        }
        if (only.outcome === "reading") setWatchId(only.id);
      }
    },
    [batchIds.length, createPaste, router],
  );

  const onPaste = useCallback(() => {
    const trimmed = url.trim();
    if (!trimmed) return;
    // Something that is not obviously a link still goes to the server, which
    // says what is wrong with it better than a client-side guess can.
    const links = splitLinks(trimmed);
    void queueLinks(links.length > 0 ? links : [trimmed], { follow: batchIds.length === 0 });
  }, [batchIds.length, queueLinks, url]);

  /** "+": take this link and get ready for the next one. */
  const onAddAnother = useCallback(() => {
    const links = splitLinks(url);
    if (links.length === 0) return;
    void queueLinks(links, { follow: false }).then(() => inputRef.current?.focus());
  }, [queueLinks, url]);

  /** Pasting several links at once splits them into rows straight away. */
  const onClipboardPaste = useCallback(
    (event: React.ClipboardEvent<HTMLInputElement>) => {
      const links = splitLinks(event.clipboardData.getData("text"));
      if (links.length < 2) return;
      event.preventDefault();
      void queueLinks(links, { follow: false });
    },
    [queueLinks],
  );

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

  const typed = url.trim();
  // WHICH BRANCH THE ONE BOX TAKES. A link is read; anything else is a
  // description, and "Find it for me" starts a price finder run (105). The
  // customer is told which before they press it — the icon, the placeholder
  // and the button label all follow this, so the box never silently does the
  // other thing.
  const isLink = looksLikeUrl(typed);
  const finder = useStartFinder();
  const isDescription = typed.length > 0 && !isLink;
  // The catalogue search stays one tap away beneath the box: what we have
  // already priced answers some requests instantly and for free.
  const canSearch = catalogueCount > 0;

  const onSubmitTerm = useCallback(() => {
    if (!typed) return;
    if (!isDescription) {
      onPaste();
      return;
    }
    if (typed.length < FINDER.minQueryLength) {
      toast.error({ title: "Add a few more words", description: "Say what you want in a few words, or paste a product link." });
      return;
    }
    finder.start(typed);
  }, [typed, isDescription, onPaste, finder]);

  // The batch's own rows are drawn by the batch panel; everything else keeps
  // its place in "Reading now" or "Recently pasted".
  const batch = useMemo(() => {
    const byId = new Map(pastes.map((p) => [p.id, p]));
    return batchIds.map((id) => byId.get(id)).filter((p): p is PasteStatus => p != null);
  }, [batchIds, pastes]);
  const { reading, done } = useMemo(() => splitPastes(pastes.filter((p) => !batchIds.includes(p.id))), [pastes, batchIds]);
  const batchFull = batch.length >= PASTE_BATCH_MAX;
  const browsing = mode === "browse";
  const pasting = mode === "paste";
  // The browse mode is worth offering only when there is a shelf behind it —
  // and always when the customer is already standing on it and needs the way
  // back. Paste and ask are always there, so the switch itself always is.
  const offerBrowse = catalogueCount > 0 || browsing;

  // Links a buyer is already holding, for the ask panel's own list.
  //
  // A still-READING one is left out on purpose: it is already on screen above in
  // "Reading now", where `describePendingWait` gives its row "A buyer is on it".
  // Listing the same link twice on one screen reads as two requests, and the one
  // thing this panel must never do is imply a duplicate is in the queue.
  const held = useMemo(
    () => pastes.filter((p) => p.assisted != null && p.outcome !== "reading"),
    [pastes],
  );

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

  const typedLinks = isLink ? splitLinks(typed) : [];
  const submitLabel = queueing ? "Adding" : isDescription ? (finder.pending ? "Starting" : "Find it for me") : batch.length > 0 ? "Add" : "Get price";

  return (
    <div className="flex flex-col gap-6">
      <header className="tm-up flex flex-col gap-2 [animation-duration:0.5s]">
        <h1 className="tm-title-1 text-foreground">What should we buy for you?</h1>
        {/* One sentence. The three ways are the switch below; they are not explained twice. */}
        <p className="tm-body max-w-[560px] text-muted-foreground">
          Paste one link or several, from {stores.slice(0, 3).join(", ")} or any US store. You see the full price in cedis before you pay.
        </p>
      </header>

      <ModeSwitch mode={mode} offerBrowse={offerBrowse} delay={0.04} />

      {/*
        ONE BOX, BOTH JOBS: a link is read, anything else is searched against
        the catalogue (`looksLikeUrl` picks; the icon, placeholder and button
        say which). Many links (plan 2b): "+" takes this link and readies the
        box for the next; pasting several at once splits them into rows.
      */}
      {pasting && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onSubmitTerm();
          }}
          className="tm-up flex flex-col gap-2 [animation-delay:0.08s] [animation-duration:0.5s]"
        >
          <label className="sr-only" htmlFor="paste-url">
            Product link, or what you are looking for
          </label>
          <div className="flex flex-col gap-2.5 sm:flex-row">
            {/*
              `sm:flex-1`, not `flex-1`: in the phone's column a flex basis of 0
              collapses the box's height. 16px text below `sm`, or iOS zooms in.
            */}
            <div className="flex min-h-[56px] items-center gap-2 rounded-[16px] border border-border bg-card pr-1.5 pl-4 transition-colors focus-within:border-tm-coral/60 sm:h-[56px] sm:flex-1">
              {isDescription ? (
                <Sparkle weight="fill" className="size-[18px] shrink-0 text-tm-coral" aria-hidden />
              ) : (
                <LinkSimple weight="bold" className="size-[18px] shrink-0 text-tm-coral" aria-hidden />
              )}
              <input
                ref={inputRef}
                id="paste-url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onPaste={onClipboardPaste}
                // `url` only while it still could be one: a URL keyboard has no space bar.
                inputMode={isLink ? "url" : "search"}
                autoComplete="off"
                enterKeyHint={isDescription ? "search" : "go"}
                placeholder="Paste a link or describe what you want"
                className="min-w-0 flex-1 bg-transparent text-base leading-none text-foreground outline-none placeholder:text-muted-foreground sm:text-[15px]"
              />
              {/* "+" is always there on the link tab so it can be found; it wakes up once
                  there is a link to take ("this one, and another after it"). */}
              {mode === "paste" && !batchFull && (
                <Button
                  type="button"
                  variant="secondary"
                  size="icon-lg"
                  onClick={onAddAnother}
                  disabled={queueing || typedLinks.length === 0}
                  aria-label="Add this link and paste another"
                  title="Add this link and paste another"
                >
                  <Plus weight="bold" className="size-5" aria-hidden />
                </Button>
              )}
            </div>
            <Button
              type="submit"
              variant="primary"
              size="lg"
              className="sm:min-w-[164px]"
              disabled={!typed || batchFull || finder.pending}
              loading={queueing || finder.pending}
            >
              {submitLabel}
              {!queueing && !finder.pending && <ArrowRight weight="bold" className="size-4" aria-hidden />}
            </Button>
          </div>
          {finder.error && (
            <p role="alert" className="tm-caption px-1 font-medium text-destructive">
              {finder.error}
            </p>
          )}
          {isDescription ? (
            <p className="tm-caption flex flex-wrap items-center gap-x-3 gap-y-1 px-1 text-muted-foreground">
              <span>We search the US stores we buy from and show the best price landed in Accra. About a minute.</span>
              {canSearch && typed.length >= FINDER.minQueryLength && (
                <Link
                  href={buyForMeHref("browse", { q: typed })}
                  className="inline-flex items-center gap-1 rounded font-semibold text-tm-coral-strong underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-tm-coral/40 dark:text-tm-coral"
                >
                  <MagnifyingGlass weight="bold" className="size-3.5" aria-hidden />
                  Or search what we have already priced
                </Link>
              )}
            </p>
          ) : (
            <p className="tm-caption px-1 text-muted-foreground">
              {batchFull
                ? `That's ${PASTE_BATCH_MAX} links, the most for one batch. Add them to your bag, then start another.`
                : batch.length > 0
                  ? `${batch.length} of ${PASTE_BATCH_MAX} links. Paste the next one, or several at once.`
                  : `Have several? Tap + after each link, or paste them all at once (up to ${PASTE_BATCH_MAX}).`}
            </p>
          )}
        </form>
      )}

      {/* The batch reads on whichever half is open: it is the time-sensitive part of the screen. */}
      {batch.length > 0 && (
        <PasteBatchPanel pastes={batch} onDescribe={(paste) => setDescribing(paste)} onDone={() => setBatchIds([])} />
      )}

      {reading.length > 0 && (
        <Group label={`Reading now · ${reading.length}`} delay={0.14}>
          {reading.map((paste) => (
            <PasteRow key={paste.id} {...rowProps(paste)} />
          ))}
        </Group>
      )}

      {browsing ? (
        browse
      ) : mode === "ask" ? (
        <AskPanel requests={held} now={now} />
      ) : (
        <>
          {done.length > 0 && (
            <RecentlyPastedCard count={done.length} delay={0.2}>
              {(shown) => done.slice(0, shown).map((paste) => <PasteRow key={paste.id} {...rowProps(paste)} />)}
            </RecentlyPastedCard>
          )}

          {pastes.length === 0 && batch.length === 0 && (
            <EmptyState
              icon={LinkSimple}
              title="Your prices will appear here"
              description="Paste a product link above. We read the page and show the full price, delivered to Accra."
              className="tm-up [animation-delay:0.14s] [animation-duration:0.5s]"
              action={
                <Button asChild variant="ghost" size="touch">
                  <Link href={buyForMeHref("ask")}>
                    <ChatCircleDots weight="bold" className="size-4" aria-hidden />
                    No link? Ask a buyer to find it
                  </Link>
                </Button>
              }
            />
          )}
        </>
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

/**
 * The switch between the three ways in.
 *
 * Links, not buttons, and the mode is in the URL. Same reasoning as the admin
 * filter pills and the catalogue search: the back button then moves between the
 * three, a mode is a thing somebody can send, and nothing has to be held in
 * client state to remember which one is open.
 *
 * THE COUNT IS GONE. The browse side used to carry the catalogue's real size as
 * a badge. It is not the customer's business how many rows a cron job has
 * scraped: the number moves on its own, it says nothing about whether the thing
 * they came for is in there, and a modest one reads as a modest company. The
 * count still decides whether browse is drawn at all — it is just never printed.
 *
 * ONE ROW AT EVERY WIDTH (2026-11-20). A segmented control with short labels
 * ("Paste a link", "Browse", "Ask a buyer") fits three segments at 390 px; the
 * icons join from 400 px. The screen's sub-line no longer explains the three.
 */
function ModeSwitch({
  mode,
  offerBrowse,
  delay,
}: {
  mode: BuyForMeMode;
  /** Whether there is a catalogue behind the browse link. Never its size. */
  offerBrowse: boolean;
  delay: number;
}) {
  return (
    <nav
      aria-label="Ways to tell us what you want"
      className="tm-up grid w-full auto-cols-fr grid-flow-col gap-1 rounded-[14px] bg-muted p-1 sm:w-fit [animation-duration:0.5s]"
      style={{ animationDelay: `${delay}s` }}
    >
      <ModeSwitchLink
        href={buyForMeHref("paste")}
        active={mode === "paste"}
        icon={<LinkSimple weight="bold" className="size-4 shrink-0" aria-hidden />}
        label="Paste a link"
      />
      {offerBrowse && (
        <ModeSwitchLink
          href={buyForMeHref("browse")}
          active={mode === "browse"}
          icon={<Storefront weight="bold" className="size-4 shrink-0" aria-hidden />}
          label="Browse"
        />
      )}
      <ModeSwitchLink
        href={buyForMeHref("ask")}
        active={mode === "ask"}
        icon={<ChatCircleDots weight="bold" className="size-4 shrink-0" aria-hidden />}
        label="Ask a buyer"
      />
    </nav>
  );
}

function ModeSwitchLink({
  href,
  active,
  icon,
  label,
}: {
  href: string;
  active: boolean;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        // A segmented control: one row at every width, short labels, 44px tall.
        "flex min-h-11 min-w-0 items-center justify-center gap-1.5 rounded-[11px] px-3 text-[13.5px] leading-none font-semibold transition-colors",
        "focus-visible:ring-2 focus-visible:ring-tm-coral focus-visible:ring-offset-2 focus-visible:outline-none",
        active
          ? "bg-card text-foreground shadow-[0_1px_3px_rgba(43,36,34,0.12)]"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      <span className="hidden min-[400px]:inline-flex">{icon}</span>
      <span className="truncate">{label}</span>
    </Link>
  );
}

/** How many settled pastes the quiet card shows before it has to be opened. */
const RECENT_PREVIEW = 3;

/**
 * Recently pasted, demoted.
 *
 * It used to be the body of this screen: a full-width section that grew with
 * every link and pushed everything else off the phone. Kelvin: "The recently
 * pasted should be in a card and not be the centre anymore." So it is a quiet
 * card at the bottom, showing the last few, opening in place when there are
 * more. Nothing is thrown away, because for a signed-out visitor this list is
 * the only record of what they have asked us to price.
 *
 * Nothing collapses a row that still needs attention: those are reading, and
 * reading rows never reach this card.
 */
function RecentlyPastedCard({
  count,
  delay,
  children,
}: {
  count: number;
  delay: number;
  children: (shown: number) => React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const collapsible = count > RECENT_PREVIEW;
  const shown = open || !collapsible ? count : RECENT_PREVIEW;

  return (
    <section
      aria-label="Recently pasted"
      className="tm-up overflow-hidden rounded-[20px] border border-tm-border bg-card [animation-duration:0.5s]"
      style={{ animationDelay: `${delay}s` }}
    >
      <header className="flex items-center justify-between gap-3 px-[18px] py-3.5 lg:px-[22px]">
        <h2 className="text-[12px] leading-none font-bold tracking-[0.06em] text-tm-text-3 uppercase">
          Recently pasted
        </h2>
        <span className="tm-nums shrink-0 text-[12px] leading-none font-semibold text-tm-text-3">
          {collapsible && !open ? `${RECENT_PREVIEW} of ${count}` : count}
        </span>
      </header>

      <ul>{children(shown)}</ul>

      {collapsible && (
        <div className="border-t border-tm-hairline px-[18px] py-3 lg:px-[22px]">
          <button
            type="button"
            onClick={() => setOpen((previous) => !previous)}
            aria-expanded={open}
            className="inline-flex items-center gap-1.5 text-[13px] leading-none font-semibold text-tm-coral transition-colors hover:text-tm-coral-strong focus-visible:ring-2 focus-visible:ring-tm-coral focus-visible:ring-offset-2 focus-visible:outline-none"
          >
            {open ? "Show fewer" : `Show all ${count}`}
            <CaretDown
              weight="bold"
              className={cn("size-3.5 transition-transform", open && "rotate-180")}
              aria-hidden
            />
          </button>
        </div>
      )}
    </section>
  );
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
  unavailable: { label: "Out of stock at the store right now", tone: "amber" },
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
            queued_at: paste.queued_at ?? paste.created_at,
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
    const troubled = wait.phase === "stuck" || wait.phase === "long" || wait.phase === "failed";
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
          elapsedSeconds={wait.phase === "failed" || wait.phase === "long" ? null : secondsSince(paste.queued_at ?? paste.created_at, now)}
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
        ) : settled && paste.rechecking ? (
          // A stale read being read again (106): the old figures stand, marked, until it lands.
          <span className="flex items-center gap-1.5 text-[13px] leading-none font-medium text-tm-text-2">
            <ArrowsClockwise weight="bold" className="size-3.5 shrink-0 animate-spin motion-reduce:animate-none" aria-hidden />
            Re-checking price and stock…
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

          {(paste.outcome === "unpriced" || paste.outcome === "unavailable" || paste.outcome === "expired") && (
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
