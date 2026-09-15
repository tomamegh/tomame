"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
  Storefront,
  Tote,
  WarningCircle,
} from "@phosphor-icons/react/ssr";

import { AssistedRequestDialog } from "@/features/assisted/components";
import { describePendingWait, hostOf, type PendingWait } from "@/features/bag/components/format";
import type { BagLinePending } from "@/features/bag/types";
import { ApiFetchError } from "@/lib/auth/api-helpers";
import { toast } from "@/lib/sonner";
import { CATALOG_SEARCH } from "@/config/catalog";
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
    // The mode goes back into the address with it: stripping to the bare path
    // would silently throw a browsing customer back to the paste half.
    if (initialWatchId && typeof window !== "undefined") {
      window.history.replaceState(null, "", buyForMeHref(mode));
    }
  }, [pastes, watchId, typing, router, initialWatchId, mode]);

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

  const typed = url.trim();
  // WHICH BRANCH THE ONE BOX TAKES. A link is read; anything else is searched
  // against the catalogue. The customer is told which before they press it —
  // the icon, the placeholder and the button label all follow this, so the box
  // never silently does the other thing.
  const isLink = looksLikeUrl(typed);
  // There is no point offering to search an empty catalogue, so with nothing
  // priced the box goes back to being a paste box and says so.
  const canSearch = catalogueCount > 0;
  const searchable = canSearch && !isLink && typed.length >= CATALOG_SEARCH.minQueryLength;

  const onSubmitTerm = useCallback(() => {
    if (!typed) return;
    if (isLink || !canSearch) {
      onPaste();
      return;
    }
    if (typed.length < CATALOG_SEARCH.minQueryLength) {
      toast.error({
        title: "A little more to go on",
        description: `Type at least ${CATALOG_SEARCH.minQueryLength} characters, or paste a product link.`,
      });
      return;
    }
    // A search is a navigation, not client state: the browse half renders it on
    // the server, where the pricing engine lives. The box is not cleared — the
    // term is about to appear in the search field over there, and clearing it
    // here would make the back button land on an empty box.
    router.push(buyForMeHref("browse", { q: typed }));
  }, [typed, isLink, canSearch, onPaste, router]);

  const { reading, done } = useMemo(() => splitPastes(pastes), [pastes]);
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

  return (
    <div className="flex flex-col gap-7">
      <header className="tm-up flex flex-col gap-2 [animation-duration:0.5s]">
        <h1 className="font-display text-[30px] leading-[1.05] font-bold tracking-[-0.02em] sm:text-[38px]">
          What should we buy for you?
        </h1>
        {/*
          The sub-line names the ways ONCE, and it degrades honestly. With
          nothing priced there is no shelf to browse, so the copy says two and
          the switch draws two — promising a catalogue we cannot fill is worse
          than not offering it.
        */}
        <p className="text-sm leading-[1.5] text-tm-text-2">
          {canSearch
            ? `Three ways, and they all end the same place: a whole cedi price, landed in Accra, before you pay anything. Paste a link from ${stores.slice(0, 3).join(", ")} or anywhere else, look through what we have already priced, or describe it and a buyer will go and find it.`
            : `Two ways, and they both end the same place: a whole cedi price, landed in Accra, before you pay anything. Paste a link from ${stores.slice(0, 3).join(", ")} or anywhere else and we read it in the background, or describe it and a buyer will go and find it.`}
        </p>
      </header>

      <ModeSwitch mode={mode} offerBrowse={offerBrowse} delay={0.06} />

      {/*
        ONE BOX, BOTH JOBS. It used to take links only, and the way to search by
        name was a sentence underneath with a link in it — Kelvin, 2026-09-14: "a
        link very small beneath that most users will miss". So the box takes
        either, `looksLikeUrl` picks the branch, and the icon, placeholder and
        button label say which branch is armed before anybody presses it.
      */}
      {pasting && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onSubmitTerm();
          }}
          className="tm-up flex flex-col gap-2.5 sm:flex-row [animation-delay:0.1s] [animation-duration:0.5s]"
        >
          <label className="sr-only" htmlFor="paste-url">
            {canSearch ? "Product link, or what you are looking for" : "Product link"}
          </label>
          {/*
            `sm:flex-1`, NOT `flex-1`. Below `sm` the form is a column, and in a
            column `flex: 1 1 0%` makes the box's HEIGHT the flexed axis — the
            basis of 0 beats the fixed height, and the paste box collapsed to the
            height of its placeholder text (Kelvin: "the space to post the link in
            is very small and bad"). The box is 56px on a phone; the input is 16px
            there because iOS zooms the page into any field smaller than that on
            focus.
          */}
          <div className="flex min-h-[56px] items-center gap-2.5 rounded-[14px] border border-tm-border bg-card px-4 sm:h-[52px] sm:min-h-0 sm:flex-1">
            {searchable ? (
              <MagnifyingGlass weight="bold" className="size-[18px] shrink-0 text-tm-coral" aria-hidden />
            ) : (
              <LinkSimple className="size-[18px] shrink-0 text-tm-coral" aria-hidden />
            )}
            <input
              id="paste-url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              // `url` only while it still could be one. Locking the keyboard to
              // a URL layout would put a customer typing "wireless earbuds"
              // behind a `.com` key and no space bar.
              inputMode={canSearch && !isLink ? "search" : "url"}
              autoComplete="off"
              placeholder={
                canSearch ? "Paste a product link, or type what you want…" : "Paste a product link…"
              }
              className="min-w-0 flex-1 bg-transparent text-base leading-none outline-none placeholder:text-tm-text-3 sm:text-[15px]"
            />
          </div>
          <button
            type="submit"
            disabled={!typed || createPaste.isPending}
            className={cn(
              "tm-cta-gradient flex h-[52px] items-center justify-center gap-2 rounded-[14px] px-6 text-[15px] leading-none font-bold text-white",
              "transition-opacity disabled:cursor-not-allowed disabled:opacity-60",
            )}
          >
            {createPaste.isPending ? "Adding…" : searchable ? "Search" : "Read this link"}
            {!createPaste.isPending && <ArrowRight weight="bold" className="size-4" aria-hidden />}
          </button>
        </form>
      )}

      {/*
        Live in both halves. A link that is reading right now is the only
        time-sensitive thing on this screen, and a customer who wandered off to
        browse while it read would otherwise never see it land.
      */}
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
              {(shown) =>
                done.slice(0, shown).map((paste) => (
                  <PasteRow key={paste.id} {...rowProps(paste)} />
                ))
              }
            </RecentlyPastedCard>
          )}

          {/*
            The "Search by name" footnote that used to sit under this is gone:
            the box above does that job now, and a second, smaller way to reach
            the same search was exactly the thing nobody found.
          */}
          {pastes.length === 0 && (
            <p className="tm-up rounded-[24px] border border-tm-border bg-card px-6 py-12 text-center text-sm leading-[1.5] text-tm-text-2 [animation-delay:0.16s] [animation-duration:0.5s]">
              {canSearch
                ? "Nothing pasted yet. Drop a product link above and we will price it in cedis, all in. Or type what you are after and we will show you what we have already priced."
                : "Nothing pasted yet. Drop a product link above and we will price it in cedis, all in."}
              {" "}
              {canSearch && (
                <>
                  You can also{" "}
                  <Link
                    href={buyForMeHref("browse")}
                    className="font-semibold text-tm-coral underline-offset-2 hover:underline"
                  >
                    browse by category
                  </Link>
                  , or{" "}
                </>
              )}
              {!canSearch && <>Or </>}
              <Link
                href={buyForMeHref("ask")}
                className="font-semibold text-tm-coral underline-offset-2 hover:underline"
              >
                ask a buyer to find it
              </Link>
              .
            </p>
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
 * A COLUMN ON A PHONE, A ROW ON A DESKTOP. Two labels already truncated to
 * "Already p…" at 390px; three would be unreadable. Below `sm` each way is its
 * own full-width row, 48px tall so it is a comfortable target, with the icon and
 * the label left-aligned where the eye already is. From `sm` it collapses to the
 * one `w-fit` row it has always been.
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
      className="tm-up flex w-full flex-col gap-1 rounded-[16px] border border-tm-border bg-card p-1 sm:w-fit sm:flex-row sm:items-center [animation-duration:0.5s]"
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
          label="Browse what's priced"
        />
      )}
      <ModeSwitchLink
        href={buyForMeHref("ask")}
        active={mode === "ask"}
        icon={<ChatCircleDots weight="bold" className="size-4 shrink-0" aria-hidden />}
        label="Ask us to buy it"
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
        // `min-h-12` is the phone's 48px row; from `sm` the height goes back to
        // padding and the three sit on one line.
        "flex min-h-12 w-full min-w-0 items-center gap-2 rounded-[12px] px-3.5 text-[13.5px] leading-none font-semibold transition-colors",
        "sm:min-h-0 sm:w-auto sm:flex-none sm:justify-center sm:gap-1.5 sm:py-2.5",
        "focus-visible:ring-2 focus-visible:ring-tm-coral focus-visible:ring-offset-2 focus-visible:outline-none",
        // `bg-tm-tint`, NOT the pill background the admin filter pills reach
        // for — a choice about weight, not about what compiles. This comment
        // used to say `bg-tm-pill-bg` emitted no rule at all, which was true
        // when it was written and is not any more: `globals.css` now registers
        // `--color-tm-pill-bg` in the `@theme` block, and carries the account
        // of that bug. The tint stays because this is the loudest switch on the
        // screen and the pill wash is too faint to read as "you are here" —
        // an active state indistinguishable from an inactive one is the whole
        // control.
        active
          ? "bg-tm-tint text-tm-coral-strong"
          : "text-tm-text-2 hover:bg-tm-paper hover:text-tm-ink",
      )}
    >
      {icon}
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
