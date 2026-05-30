'use client';

import { motion, Variants } from "motion/react";
import Link from "next/link";
import {
  CheckCircle2,
  ChevronRight,
  PackageCheck,
  ShoppingBag,
  Smartphone,
  Sparkles,
} from "lucide-react";
import { Button } from "../ui/button";

const heroContainer: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.11, delayChildren: 0.05 } },
};
const heroItem: Variants = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { duration: 0.65 } },
};

const floatConfig = (delay = 0, duration = 5) => ({
  animate: { y: [0, -10, 0] },
  transition: { duration, delay, repeat: Infinity, ease: 'easeInOut' as const },
});

interface LandingHeroSectionProps {
  usdToGhs: number;
}

export default function LandingHeroSection({ usdToGhs }: LandingHeroSectionProps) {
  return (
    <section className="relative overflow-hidden bg-white flex items-center">
      {/* Dot grid */}
      <div
        className="absolute inset-0 opacity-[0.4]"
        style={{
          backgroundImage: 'radial-gradient(circle, #d6d3d1 1px, transparent 1px)',
          backgroundSize: '28px 28px',
        }}
      />
      {/* Subtle gradient wash — top-left rose, bottom-right amber */}
      <div className="pointer-events-none absolute -top-32 -left-32 h-125 w-125 rounded-full bg-rose-100/40 blur-[120px]" />
      <div className="pointer-events-none absolute -bottom-32 -right-32 h-100 w-100 rounded-full bg-amber-100/35 blur-[100px]" />

      <div className="relative z-10 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-28 sm:py-36">
        <div className="w-full grid grid-cols-1 lg:grid-cols-2 gap-16 lg:gap-20 items-center">

          {/* ── Left: copy ── */}
          <motion.div
            variants={heroContainer}
            initial="hidden"
            animate="show"
            className="flex flex-col items-start gap-6"
          >
            {/* Badge */}
            <motion.div variants={heroItem} className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-stone-200 bg-white text-xs text-stone-500 shadow-sm">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              <span className="font-medium">Built for Ghana</span>
              <span className="w-px h-3 bg-stone-200" />
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
              </span>
              <span className="text-emerald-600 font-semibold">Live</span>
            </motion.div>

            {/* Headline */}
            <motion.h1 variants={heroItem} className="text-[2.7rem] sm:text-6xl lg:text-7xl font-extrabold tracking-tight leading-[1.06] text-stone-900">
              Shop the World.
              <br />
              <span className="bg-linear-to-r from-rose-500 via-orange-400 to-amber-400 bg-clip-text text-transparent">
                Pay in Ghana.
              </span>
            </motion.h1>

            {/* Subtext */}
            <motion.p variants={heroItem} className="text-stone-500 text-base sm:text-lg leading-relaxed max-w-md">
              Paste a product link from Amazon, ASOS, or Alibaba. We handle everything — you pay with Mobile Money or card. No forex, no stress.
            </motion.p>

            {/* CTAs */}
            <motion.div variants={heroItem} className="flex flex-wrap items-center gap-3">
              <Link href="/auth/signup">
                <Button variant="primary" size="lg">Start for Free</Button>
              </Link>
              <Link
                href="#how-it-works"
                className="inline-flex h-11 items-center gap-1.5 rounded-lg px-4 text-sm font-semibold text-stone-600 transition-colors hover:text-stone-900"
              >
                How it works
                <ChevronRight className="h-4 w-4" />
              </Link>
            </motion.div>

            {/* Trust row */}
            <motion.div variants={heroItem} className="flex items-center gap-3 text-[11px] text-stone-400 flex-wrap">
              <span>MTN Mobile Money</span>
              <span className="w-1 h-1 rounded-full bg-stone-300" />
              <span>Vodafone Cash</span>
              <span className="w-1 h-1 rounded-full bg-stone-300" />
              <span>AirtelTigo Money</span>
              <span className="w-1 h-1 rounded-full bg-stone-300" />
              <span className="font-medium text-stone-500">
                $1 ≈ GH₵{usdToGhs.toFixed(2)}
              </span>
            </motion.div>
          </motion.div>

          {/* ── Right: floating order cards ── */}
          <motion.div
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.7, ease: 'easeOut' as const, delay: 0.3 }}
            className="relative hidden lg:block w-full max-w-sm mx-auto lg:mx-0 lg:ml-auto h-104"
          >
            {/* Card 1 */}
            <motion.div
              {...floatConfig(0, 5)}
              className="absolute top-0 left-0 right-8 rounded-2xl border border-stone-200 bg-white p-4 flex items-center gap-3.5 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.08),0_1px_4px_rgba(0,0,0,0.04)]"
            >
              <div className="w-10 h-10 rounded-xl bg-rose-50 border border-rose-100 flex items-center justify-center shrink-0">
                <ShoppingBag className="h-5 w-5 text-rose-500" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-stone-800 text-sm font-semibold truncate">Nike Air Max 270</p>
                <div className="flex items-center gap-1.5 mt-0.5 text-[11px] text-stone-400">
                  <span className="rounded bg-stone-100 px-1.5 py-0.5 text-[10px] font-medium text-stone-500">USA</span>
                  <span>Amazon · GH₵ 1,240</span>
                </div>
              </div>
              <span className="shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-50 border border-amber-200 text-amber-600 text-[10px] font-semibold">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                In Transit
              </span>
            </motion.div>

            {/* Card 2 */}
            <motion.div
              {...floatConfig(1.4, 6)}
              className="absolute top-[38%] left-8 right-0 rounded-2xl border border-stone-200 bg-white p-4 flex items-center gap-3.5 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.08),0_1px_4px_rgba(0,0,0,0.04)]"
            >
              <div className="w-10 h-10 rounded-xl bg-purple-50 border border-purple-100 flex items-center justify-center shrink-0">
                <Sparkles className="h-5 w-5 text-purple-500" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-stone-800 text-sm font-semibold truncate">Charlotte Tilbury Kit</p>
                <div className="flex items-center gap-1.5 mt-0.5 text-[11px] text-stone-400">
                  <span className="rounded bg-stone-100 px-1.5 py-0.5 text-[10px] font-medium text-stone-500">UK</span>
                  <span>ASOS · GH₵ 890</span>
                </div>
              </div>
              <span className="shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-600 text-[10px] font-semibold">
                <CheckCircle2 className="h-3 w-3" />
                Delivered
              </span>
            </motion.div>

            {/* Card 3 */}
            <motion.div
              {...floatConfig(2.6, 4.5)}
              className="absolute bottom-0 left-2 right-10 rounded-2xl border border-stone-200 bg-white p-4 flex items-center gap-3.5 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.08),0_1px_4px_rgba(0,0,0,0.04)]"
            >
              <div className="w-10 h-10 rounded-xl bg-sky-50 border border-sky-100 flex items-center justify-center shrink-0">
                <Smartphone className="h-5 w-5 text-sky-500" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-stone-800 text-sm font-semibold truncate">iPhone 15 Pro</p>
                <div className="flex items-center gap-1.5 mt-0.5 text-[11px] text-stone-400">
                  <span className="rounded bg-stone-100 px-1.5 py-0.5 text-[10px] font-medium text-stone-500">China</span>
                  <span>Apple · GH₵ 9,450</span>
                </div>
              </div>
              <span className="shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-full bg-sky-50 border border-sky-200 text-sky-600 text-[10px] font-semibold">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-sky-400" />
                Processing
              </span>
            </motion.div>

            {/* Chip — payment confirmed */}
            <motion.div
              {...floatConfig(0.9, 4)}
              className="absolute -bottom-4 -right-4 flex items-center gap-2 bg-white border border-emerald-200 rounded-full px-3.5 py-2 shadow-[0_4px_16px_-4px_rgba(0,0,0,0.1)]"
            >
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
              <span className="text-emerald-700 text-[11px] font-medium">Payment confirmed</span>
            </motion.div>

            {/* Chip — shipped */}
            <motion.div
              {...floatConfig(2, 5.5)}
              className="absolute -top-4 -right-3 flex items-center gap-2 bg-white border border-stone-200 rounded-full px-3.5 py-2 shadow-[0_4px_16px_-4px_rgba(0,0,0,0.1)]"
            >
              <PackageCheck className="h-3.5 w-3.5 text-stone-500" />
              <span className="text-stone-600 text-[11px] font-medium">Order shipped</span>
            </motion.div>
          </motion.div>

        </div>
      </div>
    </section>
  );
}
