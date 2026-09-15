import Image from "next/image";
import type { Metadata } from "next";

import { OfflineRetryButton } from "@/features/pwa/components/offline-retry-button";

export const metadata: Metadata = {
  title: "You are offline · Tomame",
  robots: { index: false, follow: false },
};

/**
 * The page the service worker serves when a navigation cannot reach the
 * network at all.
 *
 * It must be entirely self-contained: no data fetch, no session, nothing that
 * could need the network it is here precisely because there isn't one. The
 * worker precaches this route at install time so it is on the device before it
 * is ever needed.
 *
 * The reassurance is the point. A customer who loses signal mid-checkout on a
 * Ghanaian mobile connection needs to know their bag and their orders are on
 * our servers, not stranded in an app that just went blank.
 */
export default function OfflinePage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-tm-paper px-6 text-center">
      <Image
        src="/images/brand/logo-mark.webp"
        alt="Tomame"
        width={560}
        height={259}
        priority
        className="w-32 opacity-90"
      />

      <h1 className="font-display mt-7 text-2xl font-bold text-tm-ink">
        No connection
      </h1>
      <p className="mt-2 max-w-sm text-[15px] leading-relaxed text-tm-text-2">
        Tomame needs the internet for this. Your bag, your quotes and every order
        you have placed are safe on our side. They will be exactly where you
        left them.
      </p>

      <OfflineRetryButton />

      <p className="mt-10 text-xs text-tm-text-3">
        Shipping the world, delivering trust
      </p>
    </main>
  );
}
