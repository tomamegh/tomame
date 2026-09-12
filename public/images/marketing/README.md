# Marketing photography

Eleven photos, one per slot in the redesign canvas. Filenames are the design's own
slot ids, and `regions.photo_key` in the database stores the same strings, so a
region row points straight at a file here.

| File | Where it appears |
|---|---|
| `mk-hero-photo.webp` | Landing hero — woman opening a parcel on an Accra balcony |
| `mk-buyer-photo.webp` | Landing, "Ask a buyer" — buyer at his desk on a headset |
| `mk-cta-photo.webp` | Landing, closing CTA — parcel handover on a market street |
| `mk-regions-photo.webp` | Where we buy, hero — freight aircraft loading at sunset |
| `mk-region-us.webp` | USA region card — courier on a New York brownstone |
| `mk-region-uk.webp` | UK region card — London high street |
| `mk-region-cn.webp` | China region card — Guangzhou textile market |
| `mk-delivery-photo.webp` | Where we buy — rider handing a parcel over at a gate |
| `mk-about-1.webp` | About — the team around a table |
| `mk-about-2.webp` | About — warehouse scanning (the one landscape shot) |
| `mk-about-3.webp` | About — rider on a motorbike in Accra traffic |

## Replacing a photo

1. Drop your new file in this folder **using the existing filename**. Nothing else
   needs to change — the manifest, the database `photo_key`s and every component
   keep working.
2. If the new shot has different pixel dimensions, update `width` and `height` for
   that key in `src/config/marketing-images.ts`. `next/image` needs the real numbers
   to reserve layout space; wrong values cause the page to jump as images load.
3. Update `alt` in the same file if the new photo shows something different. The alt
   text is read aloud by screen readers, so it should describe the actual shot.

## Format

WebP, quality 90, at native resolution — 1086×1448 portrait, except `mk-about-2`
which is 1448×1086 landscape. Roughly 150–270 KB each.

**Do not pre-shrink these.** `next/image` generates the responsive sizes at build
and request time; a small source just means a blurry image on a retina screen.
If you have a larger original, use it.

The high-resolution PNG originals (~2 MB each) are not committed — they live
outside the repo. These WebPs are generated from them.
