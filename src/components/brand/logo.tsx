import Image from "next/image";

import { cn } from "@/lib/utils";
import { BrandMark } from "./brand-mark";

/**
 * The Tomame logo, in the three forms the brand actually has.
 *
 * One component rather than eleven hand-rolled spellings: before this, the
 * wordmark was CSS gradient text in four places and differently-styled plain
 * text in seven more, so a brand change meant finding all of them. Anything
 * that shows the logo should render this.
 *
 * Variants:
 *   symbol     — the vector tile (`BrandMark`): the mark at small sizes.
 *   horizontal — symbol beside the wordmark. The default, and the one header
 *                treatment across marketing, app and auth (2026-11-20).
 *   wordmark   — the "tomame" lettering alone.
 *   mark       — the illustrated globe, plane and container. Big moments only
 *                (splash, empty hero): it blurs below about 60 px.
 *   lockup     — the artwork as supplied: mark over wordmark over tagline.
 *                Needs real height (100px+) to be legible.
 *
 * The assets are transparent WebP at their natural aspect ratio, so height is
 * the control: set `height` and the width follows. next/image still generates
 * the responsive sizes.
 */

export type LogoVariant = "mark" | "wordmark" | "lockup" | "horizontal" | "symbol";

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
type FileVariant = Exclude<LogoVariant, "horizontal" | "symbol">;

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
  if (variant === "symbol") {
    return <BrandMark size={height ?? 28} className={className} decorative={decorative} />;
  }

  if (variant === "horizontal") {
    // The vector mark, not the illustration: the globe/plane/container artwork
    // blurs at header sizes (2026-11-20). The tile is ~1.3x the lettering's
    // height so the two read as one lockup.
    const h = height ?? 22;
    return (
      <span
        className={cn("inline-flex items-center gap-2", className)}
        // A single accessible name for the pair; the parts are decorative so a
        // screen reader announces "Tomame" once, not twice.
        role="img"
        aria-label={decorative ? undefined : "Tomame"}
        aria-hidden={decorative || undefined}
      >
        <BrandMark size={Math.round(h * 1.3)} decorative />
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
