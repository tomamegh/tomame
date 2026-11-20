import { Package } from "@phosphor-icons/react";

import { StoreImage } from "@/components/store-image";
import { cn } from "@/lib/utils";

const SIZES = {
  sm: { box: "size-16", px: 64, icon: 26 },
  md: { box: "size-20", px: 80, icon: 32 },
  lg: { box: "size-24 @md:size-28", px: 112, icon: 40 },
} as const;

interface ProductThumbProps {
  src: string | null;
  size: keyof typeof SIZES;
  className?: string;
}

/**
 * A store photo on a white tile. Store photos are shot on white, so the tile
 * stays white in dark mode rather than boxing the product in grey. Decorative:
 * the title next to it names the product.
 */
export function ProductThumb({ src, size, className }: ProductThumbProps) {
  const s = SIZES[size];
  return (
    <span
      className={cn(
        "relative flex shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border bg-white",
        s.box,
        className,
      )}
    >
      {src ? (
        <StoreImage src={src} alt="" fill sizes={`${s.px}px`} className="object-contain p-1.5" />
      ) : (
        <Package size={s.icon} weight="duotone" className="text-tm-text-3" aria-hidden />
      )}
    </span>
  );
}
