import type { Metadata } from "next";
import Image from "next/image";
import { ListMagnifyingGlass, MapPin } from "@phosphor-icons/react/ssr";

import {
  getRegionsContent,
  resolveMarketingFigures,
} from "@/features/marketing/services";
import { formatGhsCompact } from "@/features/marketing/format";
import { pickDefaultDoorZone } from "@/features/delivery/zones";
import { cn } from "@/lib/utils";
import {
  Eyebrow,
  MARKETING_GUTTER,
  PrimaryCta,
  SecondaryCta,
} from "../_components/marketing-primitives";
import { LaneMap } from "./_components/lane-map";
import { RegionCard } from "./_components/region-card";
import { buildHeroCopy, laneNames } from "./_lib/copy";
import { buildLaneMapNodes, GHANA_FLAG } from "./_lib/lane-map-nodes";
import { getMediaOverrides } from "@/db/queries/media-overrides";
import { imagePosition, resolveMarketingImage } from "@/config/marketing-images";

export const metadata: Metadata = {
  title: "Where we buy · Tomame",
  description:
    "The lanes Tomame buys on today, what freight costs, and how your box gets from the airport to your door in Ghana.",
};

/** The mock's per-card entry delays. */
const CARD_DELAYS = ["0.1s", "0.2s", "0.3s"] as const;

export default async function WhereWeBuyPage() {
  const [{ regions, deliveryZones }, figures, mediaOverrides] = await Promise.all([
    getRegionsContent(),
    resolveMarketingFigures(),
      getMediaOverrides(),
  ]);

  const visibleRegions = regions.filter((region) => region.status !== "off");
  const liveRegions = visibleRegions.filter(
    (region) => region.status === "live",
  );
  const soonRegions = visibleRegions.filter(
    (region) => region.status === "soon",
  );

  const hero = buildHeroCopy({
    live: liveRegions,
    soon: soonRegions,
    zones: deliveryZones,
    hasPickup: deliveryZones.some((zone) => zone.kind === "pickup"),
  });

  const nodes = buildLaneMapNodes(visibleRegions);

  // Resolved rather than hardcoded, so an admin's /builder upload and crop
  // actually reach this page. A literal src here silently bypassed
  // media_overrides entirely.
  const deliveryPhoto = resolveMarketingImage("mk-delivery-photo", mediaOverrides);
  const freight = figures.freight_rate_per_lb;
  // The same zone the quote's ETA assumes; the "free" sentence only when it is.
  const defaultDoorZone = pickDefaultDoorZone(deliveryZones);
  const freeDoorZone =
    defaultDoorZone && defaultDoorZone.fee_ghs === 0 ? defaultDoorZone : null;

  return (
    <>
      {/* ── Hero + arc map ─────────────────────────────────────────────── */}
      <section className="bg-tm-paper py-16 md:py-20">
        <div
          className={cn(
            MARKETING_GUTTER,
            "grid items-center gap-12 lg:grid-cols-2 lg:gap-14",
          )}
        >
          <div className="tm-up flex flex-col gap-6">
            <Eyebrow>Where we buy</Eyebrow>
            <h1 className="text-[40px] font-bold leading-[0.98] sm:text-[52px] lg:text-[62px]">
              {hero.heading}
            </h1>
            <p className="max-w-[520px] text-[17px] leading-relaxed text-tm-text-2 md:text-lg">
              {hero.body}
            </p>
            <div className="flex flex-wrap gap-2.5">
              <PrimaryCta href="/app/orders/new">Quote something</PrimaryCta>
              <SecondaryCta href="#stores">
                <ListMagnifyingGlass className="size-4" aria-hidden="true" />
                Stores we read
              </SecondaryCta>
            </div>
          </div>

          <div
            className="tm-up lg:justify-self-end"
            style={{ animationDelay: "0.15s" }}
          >
            <LaneMap
              nodes={nodes}
              destinationLabel={`${GHANA_FLAG} Accra`}
              className="lg:w-[600px]"
            />
          </div>
        </div>
      </section>

      {/* ── Lane cards ─────────────────────────────────────────────────── */}
      <section id="stores" className="scroll-mt-24 bg-card py-20 md:py-24">
        <div className={cn(MARKETING_GUTTER, "flex flex-col gap-8")}>
          <h2 className="max-w-[600px] text-[32px] font-bold leading-[1.02] md:text-[44px]">
            {liveRegions.length > 0
              ? `The ${laneNames(liveRegions)} lane${liveRegions.length > 1 ? "s" : ""} today — and what's next.`
              : "The lanes we're opening."}
          </h2>

          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {visibleRegions.map((region, index) => (
              <RegionCard
              mediaOverrides={mediaOverrides}
                key={region.code}
                region={region}
                freightDisplay={`from ${freight.display}`}
                freightNote={freight.note}
                animationDelay={CARD_DELAYS[index] ?? `${0.1 + index * 0.1}s`}
              />
            ))}
          </div>
        </div>
      </section>

      {/* ── Delivery in Ghana ──────────────────────────────────────────── */}
      <section className="bg-tm-paper py-20 md:py-24">
        <div
          className={cn(
            MARKETING_GUTTER,
            "grid items-center gap-12 lg:grid-cols-2",
          )}
        >
          <div className="flex flex-col gap-5">
            <Eyebrow>Delivery in Ghana</Eyebrow>
            <h2 className="text-[32px] font-bold leading-[1.02] md:text-[44px]">
              {freeDoorZone
                ? `Door delivery in ${shortZoneName(freeDoorZone.name)} is free. Everywhere else is flat.`
                : "Flat delivery, everywhere in Ghana."}
            </h2>
            <p className="text-base leading-relaxed text-tm-text-2">
              Once your box lands at Kotoka, a Tomame rider brings it to you.
              Outside Greater Accra we hand over to trusted partners with the
              same tracking.
            </p>

            <ul className="flex flex-col gap-2">
              {deliveryZones.map((zone, index) => {
                const free = zone.fee_ghs === 0;
                return (
                  <li
                    key={zone.id}
                    className={cn(
                      "tm-up flex flex-wrap items-center justify-between gap-x-4 gap-y-1",
                      "rounded-xl border border-tm-border bg-card px-4 py-3",
                      "text-sm font-medium leading-none",
                    )}
                    style={{ animationDelay: `${0.1 + index * 0.07}s` }}
                  >
                    <span className="flex items-center gap-2.5">
                      <MapPin
                        weight="duotone"
                        className="size-4.5 shrink-0 text-tm-coral"
                        aria-hidden="true"
                      />
                      {zone.name}
                    </span>
                    <span className="flex items-center gap-4.5 text-tm-text-2">
                      <span>{zoneTiming(zone.note, zone.extra_days)}</span>
                      <span
                        className={cn(
                          "tm-nums min-w-[70px] text-right font-bold",
                          free ? "text-tm-green" : "text-tm-ink",
                        )}
                      >
                        {free ? "Free" : formatGhsCompact(zone.fee_ghs)}
                      </span>
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>

          {deliveryPhoto ? (
            <div className="relative h-80 overflow-hidden rounded-3xl lg:h-[480px]">
              <Image
                src={deliveryPhoto.src}
                alt={deliveryPhoto.alt}
                width={deliveryPhoto.width}
                height={deliveryPhoto.height}
                sizes="(max-width: 1024px) 100vw, 600px"
                className="size-full object-cover"
                style={{ objectPosition: imagePosition(deliveryPhoto) }}
              />
            </div>
          ) : null}
        </div>
      </section>
    </>
  );
}

/** "Greater Accra · door delivery" → "Greater Accra". */
function shortZoneName(name: string): string {
  return (name.split("·")[0] ?? name).trim();
}

/** The admin note wins; otherwise the stored extra-day band. */
function zoneTiming(note: string | null, extraDays: number): string {
  if (note) return note;
  if (extraDays <= 0) return "same day after landing";
  return `+${extraDays} day${extraDays === 1 ? "" : "s"}`;
}
