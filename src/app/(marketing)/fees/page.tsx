import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUUpLeft, LockSimple } from "@phosphor-icons/react/ssr";

import { FREIGHT_HEADLINE, PRICE_FAQS, feeSentence } from "@/config/price-story";
import {
  getFeeLines,
  getFeesWorkedExample,
  getMarketingSettings,
  getPublishedContent,
  resolveMarketingFigures,
} from "@/features/marketing/services";
import { loadQuoteConstants } from "@/features/quotes/services/quote-constants.service";
import { cn } from "@/lib/utils";
import { Eyebrow, MARKETING_GUTTER } from "../_components/marketing-primitives";
import { ComparisonTable } from "./_components/comparison-table";
import { FeeRow } from "./_components/fee-row";
import { WorkedExampleCard } from "./_components/worked-example-card";

export const metadata: Metadata = {
  title: "Fees",
  description:
    "One Tomame fee, and everything else at the rate we're charged. See a live worked example priced by the same engine that quotes your order.",
};

/** The mock's per-row entry delays. */
const FEE_DELAYS = ["0.1s", "0.18s", "0.26s", "0.34s", "0.42s"] as const;

interface FeesPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function FeesPage({ searchParams }: FeesPageProps) {
  const params = await searchParams;

  const [feeLines, figures, compareRows, baseExample, rateLockHours, settings] = await Promise.all([
    getFeeLines(),
    resolveMarketingFigures(),
    getPublishedContent("compare_row"),
    getFeesWorkedExample(),
    // The same `pricing_constants.rate_lock_hours` the lock is minted with.
    loadQuoteConstants().then(
      (constants) => constants.rate_lock_hours,
      () => null,
    ),
    // The refund card's copy is admin-owned (`refund_promise_*`, 077).
    getMarketingSettings(),
  ]);

  // The chip is an index into the admin's own preset list, never a raw price:
  // a query string cannot ask the engine to price an arbitrary number.
  const presetIndex = readPresetIndex(
    params.example,
    baseExample.input.price_presets_usd.length,
  );
  const example =
    presetIndex > 0
      ? await getFeesWorkedExample(
          baseExample.input.price_presets_usd[presetIndex],
        )
      : baseExample;

  const serviceFee = figures.value_fee_pct;
  const fxBuffer = figures.fx_buffer_pct;

  return (
    <>
      {/* ── Hero ───────────────────────────────────────────────────────── */}
      <section className="bg-card pb-16 pt-16 md:pt-20">
        <div
          className={cn(
            MARKETING_GUTTER,
            "tm-up flex flex-col items-center gap-5 text-center",
          )}
        >
          <Eyebrow>Fees</Eyebrow>
          <h1 className="max-w-[760px] text-[40px] font-bold leading-[0.98] sm:text-[52px] lg:text-[62px]">
            One fee. Everything else is pass-through.
          </h1>
          {/*
            The fee sentence is the shared, verbatim promise; its percentage is
            the engine's `default_value_fee_pct`. A group that drifts from it is
            flagged in the admin pricing console, never re-worded here.
          */}
          <p className="tm-nums max-w-[600px] text-[17px] leading-relaxed font-semibold text-tm-ink md:text-lg">
            {feeSentence(serviceFee.value)}
          </p>
          <p className="max-w-[600px] text-[17px] leading-relaxed text-tm-text-2 md:text-lg">
            {FREIGHT_HEADLINE}. Tax and today&apos;s rate are charged at the rates below, and every one
            of them is on your receipt before you pay.
          </p>
          <ul className="flex flex-wrap justify-center gap-x-5 gap-y-2 text-sm font-semibold">
            {PRICE_FAQS.map((faq) => (
              <li key={faq.slug}>
                <Link href={`/faq#${faq.slug}`} className="text-tm-coral underline-offset-4 hover:underline">
                  {faq.question}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ── Fee rows + worked example ──────────────────────────────────── */}
      <section className="bg-card pb-20 md:pb-24">
        <div
          className={cn(
            MARKETING_GUTTER,
            "grid items-start gap-7 lg:grid-cols-2",
          )}
        >
          <div>
            <h2 className="sr-only">What we charge</h2>
            <ul className="flex flex-col gap-3.5">
              {feeLines.map((line, index) => (
                <FeeRow
                  key={line.slug}
                  line={line}
                  animationDelay={FEE_DELAYS[index] ?? `${0.1 + index * 0.08}s`}
                />
              ))}
            </ul>
          </div>

          <div className="flex flex-col gap-3.5 lg:sticky lg:top-24">
            <WorkedExampleCard
              example={example}
              activePresetIndex={presetIndex}
              presetHref={(index) =>
                index === 0 ? "/fees" : `/fees?example=${index}`
              }
            />

            <div className="grid gap-3 sm:grid-cols-2">
              {settings.refundPromiseTitle ? (
                <div className="flex flex-col gap-1.5 rounded-2xl bg-tm-green-bg p-4.5">
                  <ArrowUUpLeft
                    weight="duotone"
                    className="size-5.5 text-tm-green"
                    aria-hidden="true"
                  />
                  <p className="text-sm font-bold leading-tight text-tm-green-ink">
                    {settings.refundPromiseTitle}
                  </p>
                  {settings.refundPromiseDetail ? (
                    <p className="text-xs leading-relaxed text-[#166534]">
                      {settings.refundPromiseDetail}
                    </p>
                  ) : null}
                </div>
              ) : null}

              <div className="flex flex-col gap-1.5 rounded-2xl bg-tm-amber-bg p-4.5">
                <LockSimple
                  weight="duotone"
                  className="size-5.5 text-tm-amber"
                  aria-hidden="true"
                />
                <p className="text-sm font-bold leading-tight text-[#8A5A0A]">
                  {rateLockHours ? `Rate locked ${rateLockHours} hours.` : "Rate locked."}
                </p>
                <p className="tm-nums text-xs leading-relaxed text-[#8A5A0A]">
                  Mid-market {fxBuffer.display} buffer, shown on every quote.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Comparison ─────────────────────────────────────────────────── */}
      {compareRows.length > 0 ? (
        <section className="bg-tm-paper py-16 md:py-20">
          <div className={cn(MARKETING_GUTTER, "flex flex-col gap-8")}>
            <h2 className="text-[30px] font-bold leading-[1.05] md:text-[40px]">
              Compared with doing it yourself.
            </h2>
            <ComparisonTable rows={compareRows} />
          </div>
        </section>
      ) : null}
    </>
  );
}

/**
 * `?example=N` selects one of the admin's price presets. Anything that is not
 * an in-range index falls back to the first preset.
 */
function readPresetIndex(
  raw: string | string[] | undefined,
  presetCount: number,
): number {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value) return 0;
  const index = Number.parseInt(value, 10);
  return Number.isInteger(index) && index > 0 && index < presetCount
    ? index
    : 0;
}
