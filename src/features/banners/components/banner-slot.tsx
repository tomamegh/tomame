import { cn } from "@/lib/utils";
import { getLiveBanners } from "../services/banners.service";
import type { BannerPlacement } from "../types";
import { SiteBanner } from "./site-banner";

/**
 * Server component: the live banners for one slot (089), or nothing at all — an
 * empty slot renders no wrapper, so a page without a banner keeps its layout.
 */
export async function BannerSlot({ placement, className }: { placement: BannerPlacement; className?: string }) {
  const banners = await getLiveBanners(placement);
  if (banners.length === 0) return null;
  return (
    <div className={cn("flex flex-col gap-2.5 empty:hidden", className)} data-banner-slot={placement}>
      {banners.map((banner) => (
        <SiteBanner key={banner.id} banner={banner} />
      ))}
    </div>
  );
}
