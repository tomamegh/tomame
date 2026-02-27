'use client'

import { useState } from "react";

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

export default function FAQSection() {
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