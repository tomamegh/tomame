import type { Metadata } from "next";

import "@/features/mobile/mobile.css";
import { MobileShell } from "@/features/mobile/components/shell";
import { getAppChrome } from "@/features/app-shell/services/app-chrome.service";

export const metadata: Metadata = {
  title: { absolute: "Tomame" },
  robots: { index: false, follow: false },
};

/**
 * Tomame for iPhone. The Capacitor shell in `native/` loads these routes; the design is
 * `design/mobile/`. `src/proxy.ts` gates `/m` (only `/m/welcome` is public) and sends the
 * app's requests for website pages to their `/m` screen. Providers and the toaster come
 * from the root layout.
 */
export default async function MobileLayout({ children }: { children: React.ReactNode }) {
  const chrome = await getAppChrome();
  return <MobileShell bagCount={chrome.bagCount ?? 0}>{children}</MobileShell>;
}
