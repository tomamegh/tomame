import Image from "next/image";
import { AirplaneTilt, CheckCircle } from "@phosphor-icons/react/ssr";

import { cn } from "@/lib/utils";
import type { MediaOverrideMap } from "@/db/queries/media-overrides";
import type { SiteContentRow } from "@/db/queries/site-content";
import { MARKETING_IMAGES, applyImageOverride, getProductImage , imagePosition } from "@/config/marketing-images";
import type { WorkedExample } from "@/features/marketing/types";

import { LandedReceipt } from "./landed-receipt";
import { PasteBar } from "./paste-bar";
import { StoreCycler } from "./store-cycler";

export interface LandingHeroProps {
  /** Buffered USD→GHS, already resolved server-side. Display only. */
  usdToGhs: number;
  /** "the USA" — the live region, from `regions`. */
  originLabel: string;
  /** Store names carried by the live region. */
  cyclerStores: readonly string[];
  /** `trust_chip` rows. */
  trustChips: readonly SiteContentRow[];
  /** The landed-price receipt, priced live by the engine. */
  example: WorkedExample;
  /** "14–18 days" — the live region's transit window. */
  transitLabel: string | null;
  /** Admin crop/src overrides from `media_overrides`. */
  mediaOverrides: MediaOverrideMap;
}

/**
 * Landing hero — design/Tomame - Marketing v2.dc.html #mk-landing.
 *
 * Server component throughout except the paste bar. Every figure on the
 * floating receipt is the pricing engine's output, so the hero cannot drift
 * from what a visitor is actually quoted.
 */
export function LandingHero({
  usdToGhs,
  originLabel,
  cyclerStores,
  trustChips,
  example,
  transitLabel,
  mediaOverrides,
}: LandingHeroProps) {
  const heroPhoto = applyImageOverride(
    MARKETING_IMAGES["mk-hero-photo"],
    mediaOverrides?.["mk-hero-photo"],
  );
  const productImage = getProductImage(example.input.product_image_key);

  return (
    <section
      aria-labelledby="hero-heading"
      className="relative overflow-hidden bg-card px-5 pt-14 pb-16 md:px-8 md:pt-20 md:pb-[72px]"
    >
      {/* Warm ambient wash — decorative. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-[220px] -right-[220px] size-[760px] rounded-full bg-[radial-gradient(circle,var(--tm-tint)_0%,transparent_65%)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-[260px] -left-[160px] size-[520px] rounded-full bg-[radial-gradient(circle,var(--tm-amber-bg)_0%,transparent_65%)]"
      />

      {/*
        `minmax(0,1fr)` on the phone column, not the implicit `1fr`. An implicit
        track is `minmax(auto,1fr)`, and its `auto` floor is the widest item's
        min-content — which for the receipt card is its `truncate`d product
        title laid out on one line (~320px) plus padding. On a 390px phone that
        grew the track to 424px, so the paste bar and both cards ran off the
        right edge and looked cut off (Kelvin's screenshot). With a zero floor
        the track is the container's width and `truncate` does its job.
      */}
      <div className="relative mx-auto grid max-w-[1280px] grid-cols-[minmax(0,1fr)] items-center gap-12 lg:grid-cols-[1.05fr_1fr]">
        <div className="tm-up flex flex-col gap-6 [animation-duration:0.7s] md:gap-[26px]">
          <p className="flex w-fit items-center gap-2 rounded-full border border-tm-border bg-card px-3 py-2 text-[13px] font-medium text-tm-text-2">
            <span className="relative inline-flex size-2 shrink-0">
              <span className="tm-pulse-dot absolute inset-0 rounded-full bg-tm-green" />
              <span className="absolute inset-0 rounded-full bg-tm-green" />
            </span>
            <span className="tm-nums">
              $1 = GH₵{usdToGhs.toFixed(2)} today
            </span>
            <span aria-hidden>·</span>
            <span>shipping from {originLabel}</span>
          </p>

          <h1
            id="hero-heading"
            className="text-[clamp(2.75rem,9vw,74px)] leading-[0.98] font-bold"
          >
            Shop the world.
            <br />
            <span className="bg-[image:var(--tm-gradient)] bg-clip-text text-transparent">
              Pay in cedis.
            </span>
          </h1>

          <p className="max-w-[520px] text-[17px] leading-[27px] text-tm-text-2 md:text-[18px]">
            Paste a link from{" "}
            <StoreCycler stores={cyclerStores} rowHeight={27} /> and see the
            full price at your door before you pay: item, tax, fee, freight.
            MoMo or card. We buy it, fly it, deliver it.
          </p>

          <PasteBar />

          {trustChips.length > 0 && (
            <ul className="flex flex-wrap gap-x-[18px] gap-y-2 text-[13px] font-medium text-tm-text-2">
              {trustChips.map((chip) => (
                <li key={chip.id} className="flex items-center gap-1.5">
                  <CheckCircle
                    weight="fill"
                    className="size-4 shrink-0 text-tm-green"
                    aria-hidden
                  />
                  {chip.title}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="tm-up relative flex min-w-0 flex-col gap-6 [animation-delay:0.15s] [animation-duration:0.7s] lg:block lg:h-[520px] lg:gap-0">
          <div
            className={cn(
              "tm-float-soft relative z-10 flex w-full min-w-0 flex-col gap-3 rounded-[26px] border border-tm-border bg-card p-5",
              "shadow-[0_40px_80px_-40px_rgba(43,36,34,0.3)]",
              "lg:absolute lg:top-0 lg:right-0 lg:w-[356px]",
            )}
          >
            <div className="flex items-center gap-3">
              {productImage ? (
                <Image
                  src={productImage.src}
                  alt={productImage.alt}
                  width={productImage.width}
                  height={productImage.height}
                  sizes="52px"
                  className="size-13 shrink-0 rounded-xl border border-tm-hairline bg-white object-contain p-1"
                />
              ) : (
                /* No product image authored — the design's striped placeholder. */
                <span
                  aria-hidden
                  className="size-13 shrink-0 rounded-xl bg-[repeating-linear-gradient(135deg,var(--tm-paper)_0_6px,var(--tm-border)_6px_12px)]"
                />
              )}
              <div className="min-w-0">
                <p className="truncate text-sm leading-[1.3] font-semibold">
                  {example.input.product_title}
                </p>
                <p className="tm-nums mt-[3px] truncate text-xs font-medium text-tm-text-3">
                  {example.rows[0]?.value} · {example.input.category}
                </p>
              </div>
            </div>

            <LandedReceipt example={example} motion="print" />

            <div className="flex items-baseline justify-between border-t border-dashed border-tm-border pt-3">
              <span className="text-sm font-semibold">At your door</span>
              <span className="tm-nums tm-pop text-[26px] leading-none font-bold tracking-[-0.02em] [animation-delay:1.2s] [animation-duration:0.6s]">
                {example.total_ghs_display}
              </span>
            </div>

            <span className="tm-cta-gradient flex h-11 items-center justify-center rounded-xl text-sm font-bold">
              Pay with MoMo
            </span>
          </div>

          <div
            className={cn(
              "relative aspect-[3/4] w-full overflow-hidden rounded-[28px]",
              "shadow-[0_30px_60px_-30px_rgba(43,36,34,0.35)]",
              "lg:absolute lg:top-5 lg:left-0 lg:aspect-auto lg:h-[400px] lg:w-[300px]",
            )}
          >
            <Image
              src={heroPhoto.src}
              alt={heroPhoto.alt}
              width={heroPhoto.width}
              height={heroPhoto.height}
              priority
              sizes="(min-width: 1024px) 300px, 100vw"
              className="size-full object-cover"
              style={{ objectPosition: imagePosition(heroPhoto) }}
            />
          </div>

          {transitLabel && (
            <span
              className={cn(
                "tm-pop flex w-fit items-center gap-2 rounded-full bg-tm-green-bg px-3.5 py-2.5 text-[13px] font-semibold text-tm-green-ink",
                "shadow-[0_10px_30px_-14px_rgba(30,154,92,0.5)] [animation-delay:1.5s] [animation-duration:0.6s]",
                "lg:absolute lg:bottom-[70px] lg:left-[250px] lg:z-20",
              )}
            >
              <AirplaneTilt weight="fill" className="size-4" aria-hidden />
              Landed in Accra · {transitLabel}
            </span>
          )}
        </div>
      </div>
    </section>
  );
}
