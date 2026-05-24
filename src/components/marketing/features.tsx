'use client';

import { motion, type Variants } from 'motion/react';
import Image from 'next/image';
import type { IconType } from 'react-icons';
import {
  HiOutlineGlobeAlt,
  HiOutlineLink,
  HiOutlineReceiptPercent,
  HiOutlineShieldCheck,
  HiOutlineSignal,
} from 'react-icons/hi2';

type Feature = {
  icon: IconType;
  title: string;
  description: string;
};

const FEATURES: Feature[] = [
  {
    icon: HiOutlineLink,
    title: 'Link Extraction',
    description:
      'Paste any product link — Amazon, ASOS, Alibaba, eBay, and more. We pull the title, image, price, and weight in seconds.',
  },
  {
    icon: HiOutlineReceiptPercent,
    title: 'Transparent Pricing',
    description:
      'See every component — product, shipping, service fee, exchange rate — in GH₵ before you commit. No surprises after checkout.',
  },
  {
    icon: HiOutlineGlobeAlt,
    title: 'Global Fulfillment',
    description:
      'We buy from USA, UK, and China warehouses and consolidate shipments through reliable carriers to your door.',
  },
  {
    icon: HiOutlineSignal,
    title: 'Live Tracking',
    description:
      'Follow every order from purchase to delivery. Get email and WhatsApp updates at each milestone — no chasing.',
  },
  {
    icon: HiOutlineShieldCheck,
    title: 'Pay Locally. Safely.',
    description:
      'Pay with MTN, Vodafone, AirtelTigo, or card in Ghana Cedis. Your funds are held securely until your item is sourced — no risk, no stress.',
  },
];

const stagger: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08, delayChildren: 0.05 } },
};

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0, transition: { duration: 0.7, ease: [0.16, 1, 0.3, 1] } },
};

function BannerFeatureCard({ feature }: { feature: Feature }) {
  const Icon = feature.icon;
  return (
    <motion.li
      variants={fadeUp}
      className="relative overflow-hidden rounded-2xl sm:col-span-2 lg:col-span-4 min-h-52"
    >
      <Image
        src="/images/warehouse.jpg"
        alt=""
        fill
        sizes="(max-width: 1280px) 100vw, 1200px"
        className="object-cover object-center"
      />
      <div className="absolute inset-0 bg-linear-to-r from-stone-900/80 via-stone-900/60 to-stone-900/20" />
      <div className="relative z-10 flex flex-col justify-end p-7 sm:p-9 h-full min-h-52">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/20 bg-white/10 backdrop-blur-sm mb-4">
          <Icon className="h-5 w-5 text-white" aria-hidden="true" />
        </div>
        <h3 className="text-xl font-bold text-white sm:text-2xl">{feature.title}</h3>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-white/70 sm:text-base">
          {feature.description}
        </p>
      </div>
    </motion.li>
  );
}

export default function LandingFeaturesSection() {
  return (
    <section className="relative overflow-hidden bg-white py-28 sm:py-32 lg:py-36">
      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <motion.div
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.4 }}
          variants={stagger}
          className="mx-auto max-w-2xl text-center"
        >
          <motion.span
            variants={fadeUp}
            className="inline-flex items-center gap-2 rounded-full border border-stone-200 bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-stone-500"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-rose-500" aria-hidden="true" />
            Why Tomame
          </motion.span>
          <motion.h2
            variants={fadeUp}
            className="mt-5 text-3xl font-bold tracking-tight text-stone-900 sm:text-4xl lg:text-5xl"
          >
            Everything handled for you
          </motion.h2>
          <motion.p
            variants={fadeUp}
            className="mt-4 text-base leading-relaxed text-stone-500 sm:text-lg"
          >
            One workflow replaces the spreadsheets, the forex stress, and the 3am
            order-tracking spirals.
          </motion.p>
        </motion.div>

        {/* Feature grid */}
        <motion.ul
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.1 }}
          variants={stagger}
          className="mt-16 grid grid-cols-1 gap-5 sm:grid-cols-2 sm:gap-6 lg:grid-cols-4"
        >
          {/* Banner card — full width, image background */}
          {FEATURES[0] && <BannerFeatureCard feature={FEATURES[0]} />}

          {/* Remaining 4 feature cards */}
          {FEATURES.slice(1).map((feature) => (
            <motion.li
              key={feature.title}
              variants={fadeUp}
              className="group relative overflow-hidden rounded-2xl border border-stone-200 bg-white p-6 transition-all duration-300 hover:-translate-y-0.5 hover:border-stone-300 hover:shadow-[0_12px_32px_-12px_rgba(0,0,0,0.12)] sm:p-7"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-stone-200 bg-stone-50 transition-colors group-hover:border-rose-200 group-hover:bg-rose-50">
                <feature.icon className="h-5 w-5 text-stone-600 transition-colors group-hover:text-rose-500" aria-hidden="true" />
              </div>

              <h3 className="mt-5 text-base font-bold text-stone-900">
                {feature.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-stone-500">
                {feature.description}
              </p>
            </motion.li>
          ))}
        </motion.ul>
      </div>
    </section>
  );
}
