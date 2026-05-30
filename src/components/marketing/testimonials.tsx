'use client';

import { motion, type Variants } from 'motion/react';

type Testimonial = {
  quote: string;
  name: string;
  role: string;
  initials: string;
};

const TESTIMONIALS: Testimonial[] = [
  {
    quote:
      'Tomame cut my sourcing time completely. I paste a link, pay with Mobile Money, and it arrives. No forex stress, no surprises.',
    name: 'Kwame Asante',
    role: 'Founder, Kente Boutique — Accra',
    initials: 'KA',
  },
  {
    quote:
      'I used to spend hours trying to buy from Amazon. Now I do it in minutes and pay in cedis. The tracking updates on WhatsApp are a bonus.',
    name: 'Abena Mensah',
    role: 'CEO, Accra Imports Ltd.',
    initials: 'AM',
  },
  {
    quote:
      "The pricing breakdown is incredibly honest. I see exactly what I'm paying before I confirm. That trust is everything.",
    name: 'Kofi Boateng',
    role: 'Owner, GoldCoast Trends — Kumasi',
    initials: 'KB',
  },
];

const METRICS = ['Trusted by 5,000+ Ghanaian shoppers', 'Accra-based support team', '14-day average delivery'];

const stagger: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.12, delayChildren: 0.05 } },
};

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0, transition: { duration: 0.7, ease: [0.16, 1, 0.3, 1] } },
};

export default function TestimonialsSection() {
  return (
    <section className="relative overflow-hidden bg-stone-50 py-28 sm:py-32 lg:py-36">
      {/* Fine grid texture */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage:
            'linear-gradient(rgba(0,0,0,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,0.04) 1px, transparent 1px)',
          backgroundSize: '32px 32px',
        }}
        aria-hidden="true"
      />

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
            Customer stories
          </motion.span>
          <motion.h2
            variants={fadeUp}
            className="mt-5 text-3xl font-bold tracking-tight text-stone-900 sm:text-4xl lg:text-5xl"
          >
            What our customers say
          </motion.h2>
          <motion.p
            variants={fadeUp}
            className="mt-4 text-base leading-relaxed text-stone-500 sm:text-lg"
          >
            Stories from teams already moving faster with Tomame.
          </motion.p>
        </motion.div>

        {/* Cards grid */}
        <motion.div
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.2 }}
          variants={stagger}
          className="mt-16 grid grid-cols-1 gap-5 sm:gap-6 md:grid-cols-2 lg:grid-cols-3"
        >
          {TESTIMONIALS.map((t) => (
            <motion.article
              key={t.name}
              variants={fadeUp}
              className="group relative overflow-hidden rounded-2xl border border-stone-200 bg-white p-7 transition-all duration-300 hover:-translate-y-0.5 hover:border-stone-300 hover:shadow-[0_12px_32px_-12px_rgba(0,0,0,0.12)]"
            >
              {/* Top accent line on hover */}
              <span
                aria-hidden="true"
                className="pointer-events-none absolute top-0 left-6 right-6 h-px bg-linear-to-r from-transparent via-rose-400 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100"
              />

              {/* Quote mark */}
              <span
                aria-hidden="true"
                className="block select-none font-serif text-5xl leading-none text-stone-200"
              >
                &ldquo;
              </span>

              {/* Quote */}
              <p className="mt-2 text-base leading-relaxed text-stone-700">
                {t.quote}
              </p>

              {/* Author */}
              <div className="mt-6 flex items-center gap-3 border-t border-stone-100 pt-5">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-linear-to-br from-rose-500 to-amber-500 text-xs font-bold text-white shadow-[0_6px_20px_-6px_rgba(244,63,94,0.5)]">
                  {t.initials}
                </div>
                <div>
                  <p className="text-sm font-semibold text-stone-900">{t.name}</p>
                  <p className="text-xs text-stone-500">{t.role}</p>
                </div>
              </div>
            </motion.article>
          ))}
        </motion.div>

        {/* Social proof metrics row */}
        <motion.div
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.4 }}
          variants={fadeUp}
          className="mt-12 flex flex-wrap items-center justify-center gap-x-3 gap-y-2 text-center text-sm text-stone-500 lg:mt-14"
        >
          {METRICS.map((metric, i) => (
            <span key={metric} className="inline-flex items-center gap-3">
              <span>{metric}</span>
              {i < METRICS.length - 1 && (
                <span aria-hidden="true" className="text-stone-400">
                  &middot;
                </span>
              )}
            </span>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
