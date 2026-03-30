'use client';

import { motion, Variants } from "motion/react";
import Link from "next/link";
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
        className="absolute inset-0 opacity-[0.45]"
        style={{
          backgroundImage: 'radial-gradient(circle, #e7e5e4 1px, transparent 1px)',
          backgroundSize: '28px 28px',
        }}
      />
      {/* Soft gradient washes */}
      {/* <div className="absolute top-0 left-0 size-150 bg-rose-100/60 rounded-full blur-[120px] pointer-events-none -translate-x-1/3 -translate-y-1/3" />
      <div className="absolute bottom-0 right-0 size-125 bg-amber-100/50 rounded-full blur-[100px] pointer-events-none translate-x-1/4 translate-y-1/4" /> */}

      <div className="relative z-10 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-28 sm:py-36 lg:flex lg:items-center">
        <div className="w-full grid grid-cols-1 lg:grid-cols-2 gap-16 lg:gap-20 items-center">

          {/* ── Left: copy ── */}
          <motion.div
            variants={heroContainer}
            initial="hidden"
            animate="show"
            className="flex flex-col items-start gap-6"
          >
            {/* Badge */}
            <motion.div variants={heroItem} className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-stone-200 bg-stone-50 text-xs text-stone-500 shadow-sm shadow-rose-300/20">
              <span>🇬🇭</span>
              <span className="font-medium">Built for Ghana</span>
              <span className="w-px h-3 bg-stone-300" />
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
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
            <motion.div variants={heroItem} className="flex flex-wrap gap-3">
              <Link href="/auth/signup">
                <Button variant="primary" size="lg">Start for Free</Button>
              </Link>
            </motion.div>

            {/* Trust row */}
            <motion.div variants={heroItem} className="flex items-center gap-3 text-[11px] text-stone-400 flex-wrap">
              <span>Mobile Money</span>
              <span className="w-1 h-1 rounded-full bg-stone-300" />
              <span>USA · UK · China</span>
              <span className="w-1 h-1 rounded-full bg-stone-300" />
              <span>Transparent pricing</span>
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
            className="relative hidden lg:block w-full max-w-sm mx-auto lg:mx-0 lg:ml-auto h-105"
          >
            {/* Soft inner glow */}
            {/* <div className="absolute inset-0 m-auto size-56 bg-rose-200/40 rounded-full blur-3xl pointer-events-none" /> */}

            {/* Card 1 */}
            <motion.div {...floatConfig(0, 5)} className="absolute top-0 left-0 right-6 sm:right-10 rounded-2xl border border-stone-200/80 bg-white p-4 flex items-center gap-3.5 shadow-[0_4px_24px_-4px_rgba(0,0,0,0.08)]">
              <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center text-xl shrink-0">👟</div>
              <div className="flex-1 min-w-0">
                <p className="text-stone-800 text-xs font-semibold truncate">Nike Air Max 270</p>
                <p className="text-stone-400 text-[10px] mt-0.5">🇺🇸 Amazon US · GH₵ 1,240</p>
              </div>
              <span className="shrink-0 px-2.5 py-1 rounded-full bg-amber-50 border border-amber-200 text-amber-600 text-[10px] font-semibold">
                In Transit
              </span>
            </motion.div>

            {/* Card 2 */}
            <motion.div {...floatConfig(1.4, 6)} className="absolute top-[38%] left-6 sm:left-10 right-0 rounded-2xl border border-stone-200/80 bg-white p-4 flex items-center gap-3.5 shadow-[0_4px_24px_-4px_rgba(0,0,0,0.08)]">
              <div className="w-10 h-10 rounded-xl bg-purple-50 border border-purple-100 flex items-center justify-center text-xl shrink-0">💄</div>
              <div className="flex-1 min-w-0">
                <p className="text-stone-800 text-xs font-semibold truncate">Charlotte Tilbury Kit</p>
                <p className="text-stone-400 text-[10px] mt-0.5">🇬🇧 ASOS UK · GH₵ 890</p>
              </div>
              <span className="shrink-0 px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-600 text-[10px] font-semibold">
                Delivered ✓
              </span>
            </motion.div>

            {/* Card 3 */}
            <motion.div {...floatConfig(2.6, 4.5)} className="absolute bottom-0 left-2 right-8 sm:right-14 rounded-2xl border border-stone-200/80 bg-white p-4 flex items-center gap-3.5 shadow-[0_4px_24px_-4px_rgba(0,0,0,0.08)]">
              <div className="w-10 h-10 rounded-xl bg-orange-50 border border-orange-100 flex items-center justify-center text-xl shrink-0">📱</div>
              <div className="flex-1 min-w-0">
                <p className="text-stone-800 text-xs font-semibold truncate">iPhone 15 Pro</p>
                <p className="text-stone-400 text-[10px] mt-0.5">🇨🇳 Apple CN · GH₵ 9,450</p>
              </div>
              <span className="shrink-0 px-2.5 py-1 rounded-full bg-sky-50 border border-sky-200 text-sky-600 text-[10px] font-semibold">
                Processing
              </span>
            </motion.div>

            {/* Chip — payment confirmed */}
            <motion.div {...floatConfig(0.9, 4)} className="absolute -bottom-4 -right-2 sm:-right-5 flex items-center gap-2 bg-white border border-emerald-200 rounded-full px-3.5 py-2 shadow-[0_4px_16px_-4px_rgba(0,0,0,0.1)]">
              <span className="w-4 h-4 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600 text-[9px] font-bold">✓</span>
              <span className="text-emerald-700 text-[11px] font-medium">Payment confirmed</span>
            </motion.div>

            {/* Chip — shipped */}
            <motion.div {...floatConfig(2, 5.5)} className="absolute -top-4 -right-2 sm:-right-4 flex items-center gap-2 bg-white border border-stone-200 rounded-full px-3.5 py-2 shadow-[0_4px_16px_-4px_rgba(0,0,0,0.1)]">
              <span className="text-sm leading-none">📦</span>
              <span className="text-stone-600 text-[11px] font-medium">Order shipped</span>
            </motion.div>

          </motion.div>
        </div>
      </div>
    </section>
  );
}