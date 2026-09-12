import Image from "next/image";

import { cn } from "@/lib/utils";

/**
 * The Tomame logo, in the three forms the brand actually has.
 *
 * One component rather than eleven hand-rolled spellings: before this, the
 * wordmark was CSS gradient text in four places and differently-styled plain
 * text in seven more, so a brand change meant finding all of them. Anything
 * that shows the logo should render this.
 *
 * Variants:
 *   mark       — globe, plane and container alone.
 *   wordmark   — the "tomame" lettering alone.
 *   horizontal — mark beside wordmark. The default, and the right shape for a
 *                nav: the supplied artwork stacks vertically, which a 64-76px
 *                bar cannot fit, so the two pieces are composed side by side.
 *   lockup     — the artwork as supplied: mark over wordmark over tagline.
 *                Needs real height (100px+) to be legible. Footers, auth.
 *
 * The assets are transparent WebP at their natural aspect ratio, so height is
 * the control: set `height` and the width follows. next/image still generates
 * the responsive sizes.
 */

export type LogoVariant = "mark" | "wordmark" | "lockup" | "horizontal";

interface LogoAsset {
  src: string;
  width: number;
  height: number;
  /**
   * Widest this variant is ever rendered, as a `sizes` hint.
   *
   * Without it next/image assumes the image may fill the viewport and fetches
   * the 1920px entry for a 26px-tall logo. These are small fixed-size marks,
   * so naming the real ceiling lets it pick a sane srcset entry (retina
   * included).
   */
  sizes: string;
}

/** File-backed variants. `horizontal` is composed from two of these. */
type FileVariant = Exclude<LogoVariant, "horizontal">;

const ASSETS: Record<FileVariant, LogoAsset> = {
  mark: {
    src: "/images/brand/logo-mark.webp",
    width: 560,
    height: 259,
    sizes: "120px",
  },
  wordmark: {
    src: "/images/brand/logo-wordmark.webp",
    width: 680,
    height: 95,
    sizes: "200px",
  },
  lockup: {
    src: "/images/brand/logo-lockup.webp",
    width: 900,
    height: 599,
    sizes: "(max-width: 768px) 260px, 360px",
  },
};

export interface LogoProps {
  variant?: LogoVariant;
  /**
   * Rendered height in px. Width follows the asset's aspect ratio.
   * Omit it and size with `className` instead (e.g. "h-[22px] md:h-[26px]")
   * when the height is responsive — one element beats rendering two and
   * hiding one, which downloads the asset twice.
   */
  height?: number;
  className?: string;
  /** Override the variant's default `sizes` when rendered unusually large. */
  sizes?: string;
  /**
   * Set when the logo is the only content of a link or button that already
   * carries its own label — the image then needs no duplicate alt text.
   */
  decorative?: boolean;
  priority?: boolean;
}

export function Logo({
  variant = "horizontal",
  height,
  className,
  sizes,
  decorative = false,
  priority = false,
}: LogoProps) {
  if (variant === "horizontal") {
    // The mark is rendered ~1.55x the wordmark's height so the lettering
    // optically matches the artwork rather than being dwarfed by it.
    const h = height ?? 26;
    return (
      <span
        className={cn("inline-flex items-center gap-2", className)}
        // A single accessible name for the pair; the images themselves are
        // decorative so a screen reader announces "Tomame" once, not twice.
        role="img"
        aria-label={decorative ? undefined : "Tomame"}
        aria-hidden={decorative || undefined}
      >
        <Logo variant="mark" height={Math.round(h * 1.55)} decorative priority={priority} />
        <Logo variant="wordmark" height={h} decorative priority={priority} />
      </span>
    );
  }

  const asset = ASSETS[variant];
  // Intrinsic size is always the asset's own, so next/image gets the true
  // aspect ratio; the rendered size comes from `height` or from className.
  const renderHeight = height
    ? { height, width: Math.round((asset.width / asset.height) * height) }
    : undefined;

  return (
    <Image
      src={asset.src}
      // An empty alt on a decorative image is correct, not an omission: the
      // surrounding link already announces "Tomame — home", and a second
      // announcement would just be noise for a screen-reader user.
      alt={decorative ? "" : "Tomame"}
      width={asset.width}
      height={asset.height}
      priority={priority}
      sizes={sizes ?? asset.sizes}
      className={cn("w-auto object-contain", className)}
      style={renderHeight}
    />
  );
}
