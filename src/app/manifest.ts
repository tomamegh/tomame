import type { MetadataRoute } from "next";

import {
  APP_THEME_COLOR,
  SPLASH_BACKGROUND_COLOR,
} from "@/features/pwa/lib/splash-theme";

/**
 * The web app manifest, served at `/manifest.webmanifest`.
 *
 * This is the file that turns "Add to Home Screen" from a Safari bookmark into
 * an installed app: without it iOS opens the site in a browser tab with the
 * address bar showing, and Chrome never offers to install at all.
 *
 * `start_url` is `/app`, not `/`. Someone who put Tomame on their home screen
 * wants the shopping surface, not the marketing landing page they were sold on
 * once. Signed-out visitors are not stranded — `src/proxy.ts` bounces `/app` to
 * `/auth/login?next=/app`, so the first launch after install is a login and
 * every launch after that lands on Home.
 *
 * `id` is pinned so a future change to `start_url` updates the installed app
 * in place rather than appearing as a second, duplicate icon.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/app",
    name: "Tomame — Shop the world, delivered to Ghana",
    short_name: "Tomame",
    description:
      "Buy from Amazon, eBay, Walmart and more with Mobile Money. One landed price in cedis, delivered to your door in Ghana.",
    start_url: "/app",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: SPLASH_BACKGROUND_COLOR,
    theme_color: APP_THEME_COLOR,
    lang: "en-GH",
    dir: "ltr",
    categories: ["shopping", "business"],
    icons: [
      // "any" carries transparency so the mark keeps its shape wherever the OS
      // draws it on its own ground; "maskable" is opaque and inset, because
      // Android crops adaptive icons to whatever shape the launcher uses and a
      // transparent icon there comes out as artwork floating in a white blob.
      { src: "/icons/pwa/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/pwa/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/pwa/icon-maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icons/pwa/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    // Long-press the home screen icon. Every destination is a real route.
    shortcuts: [
      {
        name: "Paste a link",
        short_name: "New order",
        description: "Paste a product link and get the landed price in cedis",
        url: "/app/orders/new",
        icons: [{ src: "/icons/pwa/icon-192.png", sizes: "192x192" }],
      },
      {
        name: "My bag",
        short_name: "Bag",
        description: "Review what is in your bag and check out",
        url: "/app/bag",
        icons: [{ src: "/icons/pwa/icon-192.png", sizes: "192x192" }],
      },
      {
        name: "Track orders",
        short_name: "Orders",
        description: "See where every order has got to",
        url: "/app/orders",
        icons: [{ src: "/icons/pwa/icon-192.png", sizes: "192x192" }],
      },
    ],
  };
}
