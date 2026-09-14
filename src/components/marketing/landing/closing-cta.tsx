import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "@phosphor-icons/react/ssr";

import { cn } from "@/lib/utils";
import type { MediaOverrideMap } from "@/db/queries/media-overrides";
import { MARKETING_IMAGES, applyImageOverride , imagePosition } from "@/config/marketing-images";

export interface ClosingCtaProps {
  /** Sends signed-in visitors to the app instead of the sign-up form. */
  isAuthenticated: boolean;
  /** Admin crop/src overrides from `media_overrides`. */
  mediaOverrides: MediaOverrideMap;
}

/** The closing band: "Ready to shop the world?" */
export function ClosingCta({
  isAuthenticated,
  mediaOverrides,
}: ClosingCtaProps) {
  const ctaPhoto = applyImageOverride(
    MARKETING_IMAGES["mk-cta-photo"],
    mediaOverrides?.["mk-cta-photo"],
  );

  return (
    <section
      aria-labelledby="closing-cta-heading"
      className="bg-card px-5 pb-20 md:px-8 md:pb-24"
    >
      <div
        className={cn(
          "relative mx-auto grid max-w-[1280px] items-center gap-10 overflow-hidden rounded-[30px] border border-tm-pill-border p-8 md:p-16",
          "bg-[linear-gradient(135deg,var(--tm-tint),var(--tm-amber-bg)_60%,var(--card))]",
          "lg:grid-cols-[1.2fr_1fr]",
        )}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute -right-[120px] -bottom-[200px] size-[520px] rounded-full bg-[radial-gradient(circle,var(--tm-tint)_0%,transparent_65%)]"
        />

        <div className="relative flex flex-col gap-5">
          <h2
            id="closing-cta-heading"
            className="text-[clamp(2rem,6vw,54px)] leading-none font-bold tracking-[-0.03em]"
          >
            Ready to shop the world?
          </h2>
          <p className="max-w-[480px] text-[17px] leading-[1.5] text-tm-text-2">
            Free account. Quote anything in seconds. No card until you&rsquo;re
            ready to buy.
          </p>
          <div className="flex flex-wrap gap-2.5">
            <Link
              href={isAuthenticated ? "/app" : "/auth/signup"}
              className={cn(
                "tm-cta-gradient inline-flex h-13 items-center gap-2 rounded-[14px] px-6 text-[15px] font-bold",
                "shadow-[0_12px_28px_-12px_rgba(244,63,94,0.5)] transition-transform hover:scale-[1.02]",
                "outline-none focus-visible:ring-3 focus-visible:ring-tm-coral/40 focus-visible:ring-offset-1 focus-visible:ring-offset-card",
              )}
            >
              {isAuthenticated ? "Go to your dashboard" : "Create free account"}
              <ArrowRight weight="bold" className="size-4" aria-hidden />
            </Link>
            <Link
              href="/fees"
              className={cn(
                "inline-flex h-13 items-center rounded-[14px] border-[1.5px] border-tm-border bg-card px-5.5 text-[15px] font-semibold",
                "transition-colors hover:border-tm-coral/40 hover:bg-tm-tint",
                "outline-none focus-visible:ring-3 focus-visible:ring-tm-coral/30",
              )}
            >
              See fees
            </Link>
          </div>
        </div>

        <div className="relative h-56 overflow-hidden rounded-[22px] md:h-[280px]">
          <Image
            src={ctaPhoto.src}
            alt={ctaPhoto.alt}
            width={ctaPhoto.width}
            height={ctaPhoto.height}
            sizes="(min-width: 1024px) 460px, 100vw"
            className="size-full object-cover"
              style={{ objectPosition: imagePosition(ctaPhoto) }}
          />
        </div>
      </div>
    </section>
  );
}
