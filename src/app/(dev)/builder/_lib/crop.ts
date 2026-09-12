/**
 * Crop maths shared by the slider and the drag handler.
 *
 * `object-position` on an `object-cover` image is not a pixel offset: the
 * percentage positions the *overflow*. At 0% the top edge of the photo lines up
 * with the top of the box; at 100% the bottom edges line up. So a drag of N
 * pixels is worth N/overflow of the whole range, and an axis with no overflow
 * (the photo already fits that way) cannot move at all.
 */

/** A crop as the two percentages the API stores. */
export interface CropPoint {
  x: number;
  y: number;
}

const KEYWORDS: Record<string, CropPoint> = {
  center: { x: 50, y: 50 },
  top: { x: 50, y: 0 },
  bottom: { x: 50, y: 100 },
  left: { x: 0, y: 50 },
  right: { x: 100, y: 50 },
};

/**
 * Read a stored `object-position` into percentages.
 *
 * The API accepts five keywords as well as `"<x>% <y>%"`, and the manifest uses
 * them, so the editor has to be able to start from one. Anything unrecognised
 * falls back to a centre crop rather than throwing — a malformed row should
 * leave the tool usable, since the tool is how you fix it.
 */
export function parseCrop(position: string | null | undefined): CropPoint {
  if (!position) return { ...KEYWORDS.center! };

  const value = position.trim().toLowerCase();
  const keyword = KEYWORDS[value];
  if (keyword) return { ...keyword };

  const match = /^(\d{1,3}(?:\.\d+)?)%\s+(\d{1,3}(?:\.\d+)?)%$/.exec(value);
  if (!match) return { ...KEYWORDS.center! };

  return {
    x: clampPercent(Number(match[1])),
    y: clampPercent(Number(match[2])),
  };
}

/** The string the API stores. Always percentages, so it round-trips exactly. */
export function formatCrop(crop: CropPoint): string {
  return `${round(crop.x)}% ${round(crop.y)}%`;
}

export function cropsEqual(a: CropPoint, b: CropPoint): boolean {
  return round(a.x) === round(b.x) && round(a.y) === round(b.y);
}

export function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 50;
  return Math.min(100, Math.max(0, value));
}

/** One decimal place — finer than that is invisible and noisy in the DB. */
function round(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * How many pixels of the photo hang outside the box on each axis, once
 * `object-cover` has scaled it to fill.
 *
 * Zero on an axis means that axis is pinned and its percentage is inert — the
 * UI disables the control rather than letting you drag something that cannot
 * move.
 */
export function coverOverflow(
  box: { width: number; height: number },
  image: { width: number; height: number },
): CropPoint {
  if (!box.width || !box.height || !image.width || !image.height) {
    return { x: 0, y: 0 };
  }
  const scale = Math.max(box.width / image.width, box.height / image.height);
  return {
    x: Math.max(0, image.width * scale - box.width),
    y: Math.max(0, image.height * scale - box.height),
  };
}

/**
 * Apply a pointer drag to a crop.
 *
 * Dragging the photo down reveals more of its top, which is a *lower*
 * percentage — hence the subtraction. Getting this backwards is the single
 * most disorienting thing a crop tool can do, so it is stated once, here.
 */
export function dragCrop(
  origin: CropPoint,
  delta: { dx: number; dy: number },
  overflow: CropPoint,
): CropPoint {
  return {
    x:
      overflow.x > 0
        ? clampPercent(origin.x - (delta.dx / overflow.x) * 100)
        : origin.x,
    y:
      overflow.y > 0
        ? clampPercent(origin.y - (delta.dy / overflow.y) * 100)
        : origin.y,
  };
}
