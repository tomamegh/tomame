import { logger } from "@/lib/logger";

/**
 * Marketing photography manifest.
 *
 * The keys are the design's own slot ids (`mk-*`) from the redesign canvas, and
 * `regions.photo_key` in the database stores exactly these strings — so a region
 * row resolves to a file through this map with no translation step.
 *
 * Filenames deliberately match the keys. To swap a photo, drop a new file over
 * the existing path keeping the same name, and update `width`/`height`/`alt`
 * here if the new shot differs. See public/images/marketing/README.md.
 *
 * Sources are 1086×1448 (one landscape at 1448×1086) WebP at quality 90.
 * next/image downscales per breakpoint, so ship the large version — do not
 * pre-shrink these.
 */

/**
 * Fields are readonly on purpose. These objects are module-level singletons and
 * Next.js keeps modules alive across requests, so mutating one (e.g. tweaking
 * `alt` per region) would corrupt it for every later request in the process.
 * Spread into a new object if you need a variant.
 */
export interface MarketingImage {
  /** Public path, usable directly as a next/image `src`. */
  readonly src: string;
  readonly width: number;
  readonly height: number;
  /** Screen-reader description. Says what is in the shot, not "image of…". */
  readonly alt: string;
  /** What the shot is for, so a replacement can match the brief. */
  readonly shot: string;
  /**
   * CSS `object-position` for the crop, e.g. "center", "50% 30%", "top".
   * These are tall portrait photos shown in shorter boxes, so the default
   * centre crop can cut off a face or the subject of the shot. Nudge this
   * per image — no component change needed. Higher percentages move the
   * visible window DOWN the photo; "50% 25%" favours the top quarter.
   */
  readonly position?: string;
}

export const MARKETING_IMAGES = {
  "mk-hero-photo": {
    src: "/images/marketing/mk-hero-photo.webp",
    width: 1086,
    height: 1448,
    alt: "A woman smiling as she opens a cardboard parcel on a plant-filled balcony overlooking Accra",
    shot: "Landing hero — the moment a delivery arrives. Warm, domestic, Ghanaian city backdrop.",
  },
  "mk-buyer-photo": {
    src: "/images/marketing/mk-buyer-photo.webp",
    width: 1086,
    height: 1448,
    alt: "A Tomame buyer in an orange polo shirt at his desk, on a headset call with a laptop open",
    shot: "Landing — 'Ask a buyer'. A real person answering, not a chatbot.",
  },
  "mk-regions-photo": {
    src: "/images/marketing/mk-regions-photo.webp",
    width: 1086,
    height: 1448,
    alt: "Cargo being loaded into a freight aircraft on an airport apron at sunset",
    shot: "Where we buy hero — consolidated air freight leaving the US hub.",
  },
  "mk-region-us": {
    src: "/images/marketing/mk-region-us.webp",
    width: 1086,
    height: 1448,
    alt: "A courier carrying stacked parcels up the steps of a New York brownstone in autumn",
    shot: "USA region card. The live lane — should read as the most established.",
  },
  "mk-region-uk": {
    src: "/images/marketing/mk-region-uk.webp",
    width: 1086,
    height: 1448,
    alt: "A man walking a rain-slicked London high street as a red double-decker bus passes",
    shot: "UK region card. Rendered dimmed — lane is 'coming soon'.",
  },
  "mk-region-cn": {
    src: "/images/marketing/mk-region-cn.webp",
    width: 1086,
    height: 1448,
    alt: "A shopper walking an aisle of a Guangzhou textile market stacked with bolts of fabric",
    shot: "China region card. Rendered dimmed — lane is 'coming soon'.",
  },
  "mk-delivery-photo": {
    src: "/images/marketing/mk-delivery-photo.webp",
    width: 1086,
    height: 1448,
    alt: "A delivery rider in an orange jacket handing a parcel to a woman at her gate",
    shot: "Where we buy — delivery in Ghana. The last mile, at the door.",
  },
  "mk-cta-photo": {
    src: "/images/marketing/mk-cta-photo.webp",
    width: 1086,
    height: 1448,
    alt: "A parcel passing from a courier's hands to a customer's on a busy market street",
    shot: "Landing closing CTA — the handover.",
  },
  "mk-about-1": {
    src: "/images/marketing/mk-about-1.webp",
    width: 1086,
    height: 1448,
    alt: "Five colleagues talking around a table of laptops in a bright office",
    shot: "About — the team. 'Three friends in Accra' grown into a small team.",
  },
  "mk-about-2": {
    src: "/images/marketing/mk-about-2.webp",
    width: 1448,
    height: 1086,
    alt: "A warehouse worker scanning the barcode on a parcel with a phone, shelves of boxes behind",
    shot: "About — operations. The only landscape image in the set.",
  },
  "mk-about-3": {
    src: "/images/marketing/mk-about-3.webp",
    width: 1086,
    height: 1448,
    alt: "A Tomame rider on a motorbike carrying a delivery box through Accra traffic",
    shot: "About — delivery in Accra, Independence Arch visible behind.",
  },
} as const satisfies Record<string, MarketingImage>;

export type MarketingImageKey = keyof typeof MARKETING_IMAGES;

/** `object-position` for an image, defaulting to a centre crop. */
export function imagePosition(image: MarketingImage): string {
  return image.position ?? "center";
}

/**
 * Resolve a `regions.photo_key` (or any slot id) to its image.
 * Returns null for an unknown key so a bad DB value renders no photo rather
 * than throwing the whole page.
 */
export function getMarketingImage(
  key: string | null | undefined,
): Readonly<MarketingImage> | null {
  if (!key) return null;
  return (
    (MARKETING_IMAGES as Record<string, MarketingImage>)[key] ?? null
  );
}

/** Product photography, used in quote/receipt mocks until live extraction supplies real images. */
export const PRODUCT_IMAGES = {
  "oraimo-boompop-n": {
    src: "/images/products/oraimo-boompop-n.webp",
    width: 600,
    height: 600,
    alt: "Oraimo BoomPop N over-ear wireless headphones in black",
    shot: "Sample product for the landing receipt, Fees worked example and quote screens.",
  },
} as const satisfies Record<string, MarketingImage>;

export type ProductImageKey = keyof typeof PRODUCT_IMAGES;

/**
 * Resolve a worked-example `product_image_key` to its image.
 * Returns null for an unknown or absent key so the caller falls back to the
 * striped placeholder rather than rendering a broken image.
 */
export function getProductImage(
  key: string | null | undefined,
): Readonly<MarketingImage> | null {
  if (!key) return null;
  return (PRODUCT_IMAGES as Record<string, MarketingImage>)[key] ?? null;
}

/**
 * A sparse `media_overrides` row: only the fields an admin actually set.
 * A NULL (or absent) field means "keep the manifest value".
 */
export interface MarketingImageOverride {
  src?: string | null;
  alt?: string | null;
  position?: string | null;
  width?: number | null;
  height?: number | null;
  /**
   * The slot this override belongs to. Present on every database row, and
   * preferred over the optional `key` argument so a caller that forgets to
   * pass it still resolves uploads correctly.
   */
  key?: string;
  /**
   * Object key in the private `marketing-media` bucket when an admin has
   * uploaded a replacement through /builder. Served same-origin by
   * /api/media/[key], so a row can never point a visitor at a third party.
   * The database guarantees width/height are set alongside it.
   */
  storage_path?: string | null;
}

/** Warned-about override keys, so a bad row logs once per process, not per render. */
const warnedSrcOverrides = new Set<string>();

/**
 * Apply an admin's database override on top of a manifest default.
 *
 * The manifest is the built-in default and can only change with a deploy;
 * `media_overrides` lets an admin re-crop or re-point an image on a running
 * environment. Only the fields actually set in the row win — a NULL column
 * keeps the manifest value, and deleting the row restores the default
 * completely.
 *
 * Geometry is all-or-nothing. The DB CHECK pairs `width` with `height`, but
 * nothing pairs either with `src`, so a row may point at a differently-shaped
 * file while leaving the dimensions NULL. Honouring that src would hand
 * next/image the manifest's aspect ratio for a photo that no longer has it —
 * e.g. a 1448×1086 landscape rendered in a 1086×1448 portrait box, visibly
 * stretched. So a `src` override counts only when it arrives with BOTH
 * dimensions; otherwise the manifest image is kept and the row is logged.
 * `alt` and `position` are independent of geometry and still apply.
 */
export function applyImageOverride(
  image: MarketingImage,
  override: MarketingImageOverride | undefined,
  /** Manifest key, for the warning below. Falls back to the manifest src. */
  key?: string,
): MarketingImage {
  if (!override) return image;

  const { width, height, src } = override;
  const paired = width != null && height != null ? { width, height } : null;

  if (src && !paired) {
    const id = key ?? image.src;
    if (!warnedSrcOverrides.has(id)) {
      warnedSrcOverrides.add(id);
      logger.warn("Image override ignored: src set without paired width/height", {
        key: id,
        src,
      });
    }
  }

  // An uploaded replacement wins over both the manifest and any `src` override.
  // It carries its own dimensions (enforced by media_overrides_upload_has_dimensions)
  // so it can never leave next/image with a mismatched aspect ratio. The storage
  // object name doubles as a cache buster: a re-upload gets a new name, so a
  // cached URL never serves the previous photo.
  // Prefer the key carried on the row. Four call sites invoke this with only
  // two arguments, and depending on the optional parameter silently disabled
  // uploads on the hero, CTA, regions strip and all three About photos.
  const slotKey = key ?? override.key;
  const uploaded =
    override.storage_path && paired && slotKey
      ? {
          src: `/api/media/${encodeURIComponent(slotKey)}?v=${encodeURIComponent(
            override.storage_path.split("/").pop() ?? "1",
          )}`,
        }
      : {};

  return {
    ...image,
    ...(src && paired ? { src } : {}),
    ...uploaded,
    ...(override.alt ? { alt: override.alt } : {}),
    ...(override.position ? { position: override.position } : {}),
    ...(paired ?? {}),
  };
}

/** Manifest default with any override applied, or null for an unknown key. */
export function resolveMarketingImage(
  key: string | null | undefined,
  overrides: Record<string, MarketingImageOverride> = {},
): MarketingImage | null {
  const base = getMarketingImage(key);
  if (!base) return null;
  return applyImageOverride(
    base,
    key ? overrides[key] : undefined,
    key ?? undefined,
  );
}
