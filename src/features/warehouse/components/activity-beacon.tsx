"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

/**
 * Tells the server which warehouse screen was opened (082), for the admin's
 * activity trail. Renders nothing.
 *
 * The pathname only — never the query string, which can hold what was typed in
 * a search box. Debounced so a redirect or a quick back-and-forth records the
 * page the operator settled on, and never the same page twice in a row.
 *
 * The label and QR routes are skipped: the server records those itself
 * (`label_view`, and the scan the QR resolves to), with the package attached.
 */
const DEBOUNCE_MS = 800;
const SKIP = [/^\/warehouse\/p\//, /\/label\/?$/];

export function WarehouseActivityBeacon() {
  const pathname = usePathname();
  const last = useRef<string | null>(null);

  useEffect(() => {
    if (!pathname || !pathname.startsWith("/warehouse")) return;
    if (SKIP.some((pattern) => pattern.test(pathname))) return;
    const timer = window.setTimeout(() => {
      if (last.current === pathname) return;
      last.current = pathname;
      send(pathname);
    }, DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [pathname]);

  return null;
}

function send(path: string) {
  const body = JSON.stringify({ path });
  try {
    if (typeof navigator.sendBeacon === "function") {
      const queued = navigator.sendBeacon(
        "/api/warehouse/activity",
        new Blob([body], { type: "application/json" }),
      );
      if (queued) return;
    }
    void fetch("/api/warehouse/activity", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
      credentials: "same-origin",
    }).catch(() => undefined);
  } catch {
    // A lost page view is not worth an error on the operator's screen.
  }
}
