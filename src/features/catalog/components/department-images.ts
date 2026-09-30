import {
  applyImageOverride,
  type MarketingImage,
  type MarketingImageOverride,
} from "@/config/marketing-images";

/**
 * One photo per department, resolved from the label.
 *
 * WHY A SLUG SET AND NOT KEYWORDS. `department-icons.ts` matches on keywords
 * because a glyph is generic enough to be right for any shelf that mentions
 * "phone". A photo is not: a handset on a desk is wrong for "Headphones" and a
 * living room is wrong for "Tools & Home Improvement". So a photo is only shown
 * for a label we have actually shot, matched exactly (after slugging), and any
 * other shelf — a new category, a rename, the synthetic "All categories" pill —
 * falls back to the icon tile. A missing photo degrades to the old look rather
 * than to the wrong picture.
 *
 * The files live in `public/images/departments/<slug>.webp` (480×480 WebP) and
 * their sources, photographers and licence are in the CREDITS.md beside them.
 *
 * OVERRIDABLE THE SAME WAY AS MARKETING PHOTOS. A `media_overrides` row keyed
 * `dept-<slug>` re-points (`src` + `width`/`height`) or re-crops (`position`)
 * one department on a running environment, through the same
 * `applyImageOverride` the marketing pages use, and with the same DB guarantee
 * that `src` can only name a file under `/images/`.
 */

/** The labels `catalog_categories()` currently returns, as slugs. */
const DEPARTMENT_PHOTO_SLUGS = new Set<string>([
  "appliances",
  "automotive",
  "baby",
  "beauty-personal-care",
  "books",
  "camera-photo",
  "car-electronics-accessories",
  "cell-phones-accessories",
  "computers",
  "electronics",
  "exercise-fitness",
  "fashion-accessories",
  "fragrance",
  "hair-care",
  "handbags-wallets",
  "headphones",
  "home-kitchen",
  "kitchen-dining",
  "luggage-travel-gear",
  "mens-clothing",
  "mens-shoes",
  "musical-instruments",
  "office-electronics",
  "office-products",
  "pet-supplies",
  "skin-care",
  "smart-home",
  "tools-home-improvement",
  "toys-games",
  "tv-video",
  "video-games",
  "vitamins-dietary-supplements",
  "watches",
  "wearable-technology",
  "womens-clothing",
  "womens-shoes",
]);

const PHOTO_SIZE = 480;

/**
 * `Men's Shoes` → `mens-shoes`, `Cell Phones & Accessories` →
 * `cell-phones-accessories`. Apostrophes are dropped rather than hyphenated so
 * the possessive does not split a word.
 */
export function departmentSlug(label: string): string {
  return label
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** The `media_overrides` key for a department's photo. */
export function departmentImageKey(label: string): string {
  return `dept-${departmentSlug(label)}`;
}

/**
 * The photo for a department with any admin override applied, or null when
 * we hold none for it (the caller then draws the icon tile).
 *
 * `alt` is empty on purpose: the tile's visible name is the link's accessible
 * name, and a described photo would make a screen reader say every department
 * twice.
 */
export function departmentImage(
  label: string,
  overrides: Readonly<Record<string, MarketingImageOverride>> = {},
): MarketingImage | null {
  const slug = departmentSlug(label);
  if (!DEPARTMENT_PHOTO_SLUGS.has(slug)) return null;

  const key = `dept-${slug}`;
  const base: MarketingImage = {
    src: `/images/departments/${slug}.webp`,
    width: PHOTO_SIZE,
    height: PHOTO_SIZE,
    alt: "",
    shot: `Shop by category tile for "${label}". Square, product-led, no logos.`,
  };
  const override = overrides[key];
  // Uploads are served by /api/media/[key], which only knows the marketing
  // manifest's keys, so an uploaded replacement here would render as a broken
  // image. Only the file-path, crop and geometry fields apply to departments.
  const resolved = applyImageOverride(
    base,
    override ? { ...override, storage_path: null } : undefined,
    key,
  );
  // An override may carry a descriptive alt meant for a standalone photo; the
  // tile stays decorative regardless (see above).
  return { ...resolved, alt: "" };
}
