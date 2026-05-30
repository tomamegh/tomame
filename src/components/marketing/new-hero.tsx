'use client';

import { motion, useReducedMotion, type Variants } from 'motion/react';
import Image from 'next/image';
import Link from 'next/link';
import { CheckCircle2, ChevronRight } from 'lucide-react';
import { Button } from '../ui/button';

interface NewHeroSectionProps {
  usdToGhs: number;
}

const container: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.1, delayChildren: 0.15 } },
};
const item: Variants = {
  hidden: { opacity: 0, y: 22 },
  show: { opacity: 1, y: 0, transition: { duration: 0.75, ease: [0.16, 1, 0.3, 1] } },
};

const PAYMENTS = ['MTN Mobile Money', 'Vodafone Cash', 'AirtelTigo', 'Visa / Mastercard'];

export default function NewHeroSection({ usdToGhs }: NewHeroSectionProps) {
  const prefersReducedMotion = useReducedMotion();

  return (
    <section className="relative min-h-150 max-h-200 overflow-hidden" style={{ height: 'calc(100vh - 64px)' }}>
      {/* Background image */}
      <Image
        src="/images/shopping.jpg"
        alt=""
        fill
        priority
        sizes="100vw"
        className="object-cover object-center"
      />

      {/* Gradient overlay: dense on left, fades right so image shows through */}
      <div className="absolute inset-0 bg-linear-to-r from-stone-950/90 via-stone-950/60 to-stone-950/20" />
      {/* Bottom fade */}
      <div className="absolute inset-x-0 bottom-0 h-32 bg-linear-to-t from-stone-950/40 to-transparent" />

      {/* Content */}
      <div className="relative z-10 flex h-full items-center">
        <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
          <motion.div
            variants={prefersReducedMotion ? undefined : container}
            initial={prefersReducedMotion ? false : 'hidden'}
            animate="show"
            className="flex max-w-2xl flex-col gap-6"
          >
            {/* Live rate badge */}
            <motion.div variants={prefersReducedMotion ? undefined : item}>
              <span className="inline-flex items-center gap-2.5 rounded-full border border-white/15 bg-white/10 px-4 py-2 text-sm font-medium text-white/85 backdrop-blur-md">
                <span className="relative flex h-2 w-2 shrink-0">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
                </span>
                $1&nbsp;=&nbsp;GH₵{usdToGhs.toFixed(2)} today
                <span className="h-3.5 w-px bg-white/20" />
                <span className="text-white/50 text-xs">Built for Ghana</span>
              </span>
            </motion.div>

            {/* Headline */}
            <motion.h1
              variants={prefersReducedMotion ? undefined : item}
              className="text-5xl font-black leading-[1.05] tracking-tight text-white sm:text-6xl lg:text-7xl"
            >
              Shop the world.
              <br />
              <span className="bg-linear-to-r from-rose-400 via-orange-400 to-amber-400 bg-clip-text text-transparent">Pay in Ghana.</span>
            </motion.h1>

            {/* Subtext */}
            <motion.p
              variants={prefersReducedMotion ? undefined : item}
              className="max-w-lg text-base leading-relaxed text-white/65 sm:text-lg"
            >
              Paste a product link from Amazon, eBay, or SHEIN. We purchase, ship, and deliver to your door — you pay in cedis. No forex, no hassle.
            </motion.p>

            {/* CTAs */}
            <motion.div
              variants={prefersReducedMotion ? undefined : item}
              className="flex flex-wrap items-center gap-3"
            >
              <Link href="/auth/signup">
                <Button variant="primary" size="lg" className="h-12 px-7 text-base">
                  Start Shopping Free
                </Button>
              </Link>
              <Link
                href="#how-it-works"
                className="inline-flex h-12 items-center gap-2 rounded-full border border-white/20 bg-white/8 px-6 text-sm font-semibold text-white/85 backdrop-blur-sm transition-colors hover:bg-white/15 hover:text-white"
              >
                How it works
                <ChevronRight className="h-4 w-4" />
              </Link>
            </motion.div>

            {/* Payment method trust row */}
            <motion.div
              variants={prefersReducedMotion ? undefined : item}
              className="flex flex-wrap gap-x-5 gap-y-2 text-[11px] text-white/50"
            >
              {PAYMENTS.map((p) => (
                <span key={p} className="flex items-center gap-1.5">
                  <CheckCircle2 className="h-3 w-3 text-emerald-400" />
                  {p}
                </span>
              ))}
            </motion.div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
