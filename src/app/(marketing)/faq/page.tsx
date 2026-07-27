'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { motion, type Variants } from 'motion/react';
import { ArrowRight, MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FAQAccordion, type FAQItem } from '@/components/marketing/faq-accordion';

type Category = {
  slug: string;
  label: string;
  questions: FAQItem[];
};

const CATEGORIES: Category[] = [
  {
    slug: 'getting-started',
    label: 'Getting Started',
    questions: [
      {
        q: 'How do I get started?',
        a: 'Sign up for free, verify your email, and paste your first product link. No upfront fees.',
      },
      {
        q: 'Which platforms can I shop from?',
        a: 'Amazon, ASOS, Alibaba, eBay, Apple Store, Walmart, Target, SHEIN, Zara, H&M, Nike, and 100+ global retailers.',
      },
      {
        q: 'Is there a mobile app?',
        a: 'Our web app is fully responsive and works great on mobile. A native app is on the roadmap.',
      },
    ],
  },
  {
    slug: 'pricing-and-payments',
    label: 'Pricing & Payments',
    questions: [
      {
        q: 'How is the total price calculated?',
        a: 'We show the item price (in GH₵), international shipping, our service fee, and any applicable import taxes — all before you pay.',
      },
      {
        q: 'What payment methods do you accept?',
        a: 'MTN Mobile Money, Telecel Cash, and AirtelTigo Money. All processed locally through Hubtel.',
      },
      {
        q: 'Can I get a refund?',
        a: 'Yes. If we cannot source your item after payment, you receive a 100% refund within 24 hours — no questions asked.',
      },
    ],
  },
  {
    slug: 'orders-and-delivery',
    label: 'Orders & Delivery',
    questions: [
      {
        q: 'How long does delivery take?',
        a: 'Most orders arrive within 2–4 weeks. Air freight options are available for urgent items.',
      },
      {
        q: 'Can I track my order?',
        a: "Yes — real-time tracking is available for every order. You'll get updates at each milestone: processing, purchased, shipped, in transit, delivered.",
      },
      {
        q: 'What if my package is lost?',
        a: 'All orders are covered. If a package is lost or damaged in transit, we investigate immediately and resolve it within 5–7 business days.',
      },
    ],
  },
  {
    slug: 'technical',
    label: 'Technical',
    questions: [
      {
        q: 'Is my data secure?',
        a: 'Yes. We use industry-standard encryption and never share your data with third parties.',
      },
      {
        q: 'Do you offer an API?',
        a: 'API access is available for high-volume users. Contact us to discuss your requirements.',
      },
      {
        q: 'What if extraction fails on a product link?',
        a: "We have multiple fallback methods. If we still cannot extract data, we'll notify you and issue a full refund of any service fees.",
      },
    ],
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

export default function FAQPage() {
  const [activeSlug, setActiveSlug] = useState<string>(CATEGORIES[0]!.slug);
  const sectionsRef = useRef<Map<string, HTMLElement>>(new Map());

  // Observe each category section to highlight the active sidebar link.
  useEffect(() => {
    const elements = Array.from(sectionsRef.current.values());
    if (elements.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        // Pick the entry closest to the top of the viewport that is intersecting.
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);

        const first = visible[0];
        if (first) {
          const slug = first.target.getAttribute('id');
          if (slug) setActiveSlug(slug);
        }
      },
      {
        // Account for sticky header — start "active" when section enters the top quarter.
        rootMargin: '-20% 0px -55% 0px',
        threshold: [0, 0.25, 0.5, 1],
      },
    );

    elements.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  const registerSection = (slug: string) => (el: HTMLElement | null) => {
    if (el) sectionsRef.current.set(slug, el);
    else sectionsRef.current.delete(slug);
  };

  const handleNavClick = (slug: string) => (event: React.MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    const target = sectionsRef.current.get(slug);
    if (target) {
      const top = target.getBoundingClientRect().top + window.scrollY - 96;
      window.scrollTo({ top, behavior: 'smooth' });
      setActiveSlug(slug);
    }
  };

  return (
    <>
      {/* Dark editorial header */}
      <section className="relative overflow-hidden bg-stone-950 py-20 sm:py-24 shadow-[0_4px_24px_rgba(0,0,0,0.18)]">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage:
              'linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)',
            backgroundSize: '40px 40px',
          }}
          aria-hidden="true"
        />

        <div className="relative mx-auto max-w-3xl px-4 text-center sm:px-6 lg:px-8">
          <motion.div initial="hidden" animate="show" variants={stagger}>
            <motion.span
              variants={fadeUp}
              className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-white/70 backdrop-blur-md"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-rose-400" aria-hidden="true" />
              Help center
            </motion.span>
            <motion.h1
              variants={fadeUp}
              className="mt-6 text-4xl font-bold tracking-tight text-white sm:text-5xl lg:text-6xl"
            >
              Frequently asked questions
            </motion.h1>
            <motion.p
              variants={fadeUp}
              className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-white/65 sm:text-lg"
            >
              Quick answers to what most customers ask.
            </motion.p>
          </motion.div>
        </div>
      </section>

      {/* FAQ content */}
      <section className="bg-white py-20 sm:py-24">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 gap-12 lg:grid-cols-12 lg:gap-16">
            {/* Sticky sidebar nav (desktop) */}
            <aside className="lg:col-span-3">
              <div className="lg:sticky lg:top-24">
                <p className="mb-4 text-xs font-bold uppercase tracking-[0.2em] text-stone-400">
                  Categories
                </p>
                <nav aria-label="FAQ categories">
                  <ul className="hidden flex-col gap-3 border-l border-stone-200 lg:flex">
                    {CATEGORIES.map((cat) => {
                      const isActive = activeSlug === cat.slug;
                      return (
                        <li key={cat.slug}>
                          <a
                            href={`#${cat.slug}`}
                            onClick={handleNavClick(cat.slug)}
                            className={`-ml-px block border-l-2 py-1 pl-4 text-sm transition-colors duration-200 ${
                              isActive
                                ? 'border-rose-500 font-semibold text-stone-900'
                                : 'border-transparent font-medium text-stone-500 hover:border-stone-300 hover:text-stone-900'
                            }`}
                          >
                            {cat.label}
                          </a>
                        </li>
                      );
                    })}
                  </ul>

                  {/* Mobile horizontal scroll nav */}
                  <ul className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 lg:hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                    {CATEGORIES.map((cat) => {
                      const isActive = activeSlug === cat.slug;
                      return (
                        <li key={cat.slug} className="shrink-0">
                          <a
                            href={`#${cat.slug}`}
                            onClick={handleNavClick(cat.slug)}
                            className={`inline-flex h-8 items-center rounded-full border px-3 text-xs font-semibold transition-colors duration-200 ${
                              isActive
                                ? 'border-rose-200 bg-rose-50 text-rose-600'
                                : 'border-stone-200 bg-white text-stone-600 hover:border-stone-300'
                            }`}
                          >
                            {cat.label}
                          </a>
                        </li>
                      );
                    })}
                  </ul>
                </nav>
              </div>
            </aside>

            {/* Accordion sections */}
            <div className="space-y-14 lg:col-span-9 lg:space-y-16">
              {CATEGORIES.map((cat) => (
                <section
                  key={cat.slug}
                  id={cat.slug}
                  ref={registerSection(cat.slug)}
                  className="scroll-mt-24"
                  aria-labelledby={`${cat.slug}-heading`}
                >
                  <div className="mb-6 flex items-center justify-between gap-4 border-b border-stone-200 pb-4">
                    <h2
                      id={`${cat.slug}-heading`}
                      className="text-lg font-bold tracking-tight text-stone-900 sm:text-xl"
                    >
                      {cat.label}
                    </h2>
                    <span className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-400">
                      {cat.questions.length.toString().padStart(2, '0')} questions
                    </span>
                  </div>
                  <FAQAccordion items={cat.questions} idPrefix={`faq-${cat.slug}`} />
                </section>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Contact CTA */}
      <section className="bg-stone-50 py-16 sm:py-20">
        <div className="mx-auto max-w-3xl px-4 text-center sm:px-6 lg:px-8">
          <motion.div
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, amount: 0.4 }}
            variants={stagger}
            className="relative overflow-hidden rounded-3xl border border-stone-900/5 bg-stone-950 px-6 py-12 sm:px-10 sm:py-14"
          >
            <div
              className="pointer-events-none absolute inset-0 opacity-[0.04]"
              style={{
                backgroundImage:
                  'linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)',
                backgroundSize: '40px 40px',
              }}
              aria-hidden="true"
            />

            <div className="relative">
              <motion.h2
                variants={fadeUp}
                className="text-2xl font-bold tracking-tight text-white sm:text-3xl"
              >
                Still have questions?
              </motion.h2>
              <motion.p
                variants={fadeUp}
                className="mx-auto mt-3 max-w-lg text-sm leading-relaxed text-white/65 sm:text-base"
              >
                Our team in Accra responds quickly on email and WhatsApp.
              </motion.p>
              <motion.div
                variants={fadeUp}
                className="mt-7 flex flex-wrap items-center justify-center gap-3 sm:gap-4"
              >
                <Link href="/contact">
                  <Button variant="primary" size="lg" className="h-11 px-6 text-sm sm:text-base">
                    Contact us
                    <ArrowRight className="ml-1 h-4 w-4" />
                  </Button>
                </Link>
                <Link
                  href="https://wa.me/233000000000"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex h-11 items-center gap-2 rounded-full border border-white/15 bg-white/5 px-5 text-sm font-semibold text-white/90 backdrop-blur-md transition-colors hover:bg-white/10 hover:text-white sm:text-base"
                >
                  <MessageCircle className="h-4 w-4" />
                  WhatsApp
                </Link>
              </motion.div>
            </div>
          </motion.div>
        </div>
      </section>
    </>
  );
}
