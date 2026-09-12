import type { Metadata } from "next";
import { ArrowUUpLeft, LockSimple } from "@phosphor-icons/react/ssr";

import { getSiteContentByKind } from "@/db/queries/site-content";
import {
  getFeeLines,
  getFeesWorkedExample,
  resolveMarketingFigures,
} from "@/features/marketing/services";
import { cn } from "@/lib/utils";
import { Eyebrow, MARKETING_GUTTER } from "../_components/marketing-primitives";
import { ComparisonTable } from "./_components/comparison-table";
import { FeeRow } from "./_components/fee-row";
import { WorkedExampleCard } from "./_components/worked-example-card";

export const metadata: Metadata = {
  title: "Fees · Tomame",
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

  const [feeLines, figures, compareRows, baseExample] = await Promise.all([
    getFeeLines(),
    resolveMarketingFigures(),
    getSiteContentByKind("compare_row"),
    getFeesWorkedExample(),
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
          <p className="max-w-[600px] text-[17px] leading-relaxed text-tm-text-2 md:text-lg">
            We charge{" "}
            <strong className="tm-nums font-semibold text-tm-ink">
              {serviceFee.display}
            </strong>{" "}
            of the item price
            {serviceFee.note
              ? ` — ${serviceFee.note}, depending on what you're buying`
              : ""}
            . Tax, freight and today&apos;s rate are charged at the rates below,
            and every one of them is on your receipt before you pay.
          </p>
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
              <div className="flex flex-col gap-1.5 rounded-2xl bg-tm-green-bg p-4.5">
                <ArrowUUpLeft
                  weight="duotone"
                  className="size-5.5 text-tm-green"
                  aria-hidden="true"
                />
                <p className="text-sm font-bold leading-tight text-tm-green-ink">
                  Can&apos;t source it? 100% back.
                </p>
                <p className="text-xs leading-relaxed text-[#166534]">
                  Including our fee, within 24 hours.
                </p>
              </div>

              <div className="flex flex-col gap-1.5 rounded-2xl bg-tm-amber-bg p-4.5">
                <LockSimple
                  weight="duotone"
                  className="size-5.5 text-tm-amber"
                  aria-hidden="true"
                />
                <p className="text-sm font-bold leading-tight text-[#8A5A0A]">
                  Rate locked 24 hours.
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
