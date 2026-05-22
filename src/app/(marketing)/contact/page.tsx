'use client';

import { motion, type Variants } from 'motion/react';
import {
  MailIcon,
  MapPinIcon,
  MessageCircle,
  CheckCircle2,
  ArrowRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ContactForm } from '@/features/contact/components';

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

const CONTACT_METHODS = [
  {
    icon: MailIcon,
    title: 'Email',
    value: 'support@tomame.ca',
    desc: 'Fastest response — usually under 2 hours',
  },
  {
    icon: MessageCircle,
    title: 'WhatsApp',
    value: '+233 XX XXX XXXX',
    desc: 'For urgent orders and tracking questions',
  },
  {
    icon: MapPinIcon,
    title: 'Accra, Ghana',
    value: 'Serving customers nationwide',
    desc: 'Physical presence, local support',
  },
];

const WHY_TOMAME = [
  'Transparent pricing — every fee itemized before you pay',
  'Fast response times, usually under 2 hours',
  'Local team in Accra available on WhatsApp',
  'Pre-payment only — your money is safe before sourcing',
  'Live order tracking from purchase to delivery',
];

export default function ContactPage() {
  return (
    <main className="bg-white">
      {/* A. Page Header */}
      <section className="relative overflow-hidden bg-stone-950 py-20 sm:py-28">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.04]"
          style={DARK_GRID_TEXTURE}
          aria-hidden="true"
        />
        {/* Soft directional gradient — top to bottom only, no radial orbs */}
        <div
          className="pointer-events-none absolute inset-0 bg-linear-to-b from-stone-950 via-stone-900 to-stone-950"
          aria-hidden="true"
        />

        <div className="relative mx-auto max-w-3xl px-4 text-center sm:px-6 lg:px-8">
          <motion.div initial="hidden" animate="show" variants={stagger}>
            <motion.span
              variants={fadeUp}
              className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3.5 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-white/80 backdrop-blur-md"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-rose-400" aria-hidden="true" />
              Contact
            </motion.span>
            <motion.h1
              variants={fadeUp}
              className="mt-6 text-4xl font-bold tracking-tight text-white sm:text-5xl lg:text-6xl"
            >
              We&apos;re here to help
            </motion.h1>
            <motion.p
              variants={fadeUp}
              className="mt-5 text-base leading-relaxed text-white/70 sm:text-lg"
            >
              Our team in Accra responds within a few hours. Reach out any way that works for
              you.
            </motion.p>
          </motion.div>
        </div>
      </section>

      {/* B. Contact Methods */}
      <section className="relative bg-white py-16 sm:py-20">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.04]"
          style={GRID_TEXTURE}
          aria-hidden="true"
        />
        <div className="relative mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <motion.div
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, amount: 0.25 }}
            variants={stagger}
            className="grid grid-cols-1 gap-5 sm:gap-6 md:grid-cols-3"
          >
            {CONTACT_METHODS.map((method) => (
              <motion.article
                key={method.title}
                variants={fadeUp}
                className="group relative overflow-hidden rounded-3xl border border-stone-200 bg-white p-7 transition-all duration-500 hover:-translate-y-1 hover:border-stone-300 hover:shadow-[0_24px_60px_-24px_rgba(120,113,108,0.25)]"
              >
                <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-stone-200 bg-stone-50 text-stone-700 transition-colors duration-500 group-hover:border-rose-200 group-hover:text-rose-500">
                  <method.icon className="h-5 w-5" />
                </div>
                <h3 className="mt-6 text-sm font-semibold uppercase tracking-[0.14em] text-stone-500">
                  {method.title}
                </h3>
                <p className="mt-2 text-lg font-bold text-stone-900">{method.value}</p>
                <p className="mt-2 text-sm leading-relaxed text-stone-500">{method.desc}</p>
              </motion.article>
            ))}
          </motion.div>
        </div>
      </section>

      {/* C. Form + Info */}
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
            viewport={{ once: true, amount: 0.15 }}
            variants={stagger}
            className="grid grid-cols-1 gap-10 lg:grid-cols-2 lg:gap-14"
          >
            {/* Form */}
            <motion.div variants={fadeUp}>
              <ContactForm />
            </motion.div>

            {/* Info */}
            <motion.div variants={fadeUp} className="flex flex-col gap-8">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">
                  Why Tomame
                </p>
                <h3 className="mt-3 text-2xl font-bold text-stone-900 sm:text-3xl">
                  Why choose Tomame?
                </h3>
                <p className="mt-3 text-base leading-relaxed text-stone-500">
                  We&apos;re not just a platform — we&apos;re a partner in your global shopping
                  journey. Our team is committed to making every order feel local.
                </p>

                <ul className="mt-6 space-y-3">
                  {WHY_TOMAME.map((item) => (
                    <li key={item} className="flex items-start gap-3">
                      <CheckCircle2
                        className="mt-0.5 h-4 w-4 shrink-0 text-rose-500"
                        aria-hidden="true"
                      />
                      <span className="text-sm leading-relaxed text-stone-700 sm:text-base">
                        {item}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Community card */}
              <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-stone-950 p-7 sm:p-8 shadow-[0_24px_72px_-24px_rgba(0,0,0,0.45)]">
                {/* Card-level ambient light (acceptable inside dark cards) */}
                <div
                  className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(244,63,94,0.22),transparent_55%),radial-gradient(circle_at_bottom_left,rgba(251,191,36,0.14),transparent_50%)]"
                  aria-hidden="true"
                />
                <div
                  className="pointer-events-none absolute inset-0 opacity-[0.05]"
                  style={DARK_GRID_TEXTURE}
                  aria-hidden="true"
                />

                <div className="relative">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/50">
                    Community
                  </p>
                  <h4 className="mt-3 text-xl font-bold text-white sm:text-2xl">
                    Join our community
                  </h4>
                  <p className="mt-3 text-sm leading-relaxed text-white/70 sm:text-base">
                    Get sourcing tips, exchange-rate updates, and early access to features.
                    Connect with other Tomame shoppers on WhatsApp.
                  </p>
                  <div className="mt-6">
                    <a
                      href="https://wa.me/233000000000"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex"
                    >
                      <Button variant="primary" size="lg" className="h-12 px-6 text-base">
                        Join on WhatsApp
                        <ArrowRight className="ml-1 h-4 w-4" />
                      </Button>
                    </a>
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        </div>
      </section>
    </main>
  );
}
