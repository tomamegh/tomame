'use client';

import { useState } from 'react';
import Link from 'next/link';
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

function HeroSection() {
  return (
    <section className="relative overflow-hidden bg-stone-950 text-white min-h-screen flex items-center">
      {/* Subtle dot-grid */}
      <div
        className="absolute inset-0 opacity-[0.035]"
        style={{
          backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.8) 1px, transparent 1px)',
          backgroundSize: '32px 32px',
        }}
      />

      {/* Ambient orbs — animate-orb keeps them drifting */}
      <div className="animate-orb absolute -top-32 -left-20 w-[520px] h-[520px] rounded-full bg-rose-500/18 blur-[130px] pointer-events-none" />
      <div className="animate-orb absolute -bottom-40 -right-20 w-[440px] h-[440px] rounded-full bg-amber-500/14 blur-[110px] pointer-events-none" style={{ animationDelay: '4s', animationDuration: '15s' }} />

      <div className="relative z-10 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-28 sm:py-36 lg:py-0 lg:min-h-screen lg:flex lg:items-center">
        <div className="w-full grid grid-cols-1 lg:grid-cols-2 gap-16 lg:gap-20 items-center">

          {/* ── Left: copy ── */}
          <div className="flex flex-col items-start gap-6">

            {/* Badge */}
            <div className="hero-badge inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-white/10 bg-white/5 text-xs text-white/50">
              <span>🇬🇭</span>
              <span>Built for Ghana</span>
              <span className="w-px h-3 bg-white/15" />
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-emerald-400 font-medium">Live</span>
            </div>

            {/* Headline */}
            <h1 className="hero-h1 text-[2.6rem] sm:text-6xl lg:text-7xl font-extrabold tracking-tight leading-[1.06]">
              Shop the World.
              <br />
              <span className="bg-linear-to-r from-rose-400 via-orange-400 to-amber-400 bg-clip-text text-transparent">
                Pay in Ghana.
              </span>
            </h1>

            {/* Subtext */}
            <p className="hero-sub text-white/45 text-base sm:text-lg leading-relaxed max-w-md">
              Paste a product link from anywhere — Amazon, ASOS, Alibaba. We buy it, ship it, deliver it. You pay with Mobile Money. No forex, no hassle.
            </p>

            {/* CTAs */}
            <div className="hero-ctas flex flex-wrap gap-3">
              <Link href="/auth/signup">
                <Button variant="primary" size="lg">Start for Free</Button>
              </Link>
              <Link href="/pricing">
                <button className="px-6 py-3 text-sm font-semibold rounded-xl border border-white/12 text-white/70 hover:border-white/25 hover:text-white transition-all duration-300 cursor-pointer">
                  See Pricing
                </button>
              </Link>
            </div>

            {/* Trust micro-row */}
            <div className="hero-trust flex items-center gap-4 text-[11px] text-white/30">
              <span>Mobile Money</span>
              <span className="w-1 h-1 rounded-full bg-white/20" />
              <span>USA · UK · China</span>
              <span className="w-1 h-1 rounded-full bg-white/20" />
              <span>Full price transparency</span>
            </div>
          </div>

          {/* ── Right: floating order cards ── */}
          <div className="hero-mockup relative w-full max-w-sm mx-auto lg:mx-0 lg:ml-auto h-[420px] sm:h-[460px]">

            {/* Soft glow centre */}
            <div className="absolute inset-0 m-auto w-48 h-48 bg-rose-500/10 rounded-full blur-3xl" />

            {/* Card 1 — top-left, floats slowest */}
            <div className="animate-float absolute top-0 left-0 right-4 sm:right-8 rounded-2xl border border-white/8 bg-white/5 backdrop-blur-md p-4 flex items-center gap-3.5 shadow-[0_8px_32px_-8px_rgba(0,0,0,0.5)]">
              <div className="w-10 h-10 rounded-xl bg-blue-500/15 border border-blue-500/20 flex items-center justify-center text-xl shrink-0">👟</div>
              <div className="flex-1 min-w-0">
                <p className="text-white/80 text-xs font-semibold truncate">Nike Air Max 270</p>
                <p className="text-white/35 text-[10px] mt-0.5">🇺🇸 Amazon US · GH₵ 1,240</p>
              </div>
              <span className="shrink-0 px-2.5 py-1 rounded-full bg-amber-500/15 border border-amber-500/20 text-amber-400 text-[10px] font-semibold">
                In Transit
              </span>
            </div>

            {/* Card 2 — middle, floats with offset */}
            <div className="animate-float-alt absolute top-[38%] left-4 sm:left-8 right-0 rounded-2xl border border-white/8 bg-white/5 backdrop-blur-md p-4 flex items-center gap-3.5 shadow-[0_8px_32px_-8px_rgba(0,0,0,0.5)]" style={{ animationDelay: '1.2s' }}>
              <div className="w-10 h-10 rounded-xl bg-purple-500/15 border border-purple-500/20 flex items-center justify-center text-xl shrink-0">💄</div>
              <div className="flex-1 min-w-0">
                <p className="text-white/80 text-xs font-semibold truncate">Charlotte Tilbury Kit</p>
                <p className="text-white/35 text-[10px] mt-0.5">🇬🇧 ASOS UK · GH₵ 890</p>
              </div>
              <span className="shrink-0 px-2.5 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/20 text-emerald-400 text-[10px] font-semibold">
                Delivered ✓
              </span>
            </div>

            {/* Card 3 — bottom, floats fastest */}
            <div className="animate-float absolute bottom-0 left-2 right-6 sm:right-12 rounded-2xl border border-white/8 bg-white/5 backdrop-blur-md p-4 flex items-center gap-3.5 shadow-[0_8px_32px_-8px_rgba(0,0,0,0.5)]" style={{ animationDelay: '2.5s', animationDuration: '4s' }}>
              <div className="w-10 h-10 rounded-xl bg-orange-500/15 border border-orange-500/20 flex items-center justify-center text-xl shrink-0">📱</div>
              <div className="flex-1 min-w-0">
                <p className="text-white/80 text-xs font-semibold truncate">iPhone 15 Pro</p>
                <p className="text-white/35 text-[10px] mt-0.5">🇨🇳 Apple CN · GH₵ 9,450</p>
              </div>
              <span className="shrink-0 px-2.5 py-1 rounded-full bg-sky-500/15 border border-sky-500/20 text-sky-400 text-[10px] font-semibold">
                Processing
              </span>
            </div>

            {/* Floating chip — payment confirmed */}
            <div className="animate-float-alt absolute -bottom-4 -right-2 sm:-right-6 flex items-center gap-2 bg-stone-900/90 border border-emerald-500/20 rounded-full px-3.5 py-2 shadow-xl backdrop-blur-sm" style={{ animationDelay: '0.8s' }}>
              <span className="w-5 h-5 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-400 text-[9px] font-bold">✓</span>
              <span className="text-emerald-400/80 text-[11px] font-medium">Payment confirmed</span>
            </div>

            {/* Floating chip — shipped */}
            <div className="animate-float absolute -top-4 -right-2 sm:-right-4 flex items-center gap-2 bg-stone-900/90 border border-white/10 rounded-full px-3.5 py-2 shadow-xl backdrop-blur-sm" style={{ animationDelay: '2s' }}>
              <span className="text-sm">📦</span>
              <span className="text-white/60 text-[11px] font-medium">Order shipped</span>
            </div>

          </div>
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
