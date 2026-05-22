'use client';

import Image from 'next/image';
import Link from 'next/link';
import { motion, type Variants } from 'motion/react';
import {
  HiArrowRight,
  HiCheckCircle,
  HiOutlineArrowTrendingUp,
  HiOutlineLink,
} from 'react-icons/hi2';
import { Button } from '../ui/button';

type ValueProp = {
  title: string;
  description: string;
  bullets: string[];
  ctaLabel: string;
  ctaHref: string;
};

const VALUE_PROPS: ValueProp[] = [
  {
    title: 'Stop wasting hours on manual sourcing',
    description:
      'Tomame replaces spreadsheets, back-and-forth emails, and guesswork with a single workflow. Paste a link and let us handle the rest.',
    bullets: [
      'Auto-extract product data from Amazon, ASOS, Alibaba and more',
      'Instant shipping and exchange-rate calculations',
      'One-tap order placement with Mobile Money',
    ],
    ctaLabel: 'Start sourcing',
    ctaHref: '/auth/signup',
  },
  {
    title: 'Built for the way Ghanaians actually shop',
    description:
      'Whether you order one item or stock a boutique, Tomame keeps the experience clean. Transparent pricing, predictable timelines, local support.',
    bullets: [
      'Unlimited product links — no per-link fees',
      'Real-time status updates from purchase to delivery',
      'Local team in Accra ready to help on WhatsApp',
    ],
    ctaLabel: 'Create free account',
    ctaHref: '/auth/signup',
  },
];

const stagger: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.1, delayChildren: 0.05 } },
};

const fromLeft: Variants = {
  hidden: { opacity: 0, x: -32 },
  show: { opacity: 1, x: 0, transition: { duration: 0.7, ease: [0.16, 1, 0.3, 1] } },
};

const fromRight: Variants = {
  hidden: { opacity: 0, x: 32 },
  show: { opacity: 1, x: 0, transition: { duration: 0.7, ease: [0.16, 1, 0.3, 1] } },
};

const fadeIn: Variants = {
  hidden: { opacity: 0, scale: 0.96 },
  show: { opacity: 1, scale: 1, transition: { duration: 0.8, ease: [0.16, 1, 0.3, 1] } },
};

export default function ValueSection() {
  return (
    <section className="relative overflow-hidden border-t border-stone-100 bg-white py-28 sm:py-32 lg:py-36">
      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Photo break banner */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
          className="relative mb-28 h-56 overflow-hidden rounded-3xl sm:mb-36 sm:h-72 lg:mb-44"
        >
          <Image
            src="/images/shopping.jpg"
            alt="Shopping online"
            fill
            sizes="(max-width: 1280px) 100vw, 1280px"
            className="object-cover object-center"
          />
          <div className="absolute inset-0 bg-linear-to-r from-stone-900/60 via-stone-900/30 to-stone-900/60" />
          <div className="absolute inset-0 flex items-center justify-center">
            <p className="text-center text-xl font-bold tracking-tight text-white sm:text-2xl lg:text-3xl">
              Everything you need, from paste to doorstep.
            </p>
          </div>
        </motion.div>

        <div className="space-y-28 sm:space-y-36 lg:space-y-44">
        {VALUE_PROPS.map((vp, i) => {
          const reversed = i % 2 !== 0;
          const textVariants = reversed ? fromRight : fromLeft;

          return (
            <motion.div
              key={vp.title}
              initial="hidden"
              whileInView="show"
              viewport={{ once: true, amount: 0.25 }}
              variants={stagger}
              className={`flex flex-col items-center gap-10 lg:gap-16 ${
                reversed ? 'lg:flex-row-reverse' : 'lg:flex-row'
              }`}
            >
              {/* Text side */}
              <motion.div variants={textVariants} className="flex-1 space-y-6">
                <h2 className="text-3xl font-bold leading-tight tracking-tight text-stone-900 sm:text-4xl lg:text-5xl">
                  {vp.title}
                </h2>
                <p className="max-w-lg text-base leading-relaxed text-stone-500 sm:text-lg">
                  {vp.description}
                </p>

                <ul className="space-y-3 pt-2">
                  {vp.bullets.map((b) => (
                    <li key={b} className="flex items-start gap-3">
                      <HiCheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" />
                      <span className="text-sm leading-relaxed text-stone-700 sm:text-base">
                        {b}
                      </span>
                    </li>
                  ))}
                </ul>

                <div className="pt-2">
                  <Link href={vp.ctaHref}>
                    <Button variant="primary" size="lg" className="h-12 px-6 text-base">
                      {vp.ctaLabel}
                      <HiArrowRight className="ml-1 h-4 w-4" />
                    </Button>
                  </Link>
                </div>
              </motion.div>

              {/* Visual side */}
              <motion.div variants={fadeIn} className="w-full flex-1">
                {i === 0 ? <ExtractionVisual /> : <DashboardVisual />}
              </motion.div>
            </motion.div>
          );
        })}
        </div>
      </div>
    </section>
  );
}

function ExtractionVisual() {
  return (
    <div className="dark-card relative overflow-hidden rounded-3xl border border-white/10 p-5 shadow-[0_24px_72px_-12px_rgba(0,0,0,0.45)] sm:p-8">
      <div className="space-y-4">
        {/* URL input bar */}
        <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/4 px-4 py-3 backdrop-blur-sm">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-rose-500/20 ring-1 ring-rose-400/30">
            <HiOutlineLink className="h-4 w-4 text-rose-300" />
          </div>
          <div className="flex-1">
            <p className="text-[10px] uppercase tracking-wider text-white/30">Product URL</p>
            <p className="truncate text-xs font-medium text-white/80 sm:text-sm">
              amazon.com/dp/B0CHX1W1XY
            </p>
          </div>
          <div className="shrink-0 rounded-lg bg-linear-to-r from-rose-500 to-amber-500 px-3 py-1.5 text-[11px] font-bold text-white shadow-[0_4px_14px_-2px_rgba(244,63,94,0.5)]">
            Extract
          </div>
        </div>

        {/* Field grid */}
        <div className="grid grid-cols-2 gap-3">
          {[
            { label: 'Product Name', value: 'Nike Air Max 270' },
            { label: 'Price (USD)', value: '$149.99' },
            { label: 'Weight', value: '1.2 kg' },
            { label: 'Platform', value: 'Amazon US' },
          ].map((field) => (
            <div
              key={field.label}
              className="rounded-xl border border-white/10 bg-white/3 p-3"
            >
              <p className="text-[10px] uppercase tracking-wider text-white/30">
                {field.label}
              </p>
              <p className="mt-1 truncate text-sm font-semibold text-white">{field.value}</p>
            </div>
          ))}
        </div>

        {/* Success */}
        <div className="flex items-center gap-2 rounded-xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-3">
          <HiCheckCircle className="h-4 w-4 text-emerald-300" />
          <span className="text-xs font-medium text-emerald-200">
            Product data extracted in 1.8s
          </span>
        </div>
      </div>
    </div>
  );
}

function DashboardVisual() {
  const bars = [30, 50, 40, 70, 55, 85, 65, 90, 75, 95, 80, 100];

  return (
    <div className="dark-card relative overflow-hidden rounded-3xl border border-white/10 p-5 shadow-[0_24px_72px_-12px_rgba(0,0,0,0.45)] sm:p-8">
      <div className="space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-white/30">
              Orders this month
            </p>
            <p className="mt-0.5 text-xl font-bold text-white">2,847</p>
          </div>
          <div className="inline-flex items-center gap-1 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2.5 py-1 text-[11px] font-semibold text-emerald-300">
            <HiOutlineArrowTrendingUp className="h-3 w-3" />
            +24%
          </div>
        </div>

        {/* Bars */}
        <div className="flex h-28 items-end gap-1.5 sm:h-32">
          {bars.map((h, j) => (
            <motion.div
              key={j}
              initial={{ height: 0 }}
              whileInView={{ height: `${h}%` }}
              viewport={{ once: true }}
              transition={{ duration: 0.7, delay: j * 0.04, ease: [0.16, 1, 0.3, 1] }}
              className="flex-1 rounded-t bg-linear-to-t from-rose-500/70 via-orange-400/50 to-amber-400/30"
            />
          ))}
        </div>

        {/* Stat grid */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Active', value: '342' },
            { label: 'Shipped', value: '1,203' },
            { label: 'Delivered', value: '1,302' },
          ].map((s) => (
            <div
              key={s.label}
              className="rounded-xl border border-white/10 bg-white/3 p-3 text-center"
            >
              <p className="text-[10px] uppercase tracking-wider text-white/30">{s.label}</p>
              <p className="mt-1 text-sm font-bold text-white">{s.value}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
