import Link from "next/link";

import type { WorkedExample } from "@/features/marketing/types";
import { cn } from "@/lib/utils";
import { MARKETING_FOCUS_RING } from "../../_components/marketing-primitives";

/**
 * The worked example — design/Tomame - Marketing v2.dc.html #mk-fees.
 *
 * Every number here is a live `calculatePricing` run
 * (`getFeesWorkedExample`), so the table cannot drift from the engine: change
 * a pricing group, a constant or today's FX rate and the bars move with it.
 * The mock's $298 / 8% / 5% figures were sample copy and appear nowhere.
 *
 * `tmFill 1s <delay> cubic-bezier(.16,1,.3,1)` on each bar is the signature
 * animation of this page — bars grow from the left as the rows print in.
 */

/** Row entry delays from the mock; the bar shares its row's delay. */
const ROW_DELAYS = ["0.3s", "0.45s", "0.6s", "0.75s", "0.9s"] as const;

const BAR_TONE: Record<WorkedExample["rows"][number]["tone"], string> = {
  ink: "bg-tm-ink",
  accent: "bg-tm-coral",
  muted: "bg-[#C9BDB5]",
};

export interface WorkedExampleCardProps {
  example: WorkedExample;
  /** Index into `price_preset_displays` currently being priced. */
  activePresetIndex: number;
  /** Builds the href for preset `index`, so the card owns no routing. */
  presetHref: (index: number) => string;
  className?: string;
}

export function WorkedExampleCard({
  example,
  activePresetIndex,
  presetHref,
  className,
}: WorkedExampleCardProps) {
  return (
    <div className={cn("flex flex-col gap-3.5", className)}>
      <section
        aria-labelledby="worked-example-heading"
        className="overflow-hidden rounded-3xl border border-tm-border bg-card shadow-[0_30px_60px_-36px_rgba(43,36,34,0.25)]"
      >
        <header className="flex flex-col gap-2 bg-[linear-gradient(160deg,var(--tm-tint),var(--tm-amber-bg))] px-6 pb-4 pt-5">
          <span className="text-[11px] font-semibold uppercase leading-none tracking-[0.14em] text-tm-coral-strong">
            Worked example
          </span>
          <h2
            id="worked-example-heading"
            className="text-xl font-bold leading-tight"
          >
            {example.headline}
          </h2>

          {example.price_preset_displays.length > 1 ? (
            <nav
              aria-label="Price presets"
              className="flex flex-wrap gap-1.5 pt-1"
            >
              {example.price_preset_displays.map((preset, index) => {
                const active = index === activePresetIndex;
                return (
                  <Link
                    key={preset}
                    href={presetHref(index)}
                    scroll={false}
                    aria-current={active ? "true" : undefined}
                    className={cn(
                      "tm-nums rounded-full px-2.5 py-1.5 text-xs font-semibold leading-none transition-colors",
                      MARKETING_FOCUS_RING,
                      active
                        ? "bg-card text-tm-ink"
                        : "bg-card/50 text-tm-text-3 hover:bg-card/80 hover:text-tm-ink",
                    )}
                  >
                    {preset}
                  </Link>
                );
              })}
            </nav>
          ) : null}
        </header>

        {example.needs_review ? (
          <p className="px-6 py-5 text-sm leading-relaxed text-tm-text-2">
            This example needs a human. We quote items the engine can&apos;t
            price automatically by hand, usually within a few hours — the price
            you see is still the price you pay.
          </p>
        ) : (
          <>
            <dl className="tm-nums flex flex-col gap-3 px-6 py-4.5 text-sm font-medium leading-none text-tm-text-2">
              {example.rows.map((row, index) => {
                const delay = ROW_DELAYS[index] ?? `${0.3 + index * 0.15}s`;
                return (
                  <div
                    key={row.key}
                    className="tm-up flex flex-col gap-1.5 [animation-duration:0.45s]"
                    style={{ animationDelay: delay }}
                  >
                    <div className="flex justify-between gap-3">
                      <dt>{row.label}</dt>
                      <dd className="text-tm-ink">{row.value}</dd>
                    </div>
                    <div
                      className="h-1.5 overflow-hidden rounded-full bg-tm-hairline"
                      aria-hidden="true"
                    >
                      <div
                        className={cn(
                          "tm-fill h-full [animation-duration:1s]",
                          BAR_TONE[row.tone],
                        )}
                        style={{
                          width: `${row.bar_pct}%`,
                          animationDelay: delay,
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </dl>

            <footer className="flex items-baseline justify-between gap-4 border-t border-dashed border-[#E8DDD6] px-6 pb-6 pt-4">
              <span className="text-[15px] font-semibold leading-none">
                At your door
              </span>
              <span className="text-right">
                <span
                  className="tm-nums tm-pop block text-[28px] font-bold leading-none tracking-[-0.03em] sm:text-[32px]"
                  style={{ animationDelay: "1.4s" }}
                >
                  {example.total_ghs_display}
                </span>
                <span className="tm-nums mt-1.5 block text-xs font-medium leading-snug text-tm-text-3">
                  {example.total_usd_display} · {example.tomame_keeps_display}
                </span>
              </span>
            </footer>
          </>
        )}
      </section>
    </div>
  );
}
