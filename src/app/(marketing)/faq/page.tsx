'use client';

import { useState } from 'react';
import { Card } from '@/components/ui/card';

export default function FAQPage() {
  const [openIndex, setOpenIndex] = useState<number | string | null>(null);

  const faqs = [
    {
      category: 'Getting Started',
      questions: [
        {
          q: 'How do I get started with Tomame?',
          a: 'Sign up for free, verify your email, and you\'re ready to start pasting product links. No credit card required for the starter plan.',
        },
        {
          q: 'What ecommerce platforms do you support?',
          a: 'We support Amazon, eBay, Apple, Walmart, Target, Etsy, Alibaba, and 100+ other ecommerce sites globally.',
        },
        {
          q: 'Is there a mobile app?',
          a: 'We have a responsive web app that works great on mobile. Native iOS and Android apps are coming soon.',
        },
      ],
    },
    {
      category: 'Pricing & Payments',
      questions: [
        {
          q: 'How is shipping calculated?',
          a: 'Shipping is based on the package weight and destination country using real carrier rates. It\'s calculated automatically when you submit a product link.',
        },
        {
          q: 'Do you accept all payment methods?',
          a: 'We accept credit cards, bank transfers, and digital wallets. Enterprise customers can arrange custom billing.',
        },
        {
          q: 'Can I get a refund?',
          a: 'Yes. If we can\'t extract a product\'s data, we refund 100% of service fees within 24 hours.',
        },
      ],
    },
    {
      category: 'Orders & Delivery',
      questions: [
        {
          q: 'How long does delivery take?',
          a: 'Delivery typically takes 2-4 weeks depending on the destination and shipping method chosen. Standard shipping is cheapest, express is faster.',
        },
        {
          q: 'Can I track my order?',
          a: 'Yes! Real-time tracking is available for all orders. You\'ll get notifications at every stage: processing, shipped, out for delivery, delivered.',
        },
        {
          q: 'What if my order gets lost?',
          a: 'All orders are insured. If your package is lost or damaged, we file a claim and reimburse you within 5-7 business days.',
        },
      ],
    },
    {
      category: 'Technical',
      questions: [
        {
          q: 'Is my data secure?',
          a: 'We use enterprise-grade encryption, regular security audits, and comply with GDPR and SOC 2 standards. Your data is never shared with third parties.',
        },
        {
          q: 'Do you have an API?',
          a: 'Yes! Professional and Enterprise plans include API access for programmatic order placement and tracking.',
        },
        {
          q: 'What happens if the website changes or goes down temporarily?',
          a: 'We continuously monitor data sources and have multiple fallback scraping methods. Our uptime is 99.9%.',
        },
      ],
    },
  ];

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-20">
      <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-center mb-4 bg-gradient-to-r from-rose-500 to-amber-500 bg-clip-text text-transparent">
        Frequently Asked Questions
      </h1>
      <p className="text-base sm:text-lg lg:text-xl text-stone-500 text-center mb-10 sm:mb-16">
        Can't find the answer you're looking for? Contact our support team.
      </p>

      <div className="space-y-12">
        {faqs.map((section, sectionIndex) => (
          <div key={sectionIndex}>
            <h2 className="text-2xl font-bold text-stone-800 mb-6">{section.category}</h2>
            <div className="space-y-3">
              {section.questions.map((item, index) => {
                const globalIndex = `${sectionIndex}-${index}`;
                const isOpen = openIndex === globalIndex;

                return (
                  <Card
                    key={globalIndex}
                    className="overflow-hidden transition-all duration-300 cursor-pointer"
                    onClick={() => setOpenIndex(isOpen ? null : globalIndex)}
                  >
                    <div className="p-6 flex justify-between items-start gap-4">
                      <div className="flex-1">
                        <h3 className="font-bold text-lg text-stone-800 mb-2">{item.q}</h3>
                        {isOpen && (
                          <p className="text-stone-500 leading-relaxed mt-4 fade-in">
                            {item.a}
                          </p>
                        )}
                      </div>
                      <span className={`text-2xl text-stone-400 transition-transform duration-300 ${isOpen ? 'rotate-45' : ''}`}>
                        +
                      </span>
                    </div>
                  </Card>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Contact Section */}
      <Card variant="gradient" className="mt-16 p-8 text-center">
        <h2 className="text-2xl font-bold text-stone-800 mb-4">Still have questions?</h2>
        <p className="text-stone-500 mb-6">
          Our support team is here to help. Hit us up anytime.
        </p>
        <a
          href="/contact"
          className="inline-block px-6 py-3 bg-gradient-to-r from-rose-500 to-amber-500 text-white rounded-xl font-semibold shadow-[0_4px_14px_-2px_rgba(244,63,94,0.35)] hover:shadow-[0_6px_20px_-2px_rgba(244,63,94,0.45)] hover:translate-y-[-1px] transition-all duration-300"
        >
          Get In Touch
        </a>
      </Card>
    </div>
  );
}
