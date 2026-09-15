import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Geist_Mono, Instrument_Sans } from "next/font/google";
import { Providers } from "./providers";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { Analytics } from "@vercel/analytics/next"
import { SpeedInsights } from "@vercel/speed-insights/next"
import { InstallPrompt, PwaSplash, ServiceWorkerRegistrar } from "@/features/pwa/components";
import { appleStartupImages } from "@/features/pwa/lib/apple-startup-images";
import { APP_THEME_COLOR } from "@/features/pwa/lib/splash-theme";

/** Headings. Variable font (opsz 12..96, wght 500..800) — weight is set in CSS. */
const bricolage = Bricolage_Grotesque({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
});

/** Everything else. Variable font (wght 400..700). */
const instrumentSans = Instrument_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Tomame",
  description: "Concierge shopping platform for Ghana",
  applicationName: "Tomame",
  // `src/app/manifest.ts` is picked up automatically; everything here is the
  // half of installability Next does NOT infer.
  appleWebApp: {
    capable: true,
    // The name under the home-screen icon on iOS.
    title: "Tomame",
    // Translucent, so the sunset launch screen and the app's own header run
    // edge to edge under the clock and battery instead of sitting below a white
    // strip. The cost is that anything pinned to the top of the viewport has to
    // reserve `env(safe-area-inset-top)` itself — see `.tm-safe-top` in
    // globals.css and the app and marketing headers that use it.
    statusBarStyle: "black-translucent",
    startupImage: appleStartupImages(),
  },
  // Stops iOS turning bare phone numbers in order details into blue call links.
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: APP_THEME_COLOR,
  // Required for `env(safe-area-inset-*)` to report anything but zero, which
  // the translucent status bar above depends on.
  viewportFit: "cover",
  width: "device-width",
  initialScale: 1,
  // Zoom stays enabled. An installed app that cannot be pinch-zoomed is a
  // shopping app a long-sighted customer cannot read the price on.
};

/**
 * Decides, BEFORE the first paint, whether this document load is a launch.
 *
 * The splash is revealed by a `display-mode` media query rather than by React,
 * which is what stops it flashing the app first — but a media query cannot tell
 * a cold launch from any other full page load. Returning from Paystack is a
 * full page load (`/api/payments/callback` answers with a redirect), so without
 * this the customer who has just paid would watch two seconds of sunset before
 * seeing whether their payment went through.
 *
 * `sessionStorage` is the right store: it lives as long as the tab, so it
 * survives the round trip out to Paystack and back, and it is empty again after
 * the app is closed and relaunched — which is exactly when a splash IS wanted.
 * Inline and synchronous in the head, so the attribute is on `<html>` before
 * the body is parsed and nothing ever renders and then un-renders.
 */
const SPLASH_ONCE_PER_LAUNCH = `try{var k='tm.splash.shown';if(sessionStorage.getItem(k)){document.documentElement.setAttribute('data-tm-splash','seen')}else{sessionStorage.setItem(k,'1')}}catch(e){}`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${bricolage.variable} ${instrumentSans.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: SPLASH_ONCE_PER_LAUNCH }} />
      </head>
      <body
        className={`${geistMono.variable} antialiased bg-background text-foreground min-h-screen`}
      >
        {/*
          First in the body so it paints before anything below it. Hidden
          outright in a browser tab — it reveals itself with a `display-mode`
          media query, not with JavaScript.
        */}
        <PwaSplash />
        <Providers>{children}</Providers>
        {/*
          The offsets are not decoration. Sonner measures from the top of the
          LAYOUT viewport — 24px on desktop, 16px on a phone — and knows nothing
          about safe areas. Since the installed app sets `viewport-fit: cover`
          and a translucent status bar, that viewport now starts at the physical
          top of the screen, so a 16px toast landed entirely inside the status
          bar: "Added to your bag" was drawn behind the clock and the notch and
          nobody ever saw it. Adding the inset puts it back under the status bar
          on a device, and changes nothing in a browser tab, where
          `env(safe-area-inset-top)` is 0 and these resolve to the defaults.
        */}
        <Toaster
          position="top-center"
          duration={5000}
          offset={{
            top: "calc(env(safe-area-inset-top) + 24px)",
            right: "24px",
            bottom: "calc(env(safe-area-inset-bottom) + 24px)",
            left: "24px",
          }}
          mobileOffset={{
            top: "calc(env(safe-area-inset-top) + 16px)",
            right: "16px",
            bottom: "calc(env(safe-area-inset-bottom) + 16px)",
            left: "16px",
          }}
        />
        <InstallPrompt />
        <ServiceWorkerRegistrar />
      </body>
      <Analytics />
      <SpeedInsights />
    </html>
  );
}
