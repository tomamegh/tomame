"use client";

import { ArrowClockwise } from "@phosphor-icons/react";

import { Button } from "@/components/ui/button";

/**
 * "Try again" on the offline page.
 *
 * `location.reload()` rather than a router push: the router would ask the
 * service worker, which would hand back this same cached page. A reload is a
 * real navigation, so it either reaches the network or lands back here — which
 * is the honest answer either way.
 */
export function OfflineRetryButton() {
  return (
    <Button
      variant="primary"
      size="lg"
      className="mt-7"
      onClick={() => window.location.reload()}
    >
      <ArrowClockwise size={18} weight="bold" />
      Try again
    </Button>
  );
}
