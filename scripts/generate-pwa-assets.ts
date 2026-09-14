/**
 * Generates every raster the installed app needs, from the brand artwork
 * already in `public/images/brand`. Run it after the logo changes:
 *
 *   npx tsx scripts/generate-pwa-assets.ts
 *
 * Outputs (all committed, none built at request time):
 *   public/icons/pwa/icon-{192,512}.png          — manifest icons, purpose "any"
 *   public/icons/pwa/icon-maskable-{192,512}.png — Android adaptive icons
 *   public/images/splash/launch-<w>x<h>.png      — iOS apple-touch-startup-image
 *
 * The iOS set is the reason this script exists at all. iOS has no equivalent of
 * Android's "icon on background_color" launch screen: without an exactly
 * device-sized startup image it shows a blank white page until React mounts,
 * which is precisely the "it still feels like a browser" tell we are removing.
 * The sizes below are device pixels — CSS size × DPR — and iOS matches them by
 * media query, so a size that is off by one pixel is simply ignored.
 */

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import sharp from "sharp";

import {
  APPLE_LAUNCH_SIZES,
  launchImageUrl,
} from "../src/features/pwa/lib/apple-startup-images";
import { SPLASH_SKY } from "../src/features/pwa/lib/splash-theme";

const ROOT = path.join(__dirname, "..");
const LOCKUP = path.join(ROOT, "public/images/brand/logo-lockup.webp");
const MARK = path.join(ROOT, "src/app/icon.png");
const ICON_DIR = path.join(ROOT, "public/icons/pwa");
const SPLASH_DIR = path.join(ROOT, "public/images/splash");

/** Paper, matching `--tm-paper`. Maskable icons may not have transparency. */
const PAPER = "#fdf9f6";

/**
 * The sky alone — NO radial sun glow, deliberately.
 *
 * The glow is the one non-vertical element in the scene, and adding it to the
 * raster took a 1290x2796 launch image from 138 KB to 629 KB: a pure vertical
 * gradient gives every PNG row an identical filtered delta, and a radial one
 * destroys that. So the sun is animated in by `PwaSplash` instead, blooming
 * from nothing over the first half second. The startup image and the overlay's
 * first frame are therefore the same picture, which is what makes the handover
 * from iOS's launch screen to our DOM invisible.
 */
function skySvg(width: number, height: number): Buffer {
  const stops = SPLASH_SKY.map(
    (s) => `<stop offset="${s.offset}" stop-color="${s.color}"/>`,
  ).join("");
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
       <defs>
         <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">${stops}</linearGradient>
       </defs>
       <rect width="${width}" height="${height}" fill="url(#sky)"/>
     </svg>`,
  );
}

/** A top-to-bottom alpha ramp, used with `dest-in` to fade the reflection out. */
function fadeMaskSvg(width: number, height: number): Buffer {
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
       <defs>
         <linearGradient id="f" x1="0" y1="0" x2="0" y2="1">
           <stop offset="0" stop-color="#fff" stop-opacity="0.22"/>
           <stop offset="1" stop-color="#fff" stop-opacity="0"/>
         </linearGradient>
       </defs>
       <rect width="${width}" height="${height}" fill="url(#f)"/>
     </svg>`,
  );
}

async function launchImage(width: number, height: number): Promise<Buffer> {
  // The lockup takes ~72% of the width on a phone, less on a tablet where 72%
  // would be absurd. Clamped against height too so a short landscape-ish iPad
  // never overflows.
  const isTablet = Math.min(width, height) > 1400;
  const targetWidth = Math.round(width * (isTablet ? 0.5 : 0.72));
  const lockup = await sharp(LOCKUP)
    .resize({ width: targetWidth })
    .toBuffer({ resolveWithObject: true });

  const lw = lockup.info.width;
  const lh = lockup.info.height;

  // Reflection: the same artwork flipped and faded, sitting just under the
  // lockup — the water in the supplied artwork.
  const reflection = await sharp(lockup.data)
    .flip()
    .composite([{ input: fadeMaskSvg(lw, lh), blend: "dest-in" }])
    .png()
    .toBuffer();

  const top = Math.round(height * 0.5 - lh * 0.62);

  return sharp(skySvg(width, height))
    .composite([
      { input: lockup.data, top, left: Math.round((width - lw) / 2) },
      {
        input: reflection,
        top: top + lh + Math.round(lh * 0.02),
        left: Math.round((width - lw) / 2),
      },
    ])
    .png({ compressionLevel: 9, palette: true, colors: 128, dither: 1 })
    .toBuffer();
}

async function icons(): Promise<void> {
  await mkdir(ICON_DIR, { recursive: true });

  for (const size of [192, 512]) {
    await sharp(MARK)
      .resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png({ compressionLevel: 9 })
      .toFile(path.join(ICON_DIR, `icon-${size}.png`));

    // Maskable: opaque ground, artwork inside the 80% safe zone Android's
    // adaptive-icon mask can crop to a circle without clipping the container.
    const inner = Math.round(size * 0.62);
    await sharp({
      create: { width: size, height: size, channels: 4, background: PAPER },
    })
      .composite([
        {
          input: await sharp(MARK).resize(inner, inner, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer(),
          top: Math.round((size - inner) / 2),
          left: Math.round((size - inner) / 2),
        },
      ])
      .png({ compressionLevel: 9 })
      .toFile(path.join(ICON_DIR, `icon-maskable-${size}.png`));
  }
}

async function main(): Promise<void> {
  await icons();
  await mkdir(SPLASH_DIR, { recursive: true });

  let bytes = 0;
  for (const size of APPLE_LAUNCH_SIZES) {
    const width = size.width * size.ratio;
    const height = size.height * size.ratio;
    const png = await launchImage(width, height);
    bytes += png.byteLength;
    await writeFile(path.join(ROOT, "public", launchImageUrl(size)), png);
    console.log(`${launchImageUrl(size)}  ${(png.byteLength / 1024).toFixed(0)} KB  — ${size.devices}`);
  }
  console.log(
    `\n${APPLE_LAUNCH_SIZES.length} launch images, ${(bytes / 1024 / 1024).toFixed(2)} MB total`,
  );
}

void main();
