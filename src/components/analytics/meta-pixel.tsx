"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Script from "next/script";
import { usePathname, useSearchParams } from "next/navigation";

import {
  META_PIXEL_ID,
  META_PIXEL_SCRIPT_SRC,
  installMetaPixel,
  isMetaPixelPath,
  trackMetaEvent,
} from "@/lib/analytics/meta-pixel";

/**
 * Meta Pixel, mounted once in the root layout. Renders nothing when
 * `NEXT_PUBLIC_META_PIXEL_ID` is unset. There is no consent banner on the
 * site, so it loads for every visitor on a customer-facing page.
 */
export function MetaPixel() {
  const pathname = usePathname();
  if (!META_PIXEL_ID) return null;
  return (
    <>
      {/* `useSearchParams` needs a boundary, or every static page bails out of its prerender. */}
      <Suspense fallback={null}>
        <MetaPixelTracker pixelId={META_PIXEL_ID} />
      </Suspense>
      {isMetaPixelPath(pathname) ? (
        <noscript>
          <img
            height="1"
            width="1"
            style={{ display: "none" }}
            alt=""
            src={`https://www.facebook.com/tr?id=${META_PIXEL_ID}&ev=PageView&noscript=1`}
          />
        </noscript>
      ) : null}
    </>
  );
}

/**
 * One `PageView` per URL, the first load included: App Router navigations do
 * not reload the page, so the pixel's own load-time `PageView` would count a
 * whole visit as one page. The ref keeps Strict Mode's double effect from
 * counting the same URL twice.
 */
function MetaPixelTracker({ pixelId }: { pixelId: string }) {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const lastUrl = useRef<string | null>(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    if (!isMetaPixelPath(pathname)) return;
    const url = search ? `${pathname}?${search}` : pathname;
    if (lastUrl.current === url) return;
    lastUrl.current = url;
    installMetaPixel(pixelId);
    trackMetaEvent("PageView");
    setInstalled(true);
  }, [pathname, search, pixelId]);

  return installed ? (
    <Script id="meta-pixel" src={META_PIXEL_SCRIPT_SRC} strategy="afterInteractive" />
  ) : null;
}
