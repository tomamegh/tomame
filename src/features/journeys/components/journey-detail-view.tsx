"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  CalendarCheck,
  HouseLine,
  SpinnerGap,
  Truck,
} from "@phosphor-icons/react/ssr";

import { toast } from "@/lib/sonner";
import { useJourneyPayment } from "../hooks/useJourneyPayment";
import { formatEtaWindow, formatShortDay } from "../format";
import type { JourneyDetailViewModel } from "../types";
import { JourneyItemCard } from "./journey-item-card";
import { JourneyPaidCard } from "./journey-paid-card";
import { JourneyTrackRail } from "./journey-track-rail";
import { JourneyUpdatesCard } from "./journey-updates-card";
import { stageIcon, tonePalette } from "./stage-visuals";

export interface JourneyDetailViewProps {
  journey: JourneyDetailViewModel;
  /** `?payment=success|failed|error` from a Paystack return, read on the server. */
  paymentOutcome: string | null;
}

/**
 * `v2-detail` — one journey (design lines 318–374).
 *
 * Layout is the artboard's `1fr 380px` with the rail on the right, collapsing to
 * one column below `lg`; the mock has no phone artboard for this screen, so the
 * 390px view is the same content stacked. It keeps the bottom TAB bar — there is
 * no single primary action here, so `/app/orders` stays out of
 * `MOBILE_ACTION_BAR_ROUTES`.
 *
 * Every tile is drawn only when its data exists: no carrier entered, no carrier
 * tile; no delivery window, no ETA tile; a legacy order with no group, no
 * Deliver-to. The mock shows all three filled because its sample order has all
 * three.
 *
 * Delays are the mock's literals: back link `tmIn .4s`, main card `tmUp .5s`,
 * rail `.08s`, Updates `.1s`, What you paid `.16s`.
 */
export function JourneyDetailView({ journey, paymentOutcome }: JourneyDetailViewProps) {
  const payment = useJourneyPayment();
  const tone = tonePalette(journey.tone);
  const Glyph = stageIcon(journey.status);
  const etaText = formatEtaWindow(journey.eta);

  // Announced once per mount; see `JourneysView` for why it is deferred a tick.
  const announced = useRef(false);
  useEffect(() => {
    if (paymentOutcome !== "failed" && paymentOutcome !== "error") return;
    const timer = setTimeout(() => {
      if (announced.current) return;
      announced.current = true;
      toast.error({
        title:
          paymentOutcome === "failed"
            ? "Payment did not go through — nothing was charged."
            : "We could not confirm your payment",
      });
    }, 0);
    return () => clearTimeout(timer);
  }, [paymentOutcome]);

  return (
    <div className="flex flex-col gap-[22px]">
      <Link
        href="/app/orders"
        className="tm-in flex w-fit items-center gap-2 text-sm leading-none font-medium text-tm-text-2 [animation-duration:0.4s]"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Journeys
      </Link>

      <div className="grid items-start gap-6 lg:grid-cols-[1fr_380px]">
        <div className="flex flex-col gap-5">
          <section className="tm-up flex flex-col gap-[22px] overflow-hidden rounded-[24px] border border-tm-border bg-card px-[22px] py-[26px] [animation-duration:0.5s] lg:px-7">
            <div className="flex flex-wrap justify-between gap-5">
              <div className="flex min-w-0 flex-col gap-2">
                <span className="text-xs leading-none font-semibold tracking-[0.04em] text-tm-text-3 uppercase">
                  {/*
                    "TM-00042 · PAID 28 AUG". The paid half comes from the
                    payment event, not from `created_at`, and is dropped entirely
                    while the order is unpaid.
                  */}
                  {[journey.orderNo, journey.paidAt ? `Paid ${formatShortDay(journey.paidAt)}` : null]
                    .filter((part): part is string => !!part)
                    .join(" · ")}
                </span>
                <h1 className="font-display max-w-[560px] text-[22px] leading-[1.15] font-bold lg:text-[28px]">
                  {journey.productName}
                </h1>
              </div>

              <span
                className={`inline-flex h-fit items-center gap-2 rounded-full px-3.5 py-2.5 text-[13px] leading-none font-bold whitespace-nowrap ${tone.badge} ${tone.text}`}
              >
                <Glyph weight="fill" className="size-4" aria-hidden />
                {journey.stageLabel}
              </span>
            </div>

            {/* The track scrolls rather than crushing five stops into 350px. */}
            <div className="-mx-[22px] overflow-x-auto px-[22px] lg:mx-0 lg:px-0">
              <div className="min-w-[560px]">
                <JourneyTrackRail track={journey.track} eta={journey.eta} />
              </div>
            </div>

            {journey.payable && (
              <button
                type="button"
                disabled={payment.busyId === journey.id}
                onClick={() =>
                  payment.pay({ id: journey.id, orderGroupId: journey.payable?.orderGroupId ?? null })
                }
                className="flex h-[54px] items-center justify-center gap-2 rounded-[14px] bg-[image:var(--tm-gradient-cta)] text-[15px] leading-none font-bold text-white disabled:opacity-60"
              >
                {payment.busyId === journey.id && (
                  <SpinnerGap className="size-5 animate-spin" aria-hidden />
                )}
                {journey.payable.orderGroupId ? "Pay for this bag" : "Pay now"}
              </button>
            )}

            <div className="grid gap-3 border-t border-[#F5EEE9] pt-[18px] sm:grid-cols-2 lg:grid-cols-3">
              {journey.carrier && (
                <Tile icon={<Truck weight="duotone" className="size-5 text-tm-coral" aria-hidden />} label="Carrier">
                  {journey.carrier.trackingUrl ? (
                    <a
                      href={journey.carrier.trackingUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-tm-coral"
                    >
                      {carrierLine(journey.carrier.name, journey.carrier.trackingNumber)}
                    </a>
                  ) : (
                    carrierLine(journey.carrier.name, journey.carrier.trackingNumber)
                  )}
                </Tile>
              )}

              {etaText && (
                <Tile
                  icon={<CalendarCheck weight="duotone" className="size-5 text-tm-coral" aria-hidden />}
                  label={journey.eta?.source === "confirmed" ? "At your door" : "Estimated arrival"}
                >
                  {etaText}
                </Tile>
              )}

              {journey.deliverTo && (
                <Tile icon={<HouseLine weight="duotone" className="size-5 text-tm-coral" aria-hidden />} label="Deliver to">
                  {journey.deliverTo.label}
                </Tile>
              )}
            </div>
          </section>

          <div className="grid gap-5 lg:grid-cols-2">
            <JourneyUpdatesCard updates={journey.updates} />
            <JourneyPaidCard
              pricing={journey.pricing}
              adminTotalGhs={journey.adminTotalGhs}
              payment={journey.payment}
            />
          </div>

          {journey.groupSiblings.length > 0 && (
            <section className="flex flex-col gap-2.5 rounded-[24px] border border-tm-border bg-card p-[22px]">
              <h2 className="font-display text-lg leading-none font-bold">
                Bought in the same bag
              </h2>
              <ul className="flex flex-col gap-2">
                {journey.groupSiblings.map((sibling) => (
                  <li key={sibling.id}>
                    <Link
                      href={`/app/orders/${sibling.id}`}
                      className="flex gap-2 text-[13px] leading-[1.4] font-medium text-tm-text-2 hover:text-tm-ink"
                    >
                      <span className="tm-nums shrink-0 text-tm-text-3">{sibling.orderNo}</span>
                      <span className="truncate">{sibling.productName}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        <JourneyItemCard
          item={journey.item}
          note={journey.note}
          whatsappHref={journey.whatsappHref}
          orderNo={journey.orderNo}
        />
      </div>
    </div>
  );
}

/** "DHL · 7734 2201 9856", or just the carrier when no number was entered. */
function carrierLine(name: string, trackingNumber: string | null): string {
  return trackingNumber ? `${name} · ${trackingNumber}` : name;
}

/** One of the three facts under the track (design line 329). */
function Tile({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-tm-pill-bg">
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-xs leading-none font-medium text-tm-text-3">{label}</p>
        <p className="mt-1 text-[13px] leading-[1.3] font-semibold break-words">{children}</p>
      </div>
    </div>
  );
}
