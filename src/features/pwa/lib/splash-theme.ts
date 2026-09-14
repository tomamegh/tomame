/**
 * The launch-screen artwork, as data.
 *
 * The splash Kelvin asked for is the brand lockup on a sunset sky — the same
 * scene as the supplied artwork, but rebuilt as a gradient plus the
 * transparent `logo-lockup.webp` rather than shipped as one flat photo. Two
 * reasons for that: a gradient fills any screen shape without letterboxing or
 * a crop that eats the tagline, and it stays sharp on a 3x phone at a fraction
 * of the bytes.
 *
 * Both renderers read these stops, which is the whole point of the file:
 *   - `PwaSplash` (the animated, in-app overlay) turns them into a CSS
 *     `linear-gradient`.
 *   - `scripts/generate-pwa-assets.ts` turns them into an SVG gradient for the
 *     iOS `apple-touch-startup-image` PNGs, which iOS paints BEFORE any of our
 *     JavaScript runs.
 *
 * If those two drifted apart the launch would visibly jump from one sky to
 * another, so they share this module instead of each hard-coding hexes.
 */

export interface SplashStop {
  /** 0 = top of the screen, 1 = bottom. */
  readonly offset: number;
  readonly color: string;
}

/**
 * Sky → haze → horizon → the water's reflection of it, top to bottom.
 * Sampled from the supplied artwork.
 */
export const SPLASH_SKY: readonly SplashStop[] = [
  { offset: 0, color: "#7fb3d9" },
  { offset: 0.16, color: "#a8cce3" },
  { offset: 0.34, color: "#d6e4ec" },
  { offset: 0.48, color: "#f6dcbb" },
  { offset: 0.56, color: "#fdf0e0" },
  { offset: 0.62, color: "#fce3c9" },
  { offset: 0.8, color: "#fdeee1" },
  { offset: 1, color: "#fef8f2" },
];

/** The low sun behind the mark, as a radial wash over the sky. */
export const SPLASH_GLOW = {
  color: "#ffd39a",
  /** Fractions of the shorter/longer edge — same numbers in CSS and SVG. */
  centerX: 0.5,
  centerY: 0.44,
  radius: 0.62,
  opacity: 0.85,
} as const;

/**
 * `background_color` in the manifest, and the colour Android paints behind the
 * icon on its own launch screen. Deliberately the splash's horizon tone so the
 * OS screen and ours are the same picture, not two.
 */
export const SPLASH_BACKGROUND_COLOR = "#fdf0e0";

/**
 * `theme_color` — the Android status bar and task-switcher tint. Paper, not
 * coral: it sits directly above `AppNav`, which is `bg-card`, and a coral strip
 * over a white bar reads as a rendering bug rather than as branding.
 */
export const APP_THEME_COLOR = "#fdf9f6";

/** `linear-gradient(...)` for the DOM overlay. */
export function splashSkyCss(): string {
  const stops = SPLASH_SKY.map((s) => `${s.color} ${(s.offset * 100).toFixed(1)}%`).join(", ");
  return `linear-gradient(to bottom, ${stops})`;
}

/** `radial-gradient(...)` for the DOM overlay, painted over the sky. */
export function splashGlowCss(): string {
  const { color, centerX, centerY, radius, opacity } = SPLASH_GLOW;
  return (
    `radial-gradient(circle at ${centerX * 100}% ${centerY * 100}%, ` +
    `color-mix(in srgb, ${color} ${opacity * 100}%, transparent) 0%, ` +
    `color-mix(in srgb, ${color} 0%, transparent) ${radius * 100}%)`
  );
}
