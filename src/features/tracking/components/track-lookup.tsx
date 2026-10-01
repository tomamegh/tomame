"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight, CalendarCheck, LockKey, MagnifyingGlass, SpinnerGap } from "@phosphor-icons/react/ssr";

import type { OrderEventRow } from "@/db/queries/order-events";
import { JourneyTrackRail } from "@/features/journeys/components/journey-track-rail";
import { JourneyUpdatesCard } from "@/features/journeys/components/journey-updates-card";
import { stageIcon, tonePalette } from "@/features/journeys/components/stage-visuals";
import { formatEtaWindow } from "@/features/journeys/format";
import { apiFetch, ApiFetchError } from "@/lib/api-client";
import { cn } from "@/lib/utils";

import type { PublicTrackingFull, PublicTrackingResult } from "../public-tracking";

/**
 * The public tracking lookup (086), on `/track` and reused by the signed-in
 * orders page. The track and the Updates card are the journey screen's own
 * components, so a parcel looks the same here as in the app.
 */

const INPUT =
  "h-[52px] w-full rounded-[14px] border border-tm-border bg-card px-4 text-[15px] font-semibold text-tm-ink outline-none placeholder:font-medium placeholder:text-tm-text-3 focus:border-tm-coral/60 focus:ring-4 focus:ring-tm-coral/10";

async function lookup(q: string, verify?: string): Promise<PublicTrackingResult> {
  const res = await apiFetch<{ data: PublicTrackingResult }>("/api/track", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ q, verify: verify ?? null }),
  });
  return res.data;
}

export function TrackLookup({ initialQuery }: { initialQuery: string }) {
  const router = useRouter();
  const [q, setQ] = useState(initialQuery);
  const [verify, setVerify] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PublicTrackingResult | null>(null);
  const [asked, setAsked] = useState("");
  const ran = useRef(false);

  const run = useCallback(
    async (query: string, verifier?: string) => {
      const value = query.trim();
      if (!value) return;
      setBusy(true);
      setError(null);
      try {
        setResult(await lookup(value, verifier));
        setAsked(value);
        if (!verifier) router.replace(`/track?q=${encodeURIComponent(value)}`, { scroll: false });
      } catch (e) {
        setError(e instanceof ApiFetchError ? e.message : "Could not look that up. Try again.");
      } finally {
        setBusy(false);
      }
    },
    [router],
  );

  useEffect(() => {
    if (ran.current || !initialQuery.trim()) return;
    ran.current = true;
    void run(initialQuery);
  }, [initialQuery, run]);

  return (
    <div className="flex flex-col gap-6">
      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          setVerify("");
          void run(q);
        }}
        className="flex flex-col gap-2 sm:flex-row"
      >
        <label htmlFor="track-q" className="sr-only">
          Your Tomame number
        </label>
        <input
          id="track-q"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Your Tomame number, e.g. TM-00042"
          autoComplete="off"
          spellCheck={false}
          maxLength={120}
          className={cn(INPUT, "sm:flex-1")}
        />
        <button
          type="submit"
          disabled={busy || !q.trim()}
          className="tm-cta-gradient inline-flex h-[52px] shrink-0 items-center justify-center gap-2 rounded-[14px] px-6 text-[15px] font-bold text-white disabled:opacity-60"
        >
          {busy ? <SpinnerGap className="size-5 animate-spin" aria-hidden /> : <MagnifyingGlass className="size-5" aria-hidden />}
          Track
        </button>
      </form>

      {error ? <p className="text-[14px] font-semibold text-tm-coral-strong">{error}</p> : null}

      {result && !result.found ? (
        <section className="rounded-[24px] border border-tm-border bg-card p-6">
          <h2 className="font-display text-lg font-bold">Nothing found</h2>
          <p className="mt-2 text-[14px] leading-[1.5] text-tm-text-2">
            We could not find a shipment for “{asked}”. Check the Tomame number on your receipt or in our messages: it
            starts with TM-.
          </p>
        </section>
      ) : null}

      {result && result.found ? (
        <section className="tm-up flex min-w-0 flex-col gap-[22px] overflow-hidden rounded-[24px] border border-tm-border bg-card px-[22px] py-[26px] [animation-duration:0.5s] lg:px-7">
          <Header result={result} />
          {/* The track scrolls rather than crushing five stops into a phone. */}
          <div className="-mx-[22px] min-w-0 overflow-x-auto px-[22px] lg:mx-0 lg:px-0">
            <div className="min-w-[560px]">
              <JourneyTrackRail track={result.track} eta={result.eta} />
            </div>
          </div>
          <Facts result={result} />
          {result.detail === "coarse" ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void run(asked, verify);
              }}
              className="flex flex-col gap-3 border-t border-[#F5EEE9] pt-[18px]"
            >
              <p className="flex items-start gap-2 text-[13.5px] leading-[1.5] font-medium text-tm-text-2">
                <LockKey weight="duotone" className="mt-0.5 size-5 shrink-0 text-tm-coral" aria-hidden />
                To see the item and every update, confirm it is yours: the last 4 digits of the phone number on the
                order, or the email you signed up with.
              </p>
              <div className="flex flex-col gap-2 sm:flex-row">
                <label htmlFor="track-verify" className="sr-only">
                  Last 4 digits of your phone, or your email
                </label>
                <input
                  id="track-verify"
                  value={verify}
                  onChange={(e) => setVerify(e.target.value)}
                  placeholder="Last 4 digits, or your email"
                  autoComplete="off"
                  maxLength={254}
                  className={cn(INPUT, "sm:flex-1")}
                />
                <button
                  type="submit"
                  disabled={busy || !verify.trim()}
                  className="inline-flex h-[52px] shrink-0 items-center justify-center rounded-[14px] bg-tm-ink px-6 text-[15px] font-bold text-white disabled:opacity-60"
                >
                  Show details
                </button>
              </div>
              {result.verifyFailed ? (
                <p className="text-[13px] font-semibold text-tm-coral-strong">
                  That does not match this order. Check it and try again, or sign in to see your orders.
                </p>
              ) : null}
            </form>
          ) : null}
        </section>
      ) : null}

      {result && result.found && result.detail === "full" ? <Full result={result} /> : null}
    </div>
  );
}

function Header({ result }: { result: Exclude<PublicTrackingResult, { found: false }> }) {
  const tone = tonePalette(result.tone);
  const Glyph = stageIcon(result.status);
  return (
    <div className="flex flex-wrap justify-between gap-x-5 gap-y-3">
      <div className="flex min-w-0 grow basis-60 flex-col gap-2">
        <span className="text-xs leading-none font-semibold tracking-[0.04em] text-tm-text-3 uppercase">
          {result.reference}
        </span>
        <h2 className="font-display max-w-full text-[22px] leading-[1.15] font-bold break-words lg:text-[26px]">
          {result.detail === "full" ? result.product.name : "Your shipment"}
        </h2>
      </div>
      <span
        className={`inline-flex h-fit items-center gap-2 rounded-full px-3.5 py-2.5 text-[13px] leading-none font-bold whitespace-nowrap ${tone.badge} ${tone.text}`}
      >
        <Glyph weight="fill" className="size-4" aria-hidden />
        {result.stageLabel}
      </span>
    </div>
  );
}

function Facts({ result }: { result: Exclude<PublicTrackingResult, { found: false }> }) {
  const etaText = formatEtaWindow(result.eta);
  if (!etaText) return null;
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-3 border-t border-[#F5EEE9] pt-[18px] sm:grid-cols-2">
      <Tile
        icon={<CalendarCheck weight="duotone" className="size-5 text-tm-coral" aria-hidden />}
        label={result.eta?.source === "confirmed" ? "At your door" : "Estimated arrival"}
      >
        {etaText}
      </Tile>
    </div>
  );
}

function Full({ result }: { result: PublicTrackingFull }) {
  // The Updates card takes journey rows; the public answer carries only the
  // fields it draws, so the rest are filled with blanks.
  const updates: OrderEventRow[] = result.updates.map((u, index) => ({
    id: `${index}`,
    order_id: "",
    order_group_id: null,
    kind: u.kind as OrderEventRow["kind"],
    title: u.title,
    detail: null,
    location: u.location,
    weight_lbs: u.weight_lbs,
    occurred_at: u.occurred_at,
    is_customer_visible: true,
    created_by: null,
    created_at: u.occurred_at,
  }));
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
      <JourneyUpdatesCard updates={updates} />
      <aside className="flex flex-col gap-4 rounded-[24px] border border-tm-border bg-card p-[22px]">
        <div className="flex items-center gap-3">
          <span className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-[14px] border border-tm-hairline bg-white">
            {result.product.imageUrl ? (
              <img src={result.product.imageUrl} alt="" referrerPolicy="no-referrer" className="size-full object-contain p-1.5" />
            ) : null}
          </span>
          <div className="min-w-0">
            <p className="line-clamp-2 text-[14px] leading-[1.3] font-semibold">{result.product.name}</p>
            {result.product.store ? (
              <p className="mt-1 text-[12.5px] font-medium text-tm-text-3">{result.product.store}</p>
            ) : null}
          </div>
        </div>
        {result.ownerHref ? (
          <Link
            href={result.ownerHref}
            className="inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-tm-coral"
          >
            Open in your orders
            <ArrowRight weight="bold" className="size-4" aria-hidden />
          </Link>
        ) : null}
      </aside>
    </div>
  );
}

function Tile({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-tm-pill-bg">{icon}</span>
      <div className="min-w-0">
        <p className="text-xs leading-none font-medium text-tm-text-3">{label}</p>
        <p className="mt-1 text-[13px] leading-[1.3] font-semibold break-words">{children}</p>
      </div>
    </div>
  );
}
