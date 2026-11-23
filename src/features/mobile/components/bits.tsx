import { AirplaneTilt, CreditCard, HouseLine, MapPinLine, Package, Storefront, Warehouse } from "@phosphor-icons/react/ssr";

import type { JourneyTrack, TrackStopKey } from "@/features/orders/services/journey-track";
import { storeLabel } from "../format";

/** The six-stop progress dashes (paid → your door) for a card. */
export function TrackDots({ track }: { track: JourneyTrack }) {
  return (
    <div className="dots" aria-hidden>
      {track.stops.map((s) => (
        <i key={s.key} className={s.state === "done" ? "done" : s.state === "now" ? "now" : ""} />
      ))}
    </div>
  );
}

/** "Amazon · USA" — the store a product comes from. */
export function StoreTag({ store, country }: { store: string | null; country?: string | null }) {
  if (!store) return null;
  return (
    <span className="store">
      <Storefront size={13} weight="fill" />
      {storeLabel(store)}
      {country ? ` · ${country}` : ""}
    </span>
  );
}

/** A product picture, or a neutral box when the store gave none. Remote images are plain <img>: the hosts vary per store. */
export function Thumb({ src, alt = "", className = "thumb" }: { src: string | null; alt?: string; className?: string }) {
  return (
    <span className={className}>
      {src ? (
        <img src={src} alt={alt} loading="lazy" referrerPolicy="no-referrer" />
      ) : (
        <Package size={22} />
      )}
    </span>
  );
}

/** A small sparkline from the watch's own bars (0..1). */
export function Spark({ bars, direction }: { bars: number[]; direction: string }) {
  if (bars.length < 2) return null;
  const w = 84, h = 34;
  const color = direction === "drop" ? "#1e9a5c" : direction === "rise" ? "#c43e22" : "#8a7f79";
  const min = Math.min(...bars), max = Math.max(...bars);
  const pts = bars.map((v, i) => [(i / (bars.length - 1)) * w, 4 + (1 - (v - min) / (max - min || 1)) * (h - 8)] as const);
  const d = pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
  const last = pts[pts.length - 1]!;
  return (
    <svg className="spark" viewBox={`0 0 ${w} ${h}`} aria-hidden>
      <path d={`${d} L${w},${h} L0,${h}Z`} fill={color} opacity=".09" />
      <path d={d} stroke={color} strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={last[0]} cy={last[1]} r="3.2" fill={color} />
    </svg>
  );
}

const STOP_ICONS = { paid: CreditCard, purchased: Storefront, hub: Warehouse, in_the_air: AirplaneTilt, in_accra: MapPinLine, your_door: HouseLine } as const;

/** The glyph for a track stop, or for the stop a track is at now. */
export function StopIcon({ stop, size = 14, weight = "fill" }: { stop: TrackStopKey; size?: number; weight?: "fill" | "bold" }) {
  const Icon = STOP_ICONS[stop];
  return <Icon size={size} weight={weight} />;
}

/** The key of the stop a track is at now (the last one done when nothing is current). */
export function currentStop(track: JourneyTrack): TrackStopKey {
  return (track.stops.find((s) => s.state === "now") ?? [...track.stops].reverse().find((s) => s.state === "done") ?? track.stops[0])?.key ?? "paid";
}
