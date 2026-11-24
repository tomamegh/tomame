import type { Metadata, Viewport } from "next";

import "@/features/mobile/mobile.css";
import { MobileShell } from "@/features/mobile/components/shell";
import { cookies } from "next/headers";

import { getBagCount } from "@/features/bag/services/bag.service";
import { readQuoteSessionFromCookies } from "@/lib/quote-session";
import { currentUser } from "@/features/mobile/services/session.service";

export const metadata: Metadata = {
  title: { absolute: "Tomame" },
  robots: { index: false, follow: false },
};

/**
 * The app never zooms: pinch or a tap into a field would leave the screen zoomed and
 * draggable, which is not how an app behaves. (The website keeps zoom for accessibility.)
 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
};

/**
 * Tomame for iPhone. The Capacitor shell in `native/` loads these routes; the design is
 * `design/mobile/`. `src/proxy.ts` gates `/m` (only `/m/welcome` is public) and sends the
 * app's requests for website pages to their `/m` screen. Providers and the toaster come
 * from the root layout.
 */
export default async function MobileLayout({ children }: { children: React.ReactNode }) {
  // Only what the frame draws (the bag badge), on the same user lookup as the screen inside it.
  const [user, cookieStore] = await Promise.all([currentUser(), cookies()]);
  const bagCount = user ? await getBagCount({ userId: user.id, sessionId: readQuoteSessionFromCookies(cookieStore) }).catch(() => 0) : 0;
  return <MobileShell bagCount={bagCount}>{children}</MobileShell>;
}
