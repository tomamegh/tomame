import type { Icon } from "@phosphor-icons/react";
import {
  AirplaneTilt,
  Check,
  HouseLine,
  Storefront,
  Warehouse,
} from "@phosphor-icons/react/ssr";

import {
  JOURNEY_STOPS,
  type JourneyTone,
  type JourneyView,
} from "@/features/orders/services/journey-stage";
import { cn } from "@/lib/utils";

/**
 * One glyph per stop, keyed by `JourneyStop.key`. The marker shows the glyph of
 * the stop the order is currently at; an unknown or off-track stage falls back
 * to a tick rather than rendering nothing.
 */
const STOP_ICONS: Record<string, Icon> = {
  paid: Check,
  purchased: Storefront,
  hub: Warehouse,
  in_the_air: AirplaneTilt,
  your_door: HouseLine,
};

/**
 * Tone → colour. Mapped to full class strings, not interpolated, so Tailwind's
 * scanner can see every one of them.
 */
const TONE_TEXT: Record<JourneyTone, string> = {
  coral: "text-tm-coral",
  amber: "text-tm-amber",
  green: "text-tm-green",
  neutral: "text-tm-text-3",
};

const TONE_BORDER: Record<JourneyTone, string> = {
  coral: "border-tm-coral",
  amber: "border-tm-amber",
  green: "border-tm-green",
  // No token exists for the design's inactive stop ring.
  neutral: "border-[#E8DDD6]",
};

/** Fill colour for the compact mobile bar. */
const TONE_BG: Record<JourneyTone, string> = {
  coral: "bg-tm-coral",
  amber: "bg-tm-amber",
  green: "bg-tm-green",
  neutral: "bg-[#C9BDB5]",
};

export interface JourneyTrackProps {
  stage: JourneyView;
  /** Announced instead of the decorative dots, e.g. the product name. */
  label: string;
  className?: string;
}

/**
 * The five-stop mini-track.
 *
 * The stops come from `JOURNEY_STOPS`, never from a literal list here, and the
 * position comes from `stage.trackPercent`. That number is a STAGE POSITION —
 * which stop is lit — and not progress through time; nothing in this component
 * interpolates it towards a date.
 */
export function JourneyTrack({ stage, label, className }: JourneyTrackProps) {
  const position = clampPercent(stage.trackPercent);
  const MarkerIcon =
    (stage.stopKey ? STOP_ICONS[stage.stopKey] : undefined) ?? Check;
  const lastIndex = JOURNEY_STOPS.length - 1;
  const trackLabel = `${label}: ${stage.label} — ${describeStop(stage)}`;

  return (
    <div className={cn("flex flex-col gap-2.5", className)}>
      {/*
        Compact bar below `sm`, per the mock's own 390px artboard, which drops
        the five-stop track for a single thick bar.

        That is not just a style preference — measured at 390px the track is
        200px wide while its five labels total 192px, so with `justify-between`
        they sit edge to edge with no gap and run together. The stage word is
        already shown beside the title and the ETA sits in the row's own column,
        so nothing is lost by hiding the stops here.
      */}
      <div
        className="h-2 overflow-hidden rounded-full bg-tm-hairline sm:hidden"
        role="img"
        aria-label={trackLabel}
      >
        <div
          className={cn(
            "tm-fill h-full rounded-full [animation-delay:0.3s] [animation-duration:1.2s]",
            TONE_BG[stage.tone],
          )}
          style={{ width: `${position}%` }}
        />
      </div>

      <div
        className="relative hidden h-[22px] sm:block"
        role="img"
        aria-label={trackLabel}
      >
        {/* Base line */}
        <div className="absolute top-2.5 right-0 left-0 h-0.5 bg-[#EFE4DC]" />

        {/* Travelled line. `tm-fill` is 0.9s by default; the mock says 1.2s. */}
        <div
          className="tm-fill absolute top-2.5 left-0 h-0.5 bg-tm-green [animation-delay:0.3s] [animation-duration:1.2s]"
          style={{ width: `${position}%` }}
        />

        {/* Inactive stop dots, drawn from the stop list. */}
        <div
          className="pointer-events-none absolute inset-0 flex justify-between"
          aria-hidden
        >
          {JOURNEY_STOPS.map((stop, index) => {
            if (index === 0) {
              // The animated marker starts here, so the first slot is only a
              // spacer that keeps the remaining dots evenly distributed.
              return <span key={stop.key} className="w-[22px]" />;
            }
            if (index === lastIndex) {
              return (
                <span
                  key={stop.key}
                  className="flex size-[22px] items-center justify-center rounded-full border-2 border-[#E8DDD6] bg-card text-[#C9BDB5]"
                >
                  <HouseLine className="size-[11px]" />
                </span>
              );
            }
            return (
              <span
                key={stop.key}
                className="mt-2 size-1.5 rounded-full bg-[#E8DDD6]"
              />
            );
          })}
        </div>

        {/*
          MOCK BUG, fixed here. The mock puts `transform: translateX(-50%)` on
          the marker AND animates it with `tmPop`, whose keyframes set
          `transform: scale(...)`. The scale replaces the whole transform, so the
          centring offset vanishes for the length of the animation and the dot
          visibly jumps left into place. Splitting it in two — an outer element
          that owns the offset, an inner one that owns the animation — keeps both.
        */}
        <div
          className="absolute top-0 -translate-x-1/2"
          style={{ left: `${position}%` }}
          aria-hidden
        >
          <span
            className={cn(
              "tm-pop flex size-[22px] items-center justify-center rounded-full border-2 bg-card [animation-delay:1.3s]",
              TONE_BORDER[stage.tone],
              TONE_TEXT[stage.tone],
            )}
          >
            <MarkerIcon weight="fill" className="size-[11px]" />
          </span>
        </div>
      </div>

      <ol
        className="hidden justify-between text-[11px] leading-none font-medium text-tm-text-3 sm:flex"
        aria-hidden
      >
        {JOURNEY_STOPS.map((stop) => (
          <li key={stop.key}>{stop.label}</li>
        ))}
      </ol>
    </div>
  );
}

/** The tone colour as a text class, for the stage label beside the title. */
export function journeyToneText(tone: JourneyTone): string {
  return TONE_TEXT[tone];
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

/** "not on the track yet" reads better to a screen reader than "stop null of 5". */
function describeStop(stage: JourneyView): string {
  const index = stage.stopKey
    ? JOURNEY_STOPS.findIndex((stop) => stop.key === stage.stopKey)
    : -1;
  return index === -1
    ? "not on the track yet"
    : `stop ${index + 1} of ${JOURNEY_STOPS.length}`;
}
