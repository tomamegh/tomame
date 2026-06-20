'use client';

import { motion, type Variants } from 'motion/react';
import { FAQAccordion, type FAQItem } from './faq-accordion';

const FAQS: FAQItem[] = [
  {
    q: 'Which platforms can I shop from?',
    a: 'You can paste links from Amazon, ASOS, Alibaba, eBay, Apple Store, Walmart, Target, SHEIN, Zara, H&M, Nike, and 100+ other global retailers in the USA, UK, and China.',
  },
  {
    q: 'How is shipping calculated?',
    a: 'Shipping is calculated server-side using your origin region (USA, UK, or China) and our negotiated carrier rates. You see the total in Ghana Cedis before you pay — never after.',
  },
  {
    q: 'Can I pay with Mobile Money?',
    a: 'Yes. We support MTN Mobile Money, Vodafone Cash, AirtelTigo Money, and Visa / Mastercard. All payments are processed locally in Ghana through Paystack.',
  },
  {
    q: 'What if my product cannot be sourced?',
    a: 'If we are unable to fulfill an order after payment, you receive a 100% refund within 24 hours — including all service fees. No questions asked.',
  },
  {
    q: 'How long does delivery take?',
    a: 'Most orders arrive within 2–4 weeks depending on origin region. Air freight options are available for urgent items.',
  },
  {
    q: 'Is there any minimum order amount?',
    a: 'No minimum. Order one item or one hundred — the same transparent pricing applies.',
  },
];

const stagger: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06, delayChildren: 0.05 } },
};

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.16, 1, 0.3, 1] } },
};

export default function FAQSection() {
  return (
    <section className="relative overflow-hidden bg-stone-50 py-28 sm:py-32 lg:py-36">
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
        <motion.div
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.4 }}
          variants={stagger}
          className="mb-12 text-center sm:mb-16"
        >
          <motion.span
            variants={fadeUp}
            className="inline-flex items-center gap-2 rounded-full border border-stone-200 bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-stone-500"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-rose-500" aria-hidden="true" />
            FAQ
          </motion.span>
          <motion.h2
            variants={fadeUp}
            className="mt-5 text-3xl font-bold tracking-tight text-stone-900 sm:text-4xl lg:text-5xl"
          >
            Common questions
          </motion.h2>
          <motion.p
            variants={fadeUp}
            className="mx-auto mt-4 max-w-xl text-base leading-relaxed text-stone-500 sm:text-lg"
          >
            Quick answers to what most customers ask before their first order.
          </motion.p>
        </motion.div>

        <FAQAccordion items={FAQS} defaultOpenIndex={0} idPrefix="landing-faq" />
      </div>
    </section>
  );
}
