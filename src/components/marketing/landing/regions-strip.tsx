import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "@phosphor-icons/react/ssr";

import { cn } from "@/lib/utils";
import type { MediaOverrideMap } from "@/db/queries/media-overrides";
import { MARKETING_IMAGES, applyImageOverride , imagePosition } from "@/config/marketing-images";
import type { RegionRow } from "@/db/queries/regions";

export interface RegionsStripProps {
  regions: readonly RegionRow[];
  /** "from GH₵74 / lb" — the live freight rate, for lanes that are open. */
  freightLabel: string;
  /** Headline built from the live region set, e.g. "From the USA today. UK and China next." */
  headline: string;
  /** Supporting paragraph, likewise derived from the live region set. */
  blurb: string;
  /** Admin crop/src overrides from `media_overrides`. */
  mediaOverrides: MediaOverrideMap;
}

/** "14–18 days", "14 days", or null when the lane has no published window. */
export function transitWindow(region: RegionRow): string | null {
  const { transit_days_min: min, transit_days_max: max } = region;
  if (min == null && max == null) return null;
  if (min != null && max != null) {
    return min === max ? `${min} days` : `${min}–${max} days`;
  }
  return `${min ?? max} days`;
}

/** "US", "UK", "CN" — the two-letter chip the design draws. */
export function regionChip(region: RegionRow): string {
  return region.code === "CHINA" ? "CN" : region.code.slice(0, 2);
}

/**
 * "Where we buy" — one row per `regions` row, with the live lane's freight rate
 * resolved from the pricing engine and the others pointing at the waitlist.
 */
export function RegionsStrip({
  regions,
  freightLabel,
  headline,
  blurb,
  mediaOverrides,
}: RegionsStripProps) {
  if (regions.length === 0) return null;

  const regionsPhoto = applyImageOverride(
    MARKETING_IMAGES["mk-regions-photo"],
    mediaOverrides?.["mk-regions-photo"],
  );

  return (
    <section
      aria-labelledby="regions-heading"
      className="bg-card px-5 py-20 md:px-8 md:py-24"
    >
      <div className="mx-auto grid max-w-[1280px] items-center gap-12 lg:grid-cols-2">
        <div className="flex flex-col gap-5">
          <span className="text-[11px] font-semibold tracking-[0.14em] text-tm-coral uppercase">
            Where we buy
          </span>
          <h2
            id="regions-heading"
            className="text-[clamp(2rem,5vw,46px)] leading-[1.02] font-bold"
          >
            {headline}
          </h2>
          <p className="text-base leading-[1.5] text-tm-text-2">{blurb}</p>

          <ul className="flex flex-col gap-2.5">
            {regions.map((region, index) => {
              const live = region.status === "live";
              const days = transitWindow(region);

              return (
                <li
                  key={region.code}
                  className="tm-stagger grid grid-cols-[44px_1fr] items-center gap-3.5 rounded-2xl border border-tm-border bg-tm-paper px-4 py-3.5 sm:grid-cols-[44px_1fr_auto]"
                  style={{ "--tm-i": index + 1 } as React.CSSProperties}
                >
                  <span className="flex size-11 items-center justify-center rounded-xl border border-tm-border bg-card font-display text-[13px] font-bold">
                    {regionChip(region)}
                  </span>
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 text-[15px] leading-[1.2] font-semibold">
                      {region.name}
                      <span
                        className={cn(
                          "rounded-full px-2 py-1 text-[10px] leading-none font-bold tracking-[0.08em] uppercase",
                          live
                            ? "bg-tm-green-bg text-tm-green-ink"
                            : "bg-tm-amber-bg text-tm-amber",
                        )}
                      >
                        {live ? "Live" : "Soon"}
                      </span>
                    </p>
                    <p className="mt-[3px] truncate text-[13px] leading-[1.3] text-tm-text-2">
                      {region.store_names.join(", ")}
                    </p>
                  </div>
                  <div className="col-span-2 text-left sm:col-span-1 sm:text-right">
                    <span
                      className={cn(
                        "block text-sm leading-none font-bold",
                        live ? "text-tm-ink" : "text-tm-text-3",
                      )}
                    >
                      {days ?? "Coming soon"}
                    </span>
                    <span className="text-xs leading-[1.6] font-medium text-tm-text-3">
                      {live ? freightLabel : "join the waitlist"}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>

          <Link
            href="/where-we-buy"
            className="inline-flex w-fit items-center gap-1.5 rounded-sm text-sm font-semibold text-tm-coral outline-none hover:text-tm-coral-strong focus-visible:ring-3 focus-visible:ring-tm-coral/30"
          >
            Freight and timelines in detail
            <ArrowRight weight="bold" className="size-3.5" aria-hidden />
          </Link>
        </div>

        <div className="relative h-[360px] overflow-hidden rounded-[28px] bg-[linear-gradient(160deg,var(--tm-tint),var(--tm-amber-bg))] lg:h-[460px]">
          <Image
            src={regionsPhoto.src}
            alt={regionsPhoto.alt}
            width={regionsPhoto.width}
            height={regionsPhoto.height}
            sizes="(min-width: 1024px) 620px, 100vw"
            className="size-full object-cover"
              style={{ objectPosition: imagePosition(regionsPhoto) }}
          />
          <ul
            aria-hidden
            className="pointer-events-none absolute right-5 bottom-5 left-5 grid grid-cols-3 gap-2.5"
          >
            {regions.map((region) => (
              <li
                key={region.code}
                className="flex flex-col gap-1 rounded-2xl bg-card p-3.5"
              >
                <span className="text-[11px] leading-none font-bold tracking-[0.12em] text-tm-text-3">
                  {regionChip(region)} → ACC
                </span>
                <span
                  className={cn(
                    "font-display text-[15px] leading-none font-bold lg:text-lg",
                    region.status === "live" ? "text-tm-ink" : "text-tm-text-3",
                  )}
                >
                  {transitWindow(region) ?? "Soon"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
