'use client';

import { useState } from 'react';
import { AnimatePresence, motion, type Variants } from 'motion/react';
import { HiPlus } from 'react-icons/hi2';

export interface FAQItem {
  q: string;
  a: string;
}

interface FAQAccordionProps {
  items: FAQItem[];
  /** Index of the item that should start open. Pass `null` (default) to render all closed. */
  defaultOpenIndex?: number | null;
  /** Optional id prefix to keep aria-controls unique when multiple accordions are on the page. */
  idPrefix?: string;
}

const stagger: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06, delayChildren: 0.05 } },
};

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] } },
};

export function FAQAccordion({
  items,
  defaultOpenIndex = null,
  idPrefix = 'faq',
}: FAQAccordionProps) {
  const [openIndex, setOpenIndex] = useState<number | null>(defaultOpenIndex);

  return (
    <motion.div
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, amount: 0.1 }}
      variants={stagger}
      className="space-y-3"
    >
      {items.map((faq, i) => {
        const isOpen = openIndex === i;
        const panelId = `${idPrefix}-panel-${i}`;
        const buttonId = `${idPrefix}-trigger-${i}`;

        return (
          <motion.div
            key={`${faq.q}-${i}`}
            variants={fadeUp}
            className={`overflow-hidden rounded-2xl border bg-white transition-colors duration-300 ${
              isOpen
                ? 'border-rose-200/70 shadow-[0_12px_40px_-16px_rgba(244,63,94,0.18)]'
                : 'border-stone-200/70 hover:border-stone-300'
            }`}
          >
            <button
              id={buttonId}
              type="button"
              onClick={() => setOpenIndex(isOpen ? null : i)}
              aria-expanded={isOpen}
              aria-controls={panelId}
              className="flex w-full items-center justify-between gap-4 p-5 text-left sm:p-6"
            >
              <span className="pr-2 text-sm font-semibold text-stone-900 sm:text-base">
                {faq.q}
              </span>
              <motion.span
                animate={{ rotate: isOpen ? 45 : 0 }}
                transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border ${
                  isOpen
                    ? 'border-rose-200 bg-rose-50 text-rose-500'
                    : 'border-stone-200 bg-stone-50 text-stone-500'
                }`}
                aria-hidden="true"
              >
                <HiPlus className="h-4 w-4" />
              </motion.span>
            </button>

            <AnimatePresence initial={false}>
              {isOpen && (
                <motion.div
                  key="content"
                  id={panelId}
                  role="region"
                  aria-labelledby={buttonId}
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{
                    height: { duration: 0.35, ease: [0.16, 1, 0.3, 1] },
                    opacity: { duration: 0.25, ease: 'easeOut' },
                  }}
                  className="overflow-hidden"
                >
                  <div className="px-5 pb-5 sm:px-6 sm:pb-6">
                    <p className="text-sm leading-relaxed text-stone-500 sm:text-base">
                      {faq.a}
                    </p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        );
      })}
    </motion.div>
  );
}
