import { MARKETING_IMAGES, type MarketingImageKey } from "./marketing-images";

/**
 * Which marketing page each photo slot is rendered on.
 *
 * WHY THIS EXISTS. `marketing-images.ts` is a flat manifest: it knows what each
 * shot is for, but not which URL a visitor has to open to see it. The builder
 * and the admin Content screen both need that, and before this file the only
 * record of it was a prose comment in the builder's slot-frames module, which
 * nothing could read at runtime and nothing kept honest.
 *
 * `SLOT_PAGES` is checked against the manifest by the compiler, so a new slot
 * added to `MARKETING_IMAGES` fails the typecheck until it is filed under a
 * page here. That is deliberate: the alternative is a slot that silently
 * disappears from the builder's page list.
 *
 * TWO OF THESE ARE CONVENTION, NOT LAW. The three lane cards resolve through
 * `regions.photo_key`, and the buyer photo through a `photo_key` on a
 * `site_content` block, so an admin could point either at a different slot. The
 * grouping below is where the shipped seed puts them, which is what an admin
 * looking for a photo needs to be told.
 */

export interface MarketingPage {
  /** Human label for the page, as an admin would name it. */
  readonly label: string;
  /** The route a visitor opens to see these photos. */
  readonly route: string;
}

export const MARKETING_PAGES = {
  landing: { label: "Landing", route: "/" },
  "where-we-buy": { label: "Where we buy", route: "/where-we-buy" },
  about: { label: "About", route: "/about" },
} as const satisfies Record<string, MarketingPage>;

export type MarketingPageSlug = keyof typeof MARKETING_PAGES;

const SLOT_PAGES = {
  "mk-hero-photo": "landing",
  "mk-buyer-photo": "landing",
  "mk-regions-photo": "landing",
  "mk-cta-photo": "landing",
  "mk-region-us": "where-we-buy",
  "mk-region-uk": "where-we-buy",
  "mk-region-cn": "where-we-buy",
  "mk-delivery-photo": "where-we-buy",
  "mk-about-1": "about",
  "mk-about-2": "about",
  "mk-about-3": "about",
} as const satisfies Record<MarketingImageKey, MarketingPageSlug>;

/** Manifest order, so every screen lists slots in the same sequence. */
const ALL_KEYS = Object.keys(MARKETING_IMAGES) as MarketingImageKey[];

/** The page a slot is rendered on. */
export function marketingPageOfKey(key: MarketingImageKey): MarketingPageSlug {
  return SLOT_PAGES[key];
}

/** The slots rendered on one page, in manifest order. */
export function marketingKeysForPage(
  slug: MarketingPageSlug,
): readonly MarketingImageKey[] {
  return ALL_KEYS.filter((key) => SLOT_PAGES[key] === slug);
}

export interface MarketingPageSlots extends MarketingPage {
  readonly slug: MarketingPageSlug;
  readonly keys: readonly MarketingImageKey[];
}

/** Every page the builder can edit, with its slots. Declaration order. */
export function marketingPagesWithSlots(): readonly MarketingPageSlots[] {
  return (Object.keys(MARKETING_PAGES) as MarketingPageSlug[]).map((slug) => ({
    slug,
    ...MARKETING_PAGES[slug],
    keys: marketingKeysForPage(slug),
  }));
}

/**
 * A `?page=` value from a URL, or null for anything else — including an array,
 * which is what Next hands over when the parameter is repeated.
 */
export function parseMarketingPage(
  value: string | string[] | undefined,
): MarketingPageSlug | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw) return null;
  return raw in MARKETING_PAGES ? (raw as MarketingPageSlug) : null;
}
