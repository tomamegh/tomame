"use client";

import { useEffect, useState } from "react";

import { splashGlowCss, splashSkyCss } from "../lib/splash-theme";

/** Matches the CSS below: 1.7s hold, 0.45s fade, plus a frame of slack. */
const TEARDOWN_MS = 2_400;

/**
 * The launch screen: the brand lockup on a sunset sky, edge to edge.
 *
 * **It is shown by CSS, not by JavaScript, and that is the whole trick.** The
 * markup is always in the HTML and always hidden by default; the
 * `@media (display-mode: standalone)` rule in `globals.css` is what reveals it.
 * So it costs a browser visitor nothing, it needs no `useEffect` to decide
 * whether to appear (which would flash the app first, then cover it), and it
 * cannot cause a hydration mismatch, because the server and the client render
 * exactly the same thing every time.
 *
 * On iOS it is the second half of a handover. iOS paints the matching
 * `apple-touch-startup-image` — the same sky, the same lockup, rendered ahead
 * of time by `scripts/generate-pwa-assets.ts` — before a line of our code runs.
 * This overlay then takes over on the identical frame and animates: the sun
 * blooms in, the lockup settles, its reflection rises, and the whole thing
 * dissolves into the app.
 *
 * `pointer-events-none` throughout, so a fast customer can already be tapping
 * the app underneath, and the CSS animation ends at `opacity: 0` under
 * `forwards` — if this component's JavaScript never ran at all, the splash
 * would still get out of the way.
 */
export function PwaSplash() {
  const [torndown, setTorndown] = useState(false);

  useEffect(() => {
    // Belt and braces for the CSS above: once the animation is over the nodes
    // are removed outright, so nothing is left compositing a full-screen layer
    // for the rest of the session.
    const timer = window.setTimeout(() => setTorndown(true), TEARDOWN_MS);
    return () => window.clearTimeout(timer);
  }, []);

  if (torndown) return null;

  return (
    <div className="tm-splash" aria-hidden="true" role="presentation">
      <div className="tm-splash-sky" style={{ backgroundImage: splashSkyCss() }} />
      <div className="tm-splash-glow" style={{ backgroundImage: splashGlowCss() }} />
      <div className="tm-splash-stage">
        <div className="tm-splash-art">
          {/*
            A plain <img>, not next/image, on purpose. This has to be on screen
            in the first paint of a cold launch; next/image would route it
            through /_next/image and hand back a srcset to negotiate first.
            It is one 150 KB transparent WebP that the service worker has
            already precached.
          */}
          <img
            src="/images/brand/logo-lockup.webp"
            alt=""
            width={900}
            height={599}
            fetchPriority="high"
            decoding="sync"
            className="tm-splash-lockup"
          />
          <img
            src="/images/brand/logo-lockup.webp"
            alt=""
            width={900}
            height={599}
            aria-hidden="true"
            className="tm-splash-reflection"
          />
        </div>
      </div>
    </div>
  );
}
