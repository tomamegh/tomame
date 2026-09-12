import { Bricolage_Grotesque, Geist_Mono, Instrument_Sans } from "next/font/google";
import { Providers } from "./providers";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { Analytics } from "@vercel/analytics/next"
import { SpeedInsights } from "@vercel/speed-insights/next"

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

export const metadata = {
  title: "Tomame",
  description: "Concierge shopping platform for Ghana",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${bricolage.variable} ${instrumentSans.variable}`}>
      <body
        className={`${geistMono.variable} antialiased bg-background text-foreground min-h-screen`}
      >
        <Providers>{children}</Providers>
        <Toaster
          position="top-center"
          duration={5000}
        />
      </body>
      <Analytics />
      <SpeedInsights />
    </html>
  );
}
