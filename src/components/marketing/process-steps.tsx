'use client';

import { motion, type Variants } from 'motion/react';
import type { IconType } from 'react-icons';
import {
  HiOutlineCheckBadge,
  HiOutlineCreditCard,
  HiOutlineLink,
  HiOutlineReceiptPercent,
} from 'react-icons/hi2';

type Step = {
  num: string;
  icon: IconType;
  title: string;
  description: string;
};

const STEPS: Step[] = [
  {
    num: '01',
    icon: HiOutlineLink,
    title: 'Paste a link',
    description: 'Any Amazon, ASOS, Alibaba, or eBay product link.',
  },
  {
    num: '02',
    icon: HiOutlineReceiptPercent,
    title: 'Review pricing',
    description: 'See full cost in GH₵: product + shipping + fees. No surprises.',
  },
  {
    num: '03',
    icon: HiOutlineCreditCard,
    title: 'Pay locally',
    description: 'MTN, Vodafone, AirtelTigo or card. Processed in Ghana.',
  },
  {
    num: '04',
    icon: HiOutlineCheckBadge,
    title: 'Receive delivery',
    description: 'Track your order in real-time. Avg 2–4 weeks.',
  },
];

const stagger: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.12, delayChildren: 0.05 } },
};

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0, transition: { duration: 0.7, ease: [0.16, 1, 0.3, 1] } },
};

export default function ProcessSteps() {
  return (
    <section
      id="how-it-works"
      className="relative overflow-hidden bg-stone-50 py-28 sm:py-32 lg:py-36"
    >
      {/* Fine grid texture */}
      {/* <div
        className="pointer-events-none absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage:
            'linear-gradient(rgba(0,0,0,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,0.04) 1px, transparent 1px)',
          backgroundSize: '32px 32px',
        }}
        aria-hidden="true"
      /> */}

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <motion.div
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.4 }}
          variants={stagger}
          className="mx-auto flex max-w-2xl flex-col items-center text-center"
        >
          <motion.span
            variants={fadeUp}
            className="inline-flex items-center gap-2 rounded-full border border-stone-200 bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-stone-500"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-rose-500" aria-hidden="true" />
            How it works
          </motion.span>
          <motion.h2
            variants={fadeUp}
            className="mt-5 text-3xl font-bold tracking-tight text-stone-900 sm:text-4xl lg:text-5xl"
          >
            Four steps.<br />
            {/* <span className="font-normal italic text-stone-400">That&apos;s all it takes.</span> */}
          </motion.h2>
          <motion.p
            variants={fadeUp}
            className="mt-4 text-base leading-relaxed text-stone-500 sm:text-lg"
          >
            Just Four steps. No friction. No hidden costs.
          </motion.p>
        </motion.div>

        {/* Steps */}
        <div className="relative mt-16 sm:mt-20 lg:mt-24">
          <motion.ol
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, amount: 0.15 }}
            variants={stagger}
            className="relative grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4"
          >
            {STEPS.map((step) => (
              <motion.li key={step.num} variants={fadeUp} className="group relative">
                {/* Gradient border ring (rotating, visible on hover) */}
                <div
                  className="absolute inset-0 overflow-hidden rounded-2xl opacity-0 transition-opacity duration-500 group-hover:opacity-100"
                  aria-hidden="true"
                >
                  <div
                    className="absolute -inset-full origin-centers"
                    style={{
                      background:
                        'conic-gradient(from 0deg, transparent, #f43f5e 15%, #fb923c 30%, #fbbf24 45%, transparent 60%)',
                      animation: 'spin 3s linear infinite',
                    }}
                  />
                </div>
                {/* Static border (visible when not hovering) */}
                <div
                  className="absolute inset-0 rounded-2xl border border-stone-200 transition-opacity duration-300 group-hover:opacity-0"
                  aria-hidden="true"
                />

                {/* Card body */}
                <div className="relative m-px overflow-hidden rounded-2xl bg-white p-6 transition-all duration-300 group-hover:-translate-y-0.5 group-hover:shadow-[0_16px_40px_-8px_rgba(251,113,133,0.25)] sm:p-7">
                  {/* Glow blob */}
                  <div
                    className="pointer-events-none absolute -top-10 left-1/2 h-40 w-40 -translate-x-1/2 rounded-full bg-rose-300/30 opacity-0 blur-3xl transition-opacity duration-500 group-hover:opacity-100"
                    aria-hidden="true"
                  />

                  {/* Large decorative step number */}
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute -top-4 -right-3 select-none text-[120px] font-black leading-none text-stone-100"
                  >
                    {parseInt(step.num, 10)}
                  </span>

                  <div className="relative">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-stone-200 bg-stone-50 transition-colors group-hover:border-rose-200 group-hover:bg-rose-50">
                      <step.icon
                        className="h-5 w-5 text-stone-600 transition-colors group-hover:text-rose-500"
                        aria-hidden="true"
                      />
                    </div>

                    <p className="mt-5 text-[11px] font-bold uppercase tracking-[0.18em] text-stone-400">
                      Step {step.num}
                    </p>
                    <h3 className="mt-2 text-lg font-bold text-stone-900">
                      {step.title}
                    </h3>
                    <p className="mt-2 text-sm leading-relaxed text-stone-500">
                      {step.description}
                    </p>
                  </div>
                </div>
              </motion.li>
            ))}
          </motion.ol>
        </div>
      </div>
    </section>
  );
}

