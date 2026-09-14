"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { isStandalone } from "../lib/install-state";

/**
 * Sends the installed app past the marketing landing page and into `/app`.
 *
 * The manifest's `start_url` is already `/app`, so a normal launch never sees
 * the landing page. This covers the ways someone still arrives at `/` from
 * inside the app: tapping the wordmark in the header while signed out, an
 * external link opened in scope, or a launcher that ignores `start_url`.
 * Somebody who has installed Tomame has already been sold on it; showing them
 * the pitch again is the clearest possible sign they are in a browser.
 *
 * Client-side by necessity — display-mode is a property of the window, and the
 * server has no way to know it. On a cold launch this runs while the splash is
 * still covering the screen, so the swap is not visible; on an in-session
 * navigation `replace` keeps `/` out of the history, so Back does not bounce
 * between the two.
 *
 * Renders nothing, and does nothing at all in a browser tab.
 */
export function StandaloneHomeRedirect() {
  const router = useRouter();

  useEffect(() => {
    if (!isStandalone()) return;
    router.replace("/app");
  }, [router]);

  return null;
}
