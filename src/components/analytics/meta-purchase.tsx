"use client";

import { useEffect } from "react";

import { META_PIXEL_ID, installMetaPixel, trackMetaEvent } from "@/lib/analytics/meta-pixel";

export interface VerifiedPurchase {
  /** `group:<id>` or `order:<id>` — doubles as Meta's dedupe `eventID`. */
  id: string;
  valueGhs: number;
  numItems: number;
}

/**
 * Reports a purchase the SERVER has confirmed as paid. The page only renders
 * this after reading the order's own paid state, never from `?payment=success`
 * alone. A reload of the return URL is not a second purchase: the id is
 * remembered on this device and sent as `eventID` so Meta drops repeats.
 */
export function MetaPurchase({ purchase }: { purchase: VerifiedPurchase }) {
  const { id, valueGhs, numItems } = purchase;
  useEffect(() => {
    if (!META_PIXEL_ID) return;
    const key = `tm.meta.purchase.${id}`;
    try {
      if (localStorage.getItem(key)) return;
      localStorage.setItem(key, "1");
    } catch {
      // Storage blocked: eventID still dedupes on Meta's side.
    }
    // MetaPixel's tracker sits behind a Suspense boundary and may mount after
    // this page; installing here (idempotent) queues the event either way.
    installMetaPixel(META_PIXEL_ID);
    trackMetaEvent(
      "Purchase",
      { value: valueGhs, currency: "GHS", num_items: numItems, content_type: "product" },
      id,
    );
  }, [id, valueGhs, numItems]);
  return null;
}
