import type { MarketingImageKey } from "@/config/marketing-images";

/**
 * The boxes the marketing pages actually render each photo in.
 *
 * The whole point of the crop control is that what you nudge here is what
 * ships, so the preview has to match the real box. These numbers are read off
 * the render sites — not invented — and a slot that is shaped differently on
 * mobile than on desktop lists both rather than averaging them into a lie.
 *
 *   mk-hero-photo      landing-hero.tsx        aspect-[3/4] / lg:300x400
 *   mk-buyer-photo     value-section.tsx       h-52 @100vw / lg:h-[220px] @620
 *   mk-regions-photo   regions-strip.tsx       h-[360px] @100vw / lg:h-[460px] @620
 *   mk-region-*        region-card.tsx         h-50 @100vw / h-50 @400
 *   mk-delivery-photo  where-we-buy/page.tsx   h-80 @100vw / lg:h-[480px] @600
 *   mk-cta-photo       closing-cta.tsx         h-56 @100vw / md:h-[280px] @460
 *   mk-about-1/2       about/page.tsx          h-56 @100vw / lg:h-95 @420
 *   mk-about-3         about/page.tsx          h-56 @100vw / lg:h-[182px] @300
 *
 * A phone column is taken as 375px wide, the narrowest device worth designing
 * for; anything wider only makes the box shorter relative to its width, which
 * crops less, so tuning against 375 is the safe end.
 */
export interface SlotFrame {
  /** Where this box appears, shown on the switcher pill. */
  readonly label: string;
  readonly width: number;
  readonly height: number;
}

const PHONE = 375;

/** Landing / About / where-we-buy boxes at a 375px phone column. */
const mobile = (label: string, height: number): SlotFrame => ({
  label,
  width: PHONE,
  height,
});

const FRAMES = {
  "mk-hero-photo": [
    { label: "Hero card · desktop", width: 300, height: 400 },
    mobile("Hero card · phone", 500),
  ],
  "mk-buyer-photo": [
    { label: "Buyer card · desktop", width: 620, height: 220 },
    mobile("Buyer card · phone", 208),
  ],
  "mk-regions-photo": [
    { label: "Regions panel · desktop", width: 620, height: 460 },
    mobile("Regions panel · phone", 360),
  ],
  "mk-region-us": [
    { label: "Region card · desktop", width: 400, height: 200 },
    mobile("Region card · phone", 200),
  ],
  "mk-region-uk": [
    { label: "Region card · desktop", width: 400, height: 200 },
    mobile("Region card · phone", 200),
  ],
  "mk-region-cn": [
    { label: "Region card · desktop", width: 400, height: 200 },
    mobile("Region card · phone", 200),
  ],
  "mk-delivery-photo": [
    { label: "Delivery panel · desktop", width: 600, height: 480 },
    mobile("Delivery panel · phone", 320),
  ],
  "mk-cta-photo": [
    { label: "Closing CTA · desktop", width: 460, height: 280 },
    mobile("Closing CTA · phone", 224),
  ],
  "mk-about-1": [
    { label: "About tile · desktop", width: 420, height: 380 },
    mobile("About tile · phone", 224),
  ],
  "mk-about-2": [
    { label: "About tile · desktop", width: 420, height: 380 },
    mobile("About tile · phone", 224),
  ],
  "mk-about-3": [
    { label: "About sidebar tile · desktop", width: 300, height: 182 },
    mobile("About sidebar tile · phone", 224),
  ],
} as const satisfies Record<MarketingImageKey, readonly SlotFrame[]>;

/** Every box a slot is rendered in, widest-fit first. */
export function framesForKey(key: MarketingImageKey): readonly SlotFrame[] {
  return FRAMES[key];
}
