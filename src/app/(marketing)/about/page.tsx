import type { Metadata } from "next";
import Image from "next/image";

import {
  MARKETING_IMAGES,
  applyImageOverride,
  imagePosition,
} from "@/config/marketing-images";
import { getMediaOverrides } from "@/db/queries/media-overrides";

import {
  getSiteContentByKind,
  getSiteContentBySlug,
  type SiteContentRow,
} from "@/db/queries/site-content";
import { cn } from "@/lib/utils";
import { MarketingIcon } from "../_components/marketing-icon";
import { Eyebrow, MARKETING_GUTTER } from "../_components/marketing-primitives";

export const metadata: Metadata = {
  title: "About · Tomame",
  description:
    "Tomame buys, ships and delivers from abroad for customers in Ghana — with the price agreed before a cedi moves.",
};

/** Dimensions and alt text come from the manifest, never restated here. */
const PHOTO_KEYS = ["mk-about-1", "mk-about-2", "mk-about-3"] as const;


/** The story headline and paragraph are one `hero_copy` row, admin-editable. */
const STORY_SLUG = "about-story";

export default async function AboutPage() {
  const mediaOverrides = await getMediaOverrides();
  const PHOTOS = PHOTO_KEYS.map((key) =>
    applyImageOverride(MARKETING_IMAGES[key], mediaOverrides[key]),
  );

  const [story, stats, values] = await Promise.all([
    getSiteContentBySlug("hero_copy", STORY_SLUG),
    getSiteContentByKind("stat"),
    getSiteContentByKind("value_prop"),
  ]);

  const headlineStat = stats[0] ?? null;

  return (
    <>
      {/* ── Story ──────────────────────────────────────────────────────── */}
      <section className="bg-card pb-14 pt-16 md:pt-20">
        <div
          className={cn(
            MARKETING_GUTTER,
            "grid gap-10 lg:grid-cols-2 lg:items-end lg:gap-14",
          )}
        >
          <div className="tm-up flex flex-col gap-5">
            <Eyebrow>About</Eyebrow>
            <h1 className="text-[38px] font-bold leading-[0.98] sm:text-[48px] lg:text-[60px]">
              {story?.title ??
                "Buying from abroad shouldn't feel like asking a favour."}
            </h1>
          </div>
          {story?.body ? (
            <p
              className="tm-up text-[17px] leading-[1.55] text-tm-text-2 md:text-lg lg:pb-2"
              style={{ animationDelay: "0.12s" }}
            >
              {story.body}
            </p>
          ) : null}
        </div>
      </section>

      {/* ── Photo grid + headline stat ─────────────────────────────────── */}
      <section className="bg-card" aria-label="Inside Tomame">
        <div
          className={cn(
            MARKETING_GUTTER,
            "grid gap-4 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr]",
          )}
        >
          {PHOTOS.slice(0, 2).map((photo, index) => (
            <div
              key={photo.src}
              className="tm-up relative h-56 overflow-hidden rounded-3xl sm:h-72 lg:h-95"
              style={{ animationDelay: `${0.1 + index * 0.08}s` }}
            >
              <Image
                src={photo.src}
                alt={photo.alt}
                width={photo.width}
                height={photo.height}
                sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 420px"
                className="size-full object-cover"
                style={{ objectPosition: imagePosition(photo) }}
                priority={index === 0}
              />
            </div>
          ))}

          <div className="grid gap-4 sm:col-span-2 sm:grid-cols-2 lg:col-span-1 lg:grid-cols-1">
            <div
              className="tm-up relative h-56 overflow-hidden rounded-3xl sm:h-44 lg:h-[182px]"
              style={{ animationDelay: "0.26s" }}
            >
              <Image
                src={PHOTOS[2]!.src}
                alt={PHOTOS[2]!.alt}
                width={PHOTOS[2]!.width}
                height={PHOTOS[2]!.height}
                sizes="(max-width: 1024px) 50vw, 300px"
                className="size-full object-cover"
                style={{ objectPosition: imagePosition(PHOTOS[2]!) }}
              />
            </div>

            {headlineStat ? (
              <div
                className="tm-up flex flex-col justify-center gap-1.5 rounded-3xl bg-[linear-gradient(160deg,var(--tm-tint),var(--tm-amber-bg))] p-6 sm:h-44 lg:h-[182px]"
                style={{ animationDelay: "0.34s" }}
              >
                <span
                  className="tm-nums tm-pop text-4xl font-bold leading-none tracking-[-0.03em]"
                  style={{ animationDelay: "0.6s" }}
                >
                  {headlineStat.title}
                </span>
                <span className="text-[13px] font-medium leading-snug text-tm-text-2">
                  {headlineStat.body}
                </span>
              </div>
            ) : null}
          </div>
        </div>
      </section>

      {/* ── Values ─────────────────────────────────────────────────────── */}
      {values.length > 0 ? (
        <section className="bg-card py-20 md:py-24">
          <div className={cn(MARKETING_GUTTER, "grid gap-5 md:grid-cols-3")}>
            <h2 className="sr-only">What we stand for</h2>
            {values.map((value, index) => (
              <ValueCard
                key={value.slug}
                value={value}
                animationDelay={`${0.1 + index * 0.08}s`}
              />
            ))}
          </div>
        </section>
      ) : null}
    </>
  );
}

interface ValueCardProps {
  value: SiteContentRow;
  animationDelay: string;
}

function ValueCard({ value, animationDelay }: ValueCardProps) {
  const icon = typeof value.data.icon === "string" ? value.data.icon : null;

  return (
    <article
      className="tm-up flex min-h-55 flex-col gap-3.5 rounded-3xl border border-tm-border bg-tm-paper p-7"
      style={{ animationDelay }}
    >
      <span className="flex size-13 items-center justify-center rounded-2xl border border-tm-border bg-card">
        <MarketingIcon
          name={icon}
          weight="duotone"
          className="size-6.5 text-tm-coral"
        />
      </span>
      <h3 className="text-[22px] font-bold leading-tight">{value.title}</h3>
      <p className="text-[15px] leading-relaxed text-tm-text-2">{value.body}</p>
    </article>
  );
}
