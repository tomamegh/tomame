import {
  AirplaneTilt,
  Check,
  Clock,
  CreditCard,
  HouseLine,
  Prohibit,
  Storefront,
  Warehouse,
} from "@phosphor-icons/react/ssr";

import type { JourneyTone } from "@/features/orders/services/journey-stage";
import type { TrackStopKey } from "@/features/orders/services/journey-track";

/**
 * The shared visual vocabulary of the Journeys screens: one icon per stage, one
 * palette per tone.
 *
 * Kept out of the components so the list badge, the rail and the detail header
 * cannot drift into three different ideas of what "in the air" looks like. The
 * icon set is the mock's own (`ph-airplane-tilt`, `ph-storefront`, `ph-clock`,
 * `ph-check`, `ph-warehouse`, `ph-credit-card`, `ph-house-line`).
 *
 * Phosphor icons are imported from `@phosphor-icons/react/ssr` — the root barrel
 * calls `useContext` and breaks in a server component (phase-2 handoff §5.1).
 */

/**
 * The shape every Phosphor glyph shares. Taken from one of them rather than
 * imported: `@phosphor-icons/react/ssr` re-exports the icons but not the `Icon`
 * type, and the root barrel — which does export it — is the module that breaks
 * in a server component.
 */
export type StageIcon = typeof Clock;

/** `orders.status` → the glyph the badge and the header show. */
export function stageIcon(status: string): StageIcon {
  switch (status) {
    case "pending":
      return Clock;
    case "paid":
      return CreditCard;
    case "processing":
      return Storefront;
    case "in_transit":
      return AirplaneTilt;
    case "delivered":
    case "completed":
      return Check;
    case "cancelled":
      return Prohibit;
    default:
      // A status this map has never seen gets the neutral clock rather than a
      // glyph that would assert a stage it has no basis for.
      return Clock;
  }
}

/** The five stops of the track, in the mock's iconography. */
export function stopIcon(key: TrackStopKey): StageIcon {
  switch (key) {
    case "paid":
      return CreditCard;
    case "purchased":
      return Storefront;
    case "hub":
      return Warehouse;
    case "in_the_air":
      return AirplaneTilt;
    case "your_door":
      return HouseLine;
  }
}

export interface TonePalette {
  /** Badge background. */
  badge: string;
  /** Badge text. */
  text: string;
  /** The progress bar's fill. */
  bar: string;
}

/**
 * The mock's four badge palettes (`t` in its `O(...)` helper). Written as
 * Tailwind classes against the `tm-*` tokens where one exists; the two colours
 * the token set does not carry (`#8A5A0A`, `#C9BDB5`) are spelled out, which is
 * how the rest of the ported screens handle the same gap.
 */
const TONES: Record<JourneyTone, TonePalette> = {
  coral: { badge: "bg-tm-tint", text: "text-tm-coral-strong", bar: "bg-tm-coral" },
  amber: { badge: "bg-tm-amber-bg", text: "text-[#8A5A0A]", bar: "bg-tm-amber" },
  green: { badge: "bg-tm-green-bg", text: "text-tm-green-ink", bar: "bg-tm-green" },
  neutral: { badge: "bg-tm-hairline", text: "text-tm-text-2", bar: "bg-[#C9BDB5]" },
};

export function tonePalette(tone: JourneyTone): TonePalette {
  return TONES[tone];
}
