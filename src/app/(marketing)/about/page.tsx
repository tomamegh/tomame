'use client';

import Image from 'next/image';
import Link from 'next/link';
import { motion, type Variants } from 'motion/react';
import {
  BlendIcon,
  ZapIcon,
  ShieldCheckIcon,
  ArrowRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';

const GRID_TEXTURE: React.CSSProperties = {
  backgroundImage:
    'linear-gradient(rgba(0,0,0,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,0.04) 1px, transparent 1px)',
  backgroundSize: '32px 32px',
};

const DARK_GRID_TEXTURE: React.CSSProperties = {
  backgroundImage:
    'linear-gradient(rgba(255,255,255,0.6) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.6) 1px, transparent 1px)',
  backgroundSize: '32px 32px',
};

const stagger: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08, delayChildren: 0.05 } },
};

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0, transition: { duration: 0.7, ease: [0.16, 1, 0.3, 1] } },
};

const HERO_STATS = [
  { label: '5,000+ orders delivered' },
  { label: '3 regions sourced' },
  { label: 'Est. 2023' },
  { label: 'Ghana-based team' },
];

const MICRO_STATS = [
  { value: '5,000+', label: 'Orders' },
  { value: '3', label: 'Regions (USA · UK · China)' },
  { value: '14-day', label: 'Average delivery' },
  { value: '100%', label: 'Transparent pricing' },
];

const VALUES = [
  {
    icon: BlendIcon,
    title: 'Transparency',
    description: 'Every fee explained before you pay. No surprises, ever.',
  },
  {
    icon: ZapIcon,
    title: 'Speed',
    description: "Instant quotes. Rapid sourcing. We don't make you wait.",
  },
  {
    icon: ShieldCheckIcon,
    title: 'Trust',
    description: 'Pre-payment only. Your money is safe before we source a single item.',
  },
];


export default function AboutPage() {
  return (
    <main className="bg-white">
      {/* A. Hero Band */}
      <section className="relative min-h-[60vh] w-full overflow-hidden bg-stone-950">
        <Image
          src="/images/warehouse.jpg"
          alt=""
          fill
          priority
          sizes="100vw"
          className="object-cover object-center"
        />
        {/* Directional overlay */}
        <div
          className="absolute inset-0 bg-linear-to-b from-stone-950/80 via-stone-950/55 to-stone-950/80"
          aria-hidden="true"
        />
        {/* Fine grid texture */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.04]"
          style={DARK_GRID_TEXTURE}
          aria-hidden="true"
        />

        <div className="relative z-10 mx-auto flex min-h-[60vh] w-full max-w-6xl flex-col items-center justify-center px-4 py-24 sm:px-6 lg:px-8">
          <motion.div
            initial="hidden"
            animate="show"
            variants={stagger}
            className="flex w-full flex-col items-center text-center"
          >
            <motion.span
              variants={fadeUp}
              className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3.5 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-white/80 backdrop-blur-md"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-rose-400" aria-hidden="true" />
              Our story
            </motion.span>

            <motion.h1
              variants={fadeUp}
              className="mt-6 max-w-3xl text-4xl font-bold tracking-tight text-white sm:text-5xl lg:text-6xl"
            >
              Making global shopping accessible in Ghana
            </motion.h1>

            <motion.p
              variants={fadeUp}
              className="mt-5 max-w-xl text-base leading-relaxed text-white/70 sm:text-lg"
            >
              We bridge the gap between Ghanaian shoppers and the world&apos;s biggest stores —
              with fair pricing, local payments, and reliable delivery.
            </motion.p>

            <motion.div
              variants={fadeUp}
              className="mt-10 flex flex-wrap items-center justify-center gap-2 sm:gap-3"
            >
              {HERO_STATS.map((stat) => (
                <span
                  key={stat.label}
                  className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3.5 py-1.5 text-xs font-medium text-white/80 backdrop-blur-md sm:text-sm"
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-400" aria-hidden="true" />
                  {stat.label}
                </span>
              ))}
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* B. Mission */}
      <section className="relative bg-white py-24 sm:py-28">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.04]"
          style={GRID_TEXTURE}
          aria-hidden="true"
        />
        <div className="relative mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <motion.div
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, amount: 0.3 }}
            variants={stagger}
            className="grid grid-cols-1 items-center gap-12 lg:grid-cols-12 lg:gap-16"
          >
            {/* Text + stats */}
            <motion.div variants={fadeUp} className="space-y-8 lg:col-span-7">
              <div className="border-l-4 border-rose-500 pl-6">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">
                  Mission
                </p>
                <blockquote className="mt-4 text-3xl font-bold leading-tight text-stone-900 sm:text-4xl">
                  We believe everyone in Ghana deserves access to global products at fair,
                  transparent prices.
                </blockquote>
              </div>

              <div className="space-y-5">
                <p className="text-base leading-relaxed text-stone-600 sm:text-lg">
                  Tomame removes friction from global shopping by combining instant price
                  extraction, transparent fees, and reliable last-mile delivery — all paid for
                  with Mobile Money or card in Ghana Cedis.
                </p>
                <p className="text-base leading-relaxed text-stone-600 sm:text-lg">
                  Whether you&apos;re ordering one item or stocking a boutique, we sit between
                  you and the global retailer so you never have to navigate forex, foreign
                  checkout, or international shipping yourself.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {MICRO_STATS.map((stat) => (
                  <div
                    key={stat.label}
                    className="rounded-2xl border border-stone-200 bg-stone-50/60 p-4"
                  >
                    <p className="text-xl font-bold text-stone-900 sm:text-2xl">{stat.value}</p>
                    <p className="mt-1 text-xs text-stone-500 sm:text-sm">{stat.label}</p>
                  </div>
                ))}
              </div>
            </motion.div>

            {/* Photo */}
            <motion.div
              variants={fadeUp}
              className="relative hidden h-120 overflow-hidden rounded-3xl lg:col-span-5 lg:block"
            >
              <Image
                src="/images/mobile-pay.jpg"
                alt="Person shopping on mobile"
                fill
                sizes="(max-width: 1280px) 50vw, 400px"
                className="object-cover object-center"
              />
              <div className="absolute inset-0 bg-linear-to-t from-stone-900/30 to-transparent" />
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* C. Values */}
      <section className="relative overflow-hidden bg-stone-50 py-24 sm:py-28">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.04]"
          style={GRID_TEXTURE}
          aria-hidden="true"
        />

        <div className="relative mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <motion.div
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, amount: 0.3 }}
            variants={stagger}
            className="mx-auto max-w-2xl text-center"
          >
            <motion.span
              variants={fadeUp}
              className="inline-flex items-center gap-2 rounded-full border border-stone-200 bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-stone-500"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-rose-500" aria-hidden="true" />
              Principles
            </motion.span>
            <motion.h2
              variants={fadeUp}
              className="mt-5 text-3xl font-bold tracking-tight text-stone-900 sm:text-4xl lg:text-5xl"
            >
              What we stand for
            </motion.h2>
            <motion.p
              variants={fadeUp}
              className="mt-4 text-base leading-relaxed text-stone-500 sm:text-lg"
            >
              Three principles that shape every decision we make — from how we price orders to
              how we handle a delivery question on WhatsApp.
            </motion.p>
          </motion.div>

          <motion.div
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, amount: 0.2 }}
            variants={stagger}
            className="mt-14 grid grid-cols-1 gap-5 sm:gap-6 md:grid-cols-3"
          >
            {VALUES.map((value) => (
              <motion.article
                key={value.title}
                variants={fadeUp}
                className="group relative overflow-hidden rounded-3xl border border-stone-200 bg-white p-7 transition-all duration-500 hover:-translate-y-1 hover:border-stone-300 hover:shadow-[0_24px_60px_-24px_rgba(120,113,108,0.25)]"
              >
                <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-stone-200 bg-stone-50 text-stone-700 transition-colors duration-500 group-hover:border-rose-200 group-hover:text-rose-500">
                  <value.icon className="h-5 w-5" />
                </div>
                <h3 className="mt-6 text-lg font-bold text-stone-900">{value.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-stone-500">{value.description}</p>
              </motion.article>
            ))}
          </motion.div>
        </div>
      </section>



      {/* D. Story */}
      <section className="relative overflow-hidden py-24 sm:py-32">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.04]"
          style={DARK_GRID_TEXTURE}
          aria-hidden="true"
        />

        <div className="relative mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
          {/* Photo strip */}
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.3 }}
            transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
            className="relative mb-16 h-64 overflow-hidden rounded-3xl sm:h-80"
          >
            <Image
              src="/images/delivery.jpg"
              alt="Package delivery"
              fill
              sizes="(max-width: 1280px) 100vw, 1024px"
              className="object-cover object-center"
            />
            <div className="absolute inset-0 bg-linear-to-r from-stone-900/50 via-stone-900/20 to-stone-900/50" />
          </motion.div>

        <div className="mx-auto max-w-3xl">
          <motion.div
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, amount: 0.3 }}
            variants={stagger}
            className="flex flex-col items-center text-center"
          >
            <motion.span
              variants={fadeUp}
              className="inline-flex items-center gap-2 rounded-full border border-neutral-200 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] backdrop-blur-md"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-rose-400" aria-hidden="true" />
              Origins
            </motion.span>

            <motion.h2
              variants={fadeUp}
              className="mt-5 text-3xl font-bold tracking-tight text-stone-900 sm:text-4xl lg:text-5xl"
            >
              How Tomame started
            </motion.h2>

            <motion.p
              variants={fadeUp}
              className="mt-6 text-base leading-relaxed text-stone-700 sm:text-lg"
            >
              Tomame was founded in 2023 when our team kept hitting the same wall: friends and
              family in Ghana wanted products from Amazon, ASOS, and Alibaba, but had no clean
              way to pay in cedis, no transparent shipping cost, and no one accountable when an
              order disappeared.
            </motion.p>

            <motion.p
              variants={fadeUp}
              className="mt-5 text-base leading-relaxed text-stone-700 sm:text-lg"
            >
              We built Tomame to be that accountable layer. Paste a link, see a fair price in
              cedis, pay with Mobile Money, and let our team handle the rest — from purchase to
              your doorstep.
            </motion.p>

            <motion.div
              variants={fadeUp}
              className="mt-12 h-px w-24 bg-linear-to-r from-transparent via-rose-500 to-transparent"
              aria-hidden="true"
            />

            <motion.div variants={fadeUp} className="mt-10">
              <Link href="/auth/signup">
                <Button variant="primary" size="lg" className="h-12 px-7 text-base">
                  Start shopping today
                  <ArrowRight className="ml-1 h-4 w-4" />
                </Button>
              </Link>
            </motion.div>
          </motion.div>
        </div>
        </div>
      </section>
    </main>
  );
}
