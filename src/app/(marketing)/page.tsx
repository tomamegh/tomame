'use client';

import { useState } from 'react';
import Link from 'next/link';
import { motion } from 'motion/react';
import type { Variants } from 'motion/react';
import { Button } from '@/components/ui/button';

/* ─── data ──────────────────────────────────────────────── */

const FEATURES = [
  {
    icon: '🔗',
    title: 'Intelligent Extraction',
    description: 'Paste any product link and our engine extracts titles, images, prices, and specs automatically.',
  },
  {
    icon: '📦',
    title: 'Transparent Pricing',
    description: 'See a full cost breakdown — product, shipping, freight, taxes, and fees — before you commit.',
  },
  {
    icon: '🚀',
    title: 'Global Fulfillment',
    description: 'We source from 50+ countries with competitive carrier rates and reliable delivery timelines.',
  },
  {
    icon: '📊',
    title: 'Live Order Tracking',
    description: 'Follow every order from purchase to doorstep with real-time status updates and notifications.',
  },
];

const VALUE_PROPS = [
  {
    badge: 'Automate',
    title: 'Stop wasting hours on manual sourcing',
    description:
      'Tomame replaces spreadsheets, back-and-forth emails, and guesswork with a single workflow. Paste a link and let us handle the rest.',
    bullets: [
      'Auto-extract product data from 100+ platforms',
      'Instant shipping & tax calculations',
      'One-click order placement',
    ],
  },
  {
    badge: 'Scale',
    title: 'Built for teams that move fast',
    description:
      'Whether you source 5 products or 5,000, Tomame scales with you. Bulk discounts, API access, and dedicated support keep your pipeline flowing.',
    bullets: [
      'Unlimited product links on Pro plans',
      'RESTful API for programmatic orders',
      'Priority support & dedicated account managers',
    ],
  },
];

const TESTIMONIALS = [
  {
    quote: 'Tomame cut our sourcing time by 80%. The transparent pricing alone is worth it — no more surprise fees.',
    name: 'Sarah Chen',
    role: 'Founder, Lumina Commerce',
    initials: 'SC',
  },
  {
    quote: 'We switched from three different tools to Tomame. The dashboard and real-time tracking are game-changers.',
    name: 'Michael Torres',
    role: 'Head of Ops, ShipFast',
    initials: 'MT',
  },
  {
    quote: 'The API integration took us 30 minutes. Now our entire catalog syncs automatically. Incredible product.',
    name: 'Emma Wilson',
    role: 'CTO, NovaBridge',
    initials: 'EW',
  },
];

const BLOG_POSTS = [
  {
    title: 'How to reduce sourcing costs by 40%',
    description: 'A step-by-step guide to optimizing your global supply chain with automated product sourcing.',
    tag: 'Guide',
  },
  {
    title: 'The hidden costs of international shipping',
    description: 'Understanding freight surcharges, customs duties, and how to calculate the true cost of an order.',
    tag: 'Insights',
  },
];

const FAQS = [
  {
    q: 'What ecommerce platforms do you support?',
    a: 'We support Amazon, eBay, Apple, Walmart, Target, Etsy, Alibaba, and 100+ other ecommerce sites globally.',
  },
  {
    q: 'How is shipping calculated?',
    a: 'Shipping is calculated in real-time based on package weight, dimensions, and destination country using actual carrier rates.',
  },
  {
    q: 'Can I get a refund if extraction fails?',
    a: 'Yes. If we cannot extract a product\'s data, we refund 100% of service fees within 24 hours. No questions asked.',
  },
  {
    q: 'Do you offer an API?',
    a: 'Professional and Enterprise plans include full REST API access for programmatic order placement, tracking, and catalog sync.',
  },
  {
    q: 'How long does delivery take?',
    a: 'Delivery typically takes 2–4 weeks depending on the destination and shipping method. Express options are available.',
  },
];

/* ─── page ──────────────────────────────────────────────── */

export default function HomePage() {
  return (
    <>
      <HeroSection />
      <FeaturesSection />
      <ValueSection />
      <TestimonialsSection />
      <BlogSection />
      <FAQSection />
      <CTASection />
    </>
  );
}

/* ─── hero ──────────────────────────────────────────────── */

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

function HeroSection() {
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
      <div className="absolute top-0 left-0 size-150 bg-rose-100/60 rounded-full blur-[120px] pointer-events-none -translate-x-1/3 -translate-y-1/3" />
      <div className="absolute bottom-0 right-0 size-125 bg-amber-100/50 rounded-full blur-[100px] pointer-events-none translate-x-1/4 translate-y-1/4" />

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
            <div className="absolute inset-0 m-auto size-56 bg-rose-200/40 rounded-full blur-3xl pointer-events-none" />

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

/* ─── features ─────────────────────────────────────────── */

function FeaturesSection() {
  return (
    <section className="py-20 sm:py-28 lg:py-32 bg-white">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12 sm:mb-16">
          <p className="text-sm font-semibold text-rose-500 mb-3 tracking-wide uppercase">Features</p>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-stone-900 mb-4">
            Everything you need to source smarter
          </h2>
          <p className="text-base sm:text-lg text-stone-500 max-w-2xl mx-auto">
            A complete toolkit that replaces scattered workflows with one streamlined platform.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 sm:gap-6">
          {FEATURES.map((f, i) => (
            <div
              key={i}
              className="group relative rounded-2xl border border-stone-200/60 bg-white p-6 sm:p-7 transition-all duration-500 hover:shadow-[0_8px_40px_-6px_rgba(120,113,108,0.12)] hover:-translate-y-1"
            >
              <div className="w-12 h-12 rounded-xl bg-linear-to-br from-rose-500/10 to-amber-500/10 flex items-center justify-center text-2xl mb-5">
                {f.icon}
              </div>
              <h3 className="font-bold text-lg text-stone-900 mb-2">{f.title}</h3>
              <p className="text-stone-500 text-sm leading-relaxed">{f.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─── value props (alternating) ────────────────────────── */

function ValueSection() {
  return (
    <section className="py-16 sm:py-24 lg:py-32 bg-stone-50">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 space-y-20 sm:space-y-28 lg:space-y-32">
        {VALUE_PROPS.map((vp, i) => {
          const reversed = i % 2 !== 0;
          return (
            <div
              key={i}
              className={`flex flex-col ${reversed ? 'lg:flex-row-reverse' : 'lg:flex-row'} gap-10 lg:gap-16 items-center`}
            >
              {/* Text */}
              <div className="flex-1 space-y-6">
                <span className="inline-block px-3 py-1 rounded-full bg-rose-500/10 text-rose-600 text-xs font-semibold tracking-wide uppercase">
                  {vp.badge}
                </span>
                <h2 className="text-3xl sm:text-4xl font-bold text-stone-900 leading-tight">
                  {vp.title}
                </h2>
                <p className="text-stone-500 text-base sm:text-lg leading-relaxed">
                  {vp.description}
                </p>
                <ul className="space-y-3">
                  {vp.bullets.map((b) => (
                    <li key={b} className="flex items-start gap-3">
                      <div className="mt-1 w-5 h-5 rounded-full bg-linear-to-br from-rose-500 to-amber-500 flex items-center justify-center shrink-0">
                        <span className="text-white text-[10px] font-bold">✓</span>
                      </div>
                      <span className="text-stone-600 text-sm sm:text-base">{b}</span>
                    </li>
                  ))}
                </ul>
                <Link href="/auth/signup">
                  <Button variant="primary" size="lg">Get Started</Button>
                </Link>
              </div>

              {/* Illustration card */}
              <div className="flex-1 w-full">
                <div className="rounded-2xl sm:rounded-3xl bg-linear-to-br from-stone-900 to-stone-800 border border-white/10 p-5 sm:p-8 shadow-[0_16px_48px_-8px_rgba(0,0,0,0.2)]">
                  <div className="space-y-4">
                    {i === 0 ? (
                      /* Product extraction mockup */
                      <>
                        <div className="flex items-center gap-3 rounded-xl bg-white/5 border border-white/5 px-4 py-3">
                          <div className="w-8 h-8 rounded-lg bg-rose-500/20 flex items-center justify-center text-sm">🔗</div>
                          <div className="flex-1 h-3 rounded bg-white/10" />
                          <div className="px-3 py-1.5 rounded-lg bg-linear-to-r from-rose-500 to-amber-500 text-white text-[10px] font-bold">Extract</div>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          {['Product Name', 'Price', 'Weight', 'Platform'].map((l) => (
                            <div key={l} className="rounded-xl bg-white/3 border border-white/5 p-3">
                              <p className="text-[10px] text-white/30 mb-1">{l}</p>
                              <div className="h-3 w-3/4 rounded bg-white/10" />
                            </div>
                          ))}
                        </div>
                        <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/20 px-4 py-3 flex items-center gap-2">
                          <span className="text-emerald-400 text-xs">✓</span>
                          <span className="text-emerald-400/80 text-xs">Product data extracted successfully</span>
                        </div>
                      </>
                    ) : (
                      /* Dashboard / scale mockup */
                      <>
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-white/40 text-xs">Orders this month</p>
                          <p className="text-white/80 text-sm font-bold">+24%</p>
                        </div>
                        <div className="h-24 sm:h-32 flex items-end gap-1.5">
                          {[30, 50, 40, 70, 55, 85, 65, 90, 75, 95, 80, 100].map((h, j) => (
                            <div
                              key={j}
                              className="flex-1 rounded-t bg-linear-to-t from-rose-500/50 to-amber-500/30"
                              style={{ height: `${h}%` }}
                            />
                          ))}
                        </div>
                        <div className="grid grid-cols-3 gap-3 mt-4">
                          {[
                            { label: 'Active', value: '2,847' },
                            { label: 'Shipped', value: '1,203' },
                            { label: 'Delivered', value: '8,492' },
                          ].map((s) => (
                            <div key={s.label} className="rounded-xl bg-white/3 border border-white/5 p-3 text-center">
                              <p className="text-[10px] text-white/30 mb-1">{s.label}</p>
                              <p className="text-sm font-bold text-white/70">{s.value}</p>
                            </div>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

/* ─── testimonials ─────────────────────────────────────── */

function TestimonialsSection() {
  return (
    <section className="py-20 sm:py-28 lg:py-32 bg-white">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12 sm:mb-16">
          <p className="text-sm font-semibold text-rose-500 mb-3 tracking-wide uppercase">Testimonials</p>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-stone-900 mb-4">
            Loved by teams worldwide
          </h2>
          <p className="text-base sm:text-lg text-stone-500 max-w-2xl mx-auto">
            See how businesses are transforming their sourcing with Tomame.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 sm:gap-6">
          {TESTIMONIALS.map((t) => (
            <div
              key={t.name}
              className="rounded-2xl border border-stone-200/60 bg-white p-6 sm:p-8 flex flex-col justify-between transition-all duration-500 hover:shadow-[0_8px_40px_-6px_rgba(120,113,108,0.12)] hover:-translate-y-1"
            >
              {/* Stars */}
              <div className="mb-4 flex gap-1 text-amber-400 text-sm">
                {'★★★★★'.split('').map((s, i) => <span key={i}>{s}</span>)}
              </div>
              <p className="text-stone-600 leading-relaxed mb-6 flex-1">&ldquo;{t.quote}&rdquo;</p>
              <div className="flex items-center gap-3 pt-4 border-t border-stone-100">
                <div className="w-10 h-10 rounded-full bg-linear-to-br from-rose-500 to-amber-500 flex items-center justify-center text-white text-xs font-bold">
                  {t.initials}
                </div>
                <div>
                  <p className="font-semibold text-stone-900 text-sm">{t.name}</p>
                  <p className="text-stone-400 text-xs">{t.role}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─── blog / insights ──────────────────────────────────── */

function BlogSection() {
  return (
    <section className="py-20 sm:py-28 lg:py-32 bg-stone-50">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12 sm:mb-16">
          <p className="text-sm font-semibold text-rose-500 mb-3 tracking-wide uppercase">Blog</p>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-stone-900 mb-4">
            Insights & Resources
          </h2>
          <p className="text-base sm:text-lg text-stone-500 max-w-2xl mx-auto">
            Stay ahead with the latest tips on global sourcing, logistics, and ecommerce.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 sm:gap-6">
          {BLOG_POSTS.map((post, i) => (
            <div
              key={i}
              className="group relative rounded-2xl sm:rounded-3xl overflow-hidden bg-linear-to-br from-stone-900 to-stone-800 min-h-60 sm:min-h-75 flex flex-col justify-end p-6 sm:p-8 cursor-pointer transition-all duration-500 hover:shadow-[0_16px_48px_-8px_rgba(0,0,0,0.25)] hover:-translate-y-1"
            >
              {/* Decorative linear overlay */}
              <div className="absolute inset-0 bg-linear-to-t from-stone-950/90 via-stone-900/40 to-transparent" />
              {/* Decorative blur orb */}
              <div className={`absolute ${i === 0 ? 'top-4 right-4' : 'top-4 left-4'} w-32 h-32 rounded-full ${i === 0 ? 'bg-rose-500/15' : 'bg-amber-500/15'} blur-[60px]`} />

              <div className="relative z-10">
                <span className="inline-block px-3 py-1 rounded-full bg-white/10 text-white/70 text-xs font-semibold mb-4">
                  {post.tag}
                </span>
                <h3 className="text-xl sm:text-2xl font-bold text-white mb-2 group-hover:text-rose-200 transition-colors">
                  {post.title}
                </h3>
                <p className="text-white/50 text-sm sm:text-base leading-relaxed">
                  {post.description}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─── faq ──────────────────────────────────────────────── */

function FAQSection() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <section className="py-20 sm:py-28 lg:py-32 bg-white">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12 sm:mb-16">
          <p className="text-sm font-semibold text-rose-500 mb-3 tracking-wide uppercase">FAQ</p>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-stone-900 mb-4">
            Frequently asked questions
          </h2>
          <p className="text-base sm:text-lg text-stone-500 max-w-xl mx-auto">
            Quick answers to common questions about the platform.
          </p>
        </div>

        <div className="space-y-3">
          {FAQS.map((faq, i) => {
            const isOpen = openIndex === i;
            return (
              <div
                key={i}
                className="rounded-2xl border border-stone-200/60 bg-white overflow-hidden transition-all duration-300 hover:border-stone-300/60"
              >
                <button
                  onClick={() => setOpenIndex(isOpen ? null : i)}
                  className="w-full flex justify-between items-center p-5 sm:p-6 text-left cursor-pointer"
                >
                  <span className="font-semibold text-stone-900 text-sm sm:text-base pr-4">{faq.q}</span>
                  <span
                    className={`text-stone-400 text-xl transition-transform duration-300 shrink-0 ${
                      isOpen ? 'rotate-45' : ''
                    }`}
                  >
                    +
                  </span>
                </button>
                {isOpen && (
                  <div className="px-5 sm:px-6 pb-5 sm:pb-6 fade-in">
                    <p className="text-stone-500 text-sm sm:text-base leading-relaxed">{faq.a}</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/* ─── cta ──────────────────────────────────────────────── */

function CTASection() {
  return (
    <section className='py-20 sm:py-28 lg:py-32'>
      <div className="max-w-7xl mx-auto relative overflow-hidden bg-linear-to-b from-stone-950 via-stone-900 to-stone-950 text-white py-20 sm:py-20 rounded-3xl">
      {/* Decorative elements */}
      <div className="absolute top-[10%] left-[5%] size-120 rounded-full bg-rose-500/10 blur-[120px]" />
      <div className="absolute bottom-[10%] right-[5%] size-100 rounded-full bg-amber-500/8 blur-[100px]" />

      {/* Floating avatar circles (Genesis-style) */}
      <div className="absolute top-[15%] left-[8%] w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-white/5 border border-white/10 backdrop-blur-sm flex items-center justify-center text-white/40 text-xs font-bold lg:flex">SC</div>
      <div className="absolute top-[20%] right-[12%] w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-white/5 border border-white/10 backdrop-blur-sm flex items-center justify-center text-white/40 text-xs font-bold lg:flex">MT</div>
      <div className="absolute bottom-[20%] left-[15%] w-10 h-10 rounded-full bg-white/5 border border-white/10 backdrop-blur-sm flex items-center justify-center text-white/40 text-xs font-bold lg:flex">EW</div>
      <div className="absolute bottom-[25%] right-[8%] w-14 h-14 rounded-full bg-white/5 border border-white/10 backdrop-blur-sm flex items-center justify-center text-white/40 text-xs font-bold lg:flex">JD</div>

      {/* Concentric rings */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 size-160 rounded-full border border-dashed border-white/4" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-md h-112 rounded-full border border-dashed border-white/6" />

      <div className="relative z-10 max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center space-y-6 sm:space-y-8">
        <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold leading-tight">
          Begin Your Free Trial
          <br />
          <span className="bg-linear-to-r from-rose-400 to-amber-400 bg-clip-text text-transparent">Today</span>
        </h2>
        <p className="text-base sm:text-lg text-white/50 max-w-xl mx-auto leading-relaxed">
          Join thousands of businesses already sourcing smarter. No credit card required — start with 5 free product links.
        </p>
        <div className="flex gap-3 sm:gap-4 justify-center flex-wrap">
          <Link href="/auth/signup">
            <Button variant="primary" size="lg">Get Started Free</Button>
          </Link>
          <Link href="/contact">
            <button className="px-7 py-3 text-base font-semibold rounded-xl border border-white/15 text-white hover:bg-white/5 transition-all duration-300 cursor-pointer">
              Talk to Sales
            </button>
          </Link>
        </div>
      </div>
    </div>
    </section>
  );
}
