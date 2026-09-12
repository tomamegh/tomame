import Image from "next/image";

import {
  imagePosition,
  resolveMarketingImage,
} from "@/config/marketing-images";
import type { MediaOverrideMap } from "@/db/queries/media-overrides";

import type { RegionRow } from "@/db/queries/regions";
import { cn } from "@/lib/utils";
import { StatusPill } from "../../_components/marketing-primitives";
import { transitBand } from "../_lib/lane-map-nodes";
import { WaitlistForm } from "./waitlist-form";

/**
 * One purchasing lane — design/Tomame - Marketing v2.dc.html #mk-regions.
 *
 * `photo_key` addresses the designer's photo by name, so the card never knows
 * a path per region: an admin pointing UK at a new file is a data edit.
 * `status !== 'live'` dims the card and swaps the freight figure for a real
 * waitlist form, because only a live lane is purchasable.
 */

/** All three lane photos are exported at the same size. */

export interface RegionCardProps {
  region: RegionRow;
  /** "GH₵72/lb" — the live freight rate, shown on open lanes only. */
  freightDisplay: string;
  /** "1 lb minimum". */
  freightNote: string | null;
  /** Entry animation delay from the mock: ".1s", ".2s", ".3s". */
  animationDelay: string;
  /** Admin crop/src overrides from `media_overrides`. */
  mediaOverrides: MediaOverrideMap;
}

export function RegionCard({
  region,
  freightDisplay,
  freightNote,
  animationDelay,
  mediaOverrides,
}: RegionCardProps) {
  const isLive = region.status === "live";
  const photo = resolveMarketingImage(region.photo_key, mediaOverrides);
  const band = transitBand(region);

  return (
    <article
      className="tm-up flex flex-col overflow-hidden rounded-3xl border border-tm-border bg-tm-paper"
      style={{ animationDelay }}
    >
      {photo ? (
        <div className="relative h-50 w-full overflow-hidden">
          <Image
            src={photo.src}
            alt=""
            width={photo.width}
            height={photo.height}
            sizes="(max-width: 768px) 100vw, (max-width: 1280px) 50vw, 400px"
            style={{ objectPosition: imagePosition(photo) }}
            className={cn(
              "size-full object-cover",
              !isLive && "opacity-70 saturate-50",
            )}
          />
        </div>
      ) : null}

      <div className="flex flex-1 flex-col gap-3.5 p-6">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-2xl font-bold leading-tight">{region.name}</h3>
          <StatusPill status={region.status} />
        </div>

        {region.blurb ? (
          <p
            className={cn(
              "text-sm leading-relaxed",
              isLive ? "text-tm-text-2" : "text-tm-text-3",
            )}
          >
            {region.blurb}
          </p>
        ) : null}

        <dl className="grid grid-cols-2 gap-2 pt-1.5">
          <div className="rounded-xl bg-card p-3">
            <dt className="text-[11px] font-medium leading-none text-tm-text-3">
              Link to door
            </dt>
            <dd
              className={cn(
                "tm-nums mt-1.5 text-[15px] font-bold leading-none",
                isLive ? "text-tm-ink" : "text-tm-text-3",
              )}
            >
              {isLive ? (band ?? "Open") : "Coming soon"}
            </dd>
          </div>
          <div className="rounded-xl bg-card p-3">
            <dt className="text-[11px] font-medium leading-none text-tm-text-3">
              Freight from
            </dt>
            <dd
              className={cn(
                "tm-nums mt-1.5 text-[15px] font-bold leading-none",
                isLive ? "text-tm-ink" : "text-tm-text-3",
              )}
            >
              {isLive ? freightDisplay : "Join the waitlist"}
            </dd>
            {isLive && freightNote ? (
              <dd className="tm-nums mt-1 text-[11px] font-medium leading-none text-tm-text-3">
                {freightNote}
              </dd>
            ) : null}
          </div>
        </dl>

        {region.tag_names.length > 0 ? (
          <ul className="flex flex-wrap gap-1.5">
            {region.tag_names.map((tag) => (
              <li
                key={tag}
                className={cn(
                  "rounded-full border border-tm-border bg-card px-2.5 py-1.5",
                  "text-xs font-medium leading-none",
                  isLive ? "text-tm-text-2" : "text-tm-text-3",
                )}
              >
                {tag}
              </li>
            ))}
          </ul>
        ) : null}

        {region.store_names.length > 0 ? (
          <p className="text-xs leading-relaxed text-tm-text-3">
            {region.store_names.join(" · ")}
          </p>
        ) : null}

        {!isLive ? (
          <WaitlistForm
            regionCode={region.code}
            regionName={region.name}
            className="mt-auto pt-2"
          />
        ) : null}
      </div>
    </article>
  );
}
