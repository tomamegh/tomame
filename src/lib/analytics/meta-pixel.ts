/**
 * Meta Pixel, browser side. Off unless `NEXT_PUBLIC_META_PIXEL_ID` is set at
 * build time, and never handed personal data: no advanced matching, no emails,
 * no phones — only ids, money and counts.
 */

type Fbq = ((...args: unknown[]) => void) & {
  callMethod?: (...args: unknown[]) => void;
  queue: unknown[];
  push: Fbq;
  loaded: boolean;
  version: string;
};

declare global {
  interface Window {
    fbq?: Fbq;
    _fbq?: Fbq;
  }
}

/** Read as a literal so Next inlines it into the client bundle. */
export const META_PIXEL_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID?.trim() || null;

export const META_PIXEL_SCRIPT_SRC = "https://connect.facebook.net/en_US/fbevents.js";

/** Staff consoles are not marketing traffic. */
const UNTRACKED_PREFIXES = ["/admin", "/warehouse", "/delivery", "/driver", "/api"];

export function isMetaPixelPath(pathname: string): boolean {
  return !UNTRACKED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

/**
 * Meta's own queue stub, installed from code instead of an inline snippet so
 * `init` and the first `PageView` are queued in a known order before
 * `fbevents.js` arrives and drains them.
 */
export function installMetaPixel(pixelId: string): void {
  if (typeof window === "undefined" || window.fbq) return;
  const fbq = function (...args: unknown[]) {
    if (fbq.callMethod) fbq.callMethod(...args);
    else fbq.queue.push(args);
  } as Fbq;
  fbq.push = fbq;
  fbq.loaded = true;
  fbq.version = "2.0";
  fbq.queue = [];
  // Leave Meta's `disablePushState` alone: with it set, fbevents.js treats our
  // navigation PageView as a repeat of the first page and drops it. Without
  // it, each navigation is sent once (checked in the browser), ours or theirs.
  window.fbq = fbq;
  window._fbq ??= fbq;
  fbq("init", pixelId);
}

export type MetaStandardEvent = "PageView" | "AddToCart" | "InitiateCheckout" | "Purchase";

export interface MetaEventParams {
  value?: number;
  currency?: "GHS";
  content_ids?: string[];
  content_type?: "product";
  num_items?: number;
}

/**
 * Fire a standard event. A no-op when the pixel is off or not installed, so
 * callers never check. `eventId` lets Meta drop a repeat of the same purchase.
 */
export function trackMetaEvent(
  name: MetaStandardEvent,
  params?: MetaEventParams,
  eventId?: string,
): void {
  if (typeof window === "undefined" || typeof window.fbq !== "function") return;
  try {
    if (eventId) window.fbq("track", name, params ?? {}, { eventID: eventId });
    else if (params) window.fbq("track", name, params);
    else window.fbq("track", name);
  } catch {
    // Analytics must never break a checkout.
  }
}
