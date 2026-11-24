"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";

import { mobilePathFor } from "@/lib/native/mobile-routes";
import { isStandalone } from "../lib/install-state";

/** Where an installed Tomame (home-screen app) should be for a website path, or null to stay. */
export function standaloneTarget(pathname: string, search: string): string | null {
  if (pathname === "/") return "/m";
  return mobilePathFor(pathname, new URLSearchParams(search));
}

/**
 * Tomame installed from the browser is the app (Kelvin, 2026-11-23): the same `/m` screens
 * as the iPhone app. The manifest starts it on `/m`; this keeps it there when a link, an email
 * or Paystack's return opens a website page the app has a screen for (`/app/bag`,
 * `/app/orders?payment=success`, sign-in…). Decided on the phone, from `display-mode`, never by
 * cookie: on Android the installed app shares Chrome's cookies, so a cookie would also move
 * people browsing tomame.ca in a normal tab.
 */
export function StandaloneAppRouter() {
  const router = useRouter();
  const pathname = usePathname();
  useEffect(() => {
    if (!pathname || !isStandalone()) return;
    const to = standaloneTarget(pathname, window.location.search);
    if (to) router.replace(to);
  }, [pathname, router]);
  return null;
}
