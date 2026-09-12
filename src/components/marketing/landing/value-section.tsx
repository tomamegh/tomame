import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "@phosphor-icons/react/ssr";

import { cn } from "@/lib/utils";
import {
  imagePosition,
  resolveMarketingImage,
} from "@/config/marketing-images";
import type { MediaOverrideMap } from "@/db/queries/media-overrides";
import type { SiteContentRow } from "@/db/queries/site-content";
import type { WorkedExample } from "@/features/marketing/types";
import type { FeatureDemos } from "@/features/marketing/services/marketing-content.service";

import { LandedReceipt } from "./landed-receipt";
import { rowIcon } from "./icons";

/**
 * "Three things only a personal shopper can do" — the mock's four cards.
 *
 * The visual comes from the row's own `data.variant`, not from its slug, so an
 * admin can reorder or reword a card without silently losing its artwork. An
 * unknown variant still renders as copy on a plain card rather than vanishing.
 */
type ValueVisual = "receipt" | "freight_box" | "price_watch" | "buyer" | "none";

const VARIANTS = new Set<ValueVisual>([
  "receipt",
  "freight_box",
  "price_watch",
  "buyer",
]);

function variantOf(data: unknown): ValueVisual {
  if (!data || typeof data !== "object") return "none";
  const v = (data as Record<string, unknown>).variant;
  return typeof v === "string" && VARIANTS.has(v as ValueVisual)
    ? (v as ValueVisual)
    : "none";
}

function stringOf(data: unknown, key: string): string | null {
  if (!data || typeof data !== "object") return null;
  const v = (data as Record<string, unknown>)[key];
  return typeof v === "string" && v.length > 0 ? v : null;
}

export interface ValueSectionProps {
  /** `feature_card` rows, in `sort_order`. */
  featureCards: readonly SiteContentRow[];
  /** Priced live — feeds the receipt inset. */
  example: WorkedExample;
  /** Illustrative freight-box and price-watch figures, derived from admin knobs. */
  demos: FeatureDemos;
  /** Admin crop/src overrides from `media_overrides`. */
  mediaOverrides: MediaOverrideMap;
}

export function ValueSection({
  featureCards,
  example,
  demos,
  mediaOverrides,
}: ValueSectionProps) {
  if (featureCards.length === 0) return null;

  return (
    <section
      aria-labelledby="value-heading"
      className="bg-tm-paper px-5 py-20 md:px-8 md:py-24"
    >
      <div className="mx-auto flex max-w-[1280px] flex-col gap-11">
        <div className="flex flex-col justify-between gap-6 md:flex-row md:items-end md:gap-10">
          <h2
            id="value-heading"
            className="max-w-[600px] text-[clamp(2rem,5vw,46px)] leading-[1.02] font-bold"
          >
            Three things only a personal shopper can do.
          </h2>
          <p className="max-w-[380px] text-base leading-[1.5] text-tm-text-2">
            Not a marketplace. A team in Accra purchasing on your behalf — with
            the tools to prove it.
          </p>
        </div>

        <ul className="grid gap-5 lg:grid-cols-[1.2fr_1fr]">
          {featureCards.map((prop, index) => {
            const visual = variantOf(prop.data);
            const Icon = rowIcon(prop.data);
            // The receipt card fills the wide column; the photo card runs the
            // full width beneath both. Each pairs copy with its artwork.
            const split = visual === "receipt" || visual === "buyer";
            const buyerPhoto =
              visual === "buyer"
                ? resolveMarketingImage(
                    stringOf(prop.data, "photo_key"),
                    mediaOverrides,
                  )
                : null;

            return (
              <li
                key={prop.id}
                className={cn(
                  "tm-stagger flex flex-col gap-3.5 rounded-[26px] border p-6 md:p-7.5",
                  visual === "freight_box"
                    ? "border-tm-pill-border bg-[linear-gradient(160deg,var(--tm-tint),var(--tm-amber-bg))]"
                    : "border-tm-border bg-card",
                  split && "lg:grid lg:grid-cols-2 lg:items-center lg:gap-6",
                  visual === "buyer" && "lg:col-span-2",
                )}
                style={{ "--tm-i": index + 1 } as React.CSSProperties}
              >
                <div className="flex flex-col gap-3.5">
                  <span
                    className={cn(
                      "flex size-13 items-center justify-center rounded-2xl",
                      visual === "receipt" && "bg-tm-tint text-tm-coral",
                      visual === "freight_box" && "bg-card text-tm-amber",
                      visual === "price_watch" && "bg-tm-tint text-tm-coral",
                      visual === "buyer" && "bg-tm-green-bg text-tm-green",
                      visual === "none" && "bg-tm-tint text-tm-coral",
                    )}
                  >
                    <Icon weight="duotone" className="size-6.5" aria-hidden />
                  </span>
                  <h3 className="text-[22px] leading-[1.1] font-bold md:text-[26px]">
                    {prop.title}
                  </h3>
                  <p className="text-[15px] leading-[1.5] text-tm-text-2">
                    {prop.body}
                  </p>
                  {visual === "receipt" && (
                    <Link
                      href={stringOf(prop.data, "cta_href") ?? "/fees"}
                      className="inline-flex w-fit items-center gap-1.5 rounded-sm text-sm font-semibold text-tm-coral outline-none hover:text-tm-coral-strong focus-visible:ring-3 focus-visible:ring-tm-coral/30"
                    >
                      {stringOf(prop.data, "cta_label") ?? "See how fees work"}
                      <ArrowRight weight="bold" className="size-3.5" aria-hidden />
                    </Link>
                  )}
                </div>

                {visual === "receipt" && (
                  <div className="flex flex-col gap-[9px] rounded-[18px] border border-tm-border bg-tm-paper p-4.5">
                    <LandedReceipt example={example} />
                    <div className="tm-nums flex justify-between border-t border-dashed border-tm-border pt-2.5 text-base font-bold text-tm-ink">
                      <span>At your door</span>
                      <span>{example.total_ghs_display}</span>
                    </div>
                  </div>
                )}

                {visual === "freight_box" && demos.freightBox && (
                  <div className="mt-auto flex flex-col gap-3 pt-2">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="tm-nums text-[22px] leading-none font-bold">
                        {demos.freightBox.fillPct}% full
                      </span>
                      <span className="tm-nums text-[13px] font-semibold text-tm-green">
                        save {demos.freightBox.savingDisplay} with one more item
                      </span>
                    </div>
                    {/* The box fills from the left as items are added — tmFill. */}
                    <div className="h-2.5 overflow-hidden rounded-full bg-card">
                      <div
                        className="tm-fill h-full rounded-full bg-tm-coral"
                        style={{ width: `${demos.freightBox.fillPct}%` }}
                      />
                    </div>
                    <span className="tm-nums text-[11px] font-bold tracking-[0.12em] text-tm-text-3 uppercase">
                      {demos.freightBox.weightLbs} lb of{" "}
                      {demos.freightBox.capacityLbs} lb
                    </span>
                  </div>
                )}

                {visual === "price_watch" && demos.priceWatch && (
                  <div className="mt-auto flex flex-col gap-1.5 rounded-[18px] border border-tm-border bg-tm-paper p-4">
                    <span className="text-sm font-semibold">
                      {demos.priceWatch.title} dropped{" "}
                      <span className="tm-nums text-tm-green">
                        {demos.priceWatch.dropDisplay}
                      </span>
                    </span>
                    <span className="tm-nums text-xs font-medium text-tm-text-2">
                      Now {demos.priceWatch.landedDisplay} landed · tap to add
                    </span>
                  </div>
                )}

                {visual === "buyer" && buyerPhoto && (
                  <div className="relative h-52 overflow-hidden rounded-[18px] lg:h-[220px]">
                    <Image
                      src={buyerPhoto.src}
                      alt={buyerPhoto.alt}
                      width={buyerPhoto.width}
                      height={buyerPhoto.height}
                      sizes="(min-width: 1024px) 620px, 100vw"
                      className="size-full object-cover"
              style={{ objectPosition: imagePosition(buyerPhoto) }}
                    />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
