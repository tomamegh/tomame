/**
 * iOS launch screens.
 *
 * Android composites its own launch screen from the manifest's icon and
 * `background_color`. iOS does not: without an `apple-touch-startup-image`
 * whose media query matches the device EXACTLY, a home-screen launch shows a
 * blank white page until React has mounted. That blank page is the single
 * biggest "this is just a website" tell, so we ship a real image per device.
 *
 * Sizes are CSS points × device pixel ratio, and the file names encode the
 * resulting device pixels. `scripts/generate-pwa-assets.ts` reads this same
 * list to render the PNGs — add a device here, re-run the script, done.
 *
 * Landscape is intentionally absent. Each orientation needs its own image and
 * its own media query, which would double both the file count and the bytes in
 * `public/` for a case (launching an installed shopping app from a sideways
 * home screen) that barely occurs.
 */

export interface AppleLaunchSize {
  /** Viewport width in CSS points. */
  readonly width: number;
  /** Viewport height in CSS points. */
  readonly height: number;
  /** Device pixel ratio. */
  readonly ratio: number;
  /** The devices this entry covers — documentation only. */
  readonly devices: string;
}

export const APPLE_LAUNCH_SIZES: readonly AppleLaunchSize[] = [
  { width: 320, height: 568, ratio: 2, devices: "iPhone SE (1st gen)" },
  { width: 375, height: 667, ratio: 2, devices: "iPhone 8, SE (2nd/3rd gen)" },
  { width: 414, height: 736, ratio: 3, devices: "iPhone 8 Plus" },
  { width: 375, height: 812, ratio: 3, devices: "iPhone X, XS, 11 Pro" },
  { width: 414, height: 896, ratio: 2, devices: "iPhone XR, 11" },
  { width: 414, height: 896, ratio: 3, devices: "iPhone XS Max, 11 Pro Max" },
  { width: 390, height: 844, ratio: 3, devices: "iPhone 12, 13, 14" },
  { width: 393, height: 852, ratio: 3, devices: "iPhone 14 Pro, 15, 16" },
  { width: 402, height: 874, ratio: 3, devices: "iPhone 16 Pro" },
  { width: 428, height: 926, ratio: 3, devices: "iPhone 12/13 Pro Max, 14 Plus" },
  { width: 430, height: 932, ratio: 3, devices: "iPhone 14 Pro Max, 15/16 Plus" },
  { width: 440, height: 956, ratio: 3, devices: "iPhone 16 Pro Max" },
  { width: 768, height: 1024, ratio: 2, devices: "iPad mini, iPad Air (legacy)" },
  { width: 810, height: 1080, ratio: 2, devices: 'iPad 10.2"' },
  { width: 834, height: 1112, ratio: 2, devices: 'iPad Air 10.5"' },
  { width: 834, height: 1194, ratio: 2, devices: 'iPad Pro 11"' },
  { width: 1024, height: 1366, ratio: 2, devices: 'iPad Pro 12.9"' },
];

/** `/images/splash/launch-1290x2796.png` for a 430×932 @3x device. */
export function launchImageUrl({ width, height, ratio }: AppleLaunchSize): string {
  return `/images/splash/launch-${width * ratio}x${height * ratio}.png`;
}

/**
 * The `{ url, media }` pairs Next's `metadata.appleWebApp.startupImage` wants.
 *
 * The media query must name orientation as well as size: without it a single
 * device matches nothing on some iOS versions and everything on others.
 */
export function appleStartupImages(): Array<{ url: string; media: string }> {
  return APPLE_LAUNCH_SIZES.map((size) => ({
    url: launchImageUrl(size),
    media:
      `(device-width: ${size.width}px) and (device-height: ${size.height}px) ` +
      `and (-webkit-device-pixel-ratio: ${size.ratio}) and (orientation: portrait)`,
  }));
}
