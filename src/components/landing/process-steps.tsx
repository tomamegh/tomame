'use client';

import { motion, Variants } from "motion/react";

const PROCESS_STEPS = [
  {
    num: '01',
    title: 'Paste any product link',
    description: 'Amazon, eBay, Alibaba, ASOS — any link works. We support 100+ global platforms.',
    side: 'left' as const,
  },
  {
    num: '02',
    title: 'Review your breakdown',
    description: 'See the exact cost in Ghana Cedis: product, shipping, customs, taxes, and our fee. Zero surprises.',
    side: 'right' as const,
  },
  {
    num: '03',
    title: 'Pay with Mobile Money',
    description: 'MTN, Vodafone, AirtelTigo, or card. We process locally so you never worry about forex.',
    side: 'left' as const,
  },
  {
    num: '04',
    title: 'We deliver to your door',
    description: 'Track your order in real-time. Average 2–4 week delivery with express options available.',
    side: 'right' as const,
  },
];

const stagger: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.1, delayChildren: 0.06 } },
};
const fadeUp: Variants = {
  hidden: { opacity: 0, y: 28 },
  show: { opacity: 1, y: 0, transition: { duration: 0.7, ease: 'easeOut' } },
};

export default function ProcessZigzag() {
  return (
    <section className="py-24 sm:py-32">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          variants={stagger}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.3 }}
          className="text-center mb-16 space-y-6"
        >
          <p className="inline-block px-3 py-1 rounded-full bg-rose-500/10 text-rose-600 text-xs font-semibold tracking-wide uppercase">
            Process
          </p>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold">
            How Tomame works
          </h2>
        </motion.div>

        <div className="relative">
          {/* Center line */}
          <div className="absolute left-1/2 top-0 bottom-0 w-px hidden md:block bg-slate-200 bg-linear-to-t" />

          <div className="space-y-12 md:space-y-0">
            {PROCESS_STEPS.map((step, i) => (
              <motion.div
                key={step.num}
                initial={{ opacity: 0, x: step.side === 'left' ? -30 : 30 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true, amount: 0.5 }}
                transition={{ duration: 0.6, delay: i * 0.1 }}
                className={`relative md:flex items-center md:min-h-[140px] ${step.side === 'left' ? 'md:justify-start' : 'md:justify-end'
                  }`}
              >
                {/* Center dot */}
                <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-4 h-4 rounded-full gradient-primary hidden md:block z-10" >
                  <div className="absolute inset-0 rounded-full gradient-primary animate-ping" />
                </div>  

                {/* <div
                  className={`hidden md:block absolute top-1/2 -translate-y-1/2 h-px bg-gradient-to-r from-violet-500/40 to-fuchsia-500/40 ${
                    step.side === 'left'
                      ? 'right-[50%] w-[6%]'
                      : 'left-[50%] w-[6%]'
                  }`}
                /> */}

                {/* Curved connector */}
                <svg
                  className={`hidden md:block absolute top-1/2 -translate-y-1/2 ${step.side === 'left'
                      ? 'right-[50%]'
                      : 'left-[50%] scale-x-[-1]'
                    }`}
                  width="90"
                  height="60"
                  viewBox="0 0 90 60"
                  fill="none"
                >
                  <motion.path
                    d="M0 30 C30 0 60 60 90 30"
                    stroke="url(#curveGradient)"
                    strokeWidth="2"
                    fill="transparent"
                    initial={{ pathLength: 0 }}
                    whileInView={{ pathLength: 1 }}
                    transition={{ duration: 0.6, delay: i * 0.1 }}
                  />
                  <defs>
                    <linearGradient id="curveGradient" x1="10" y1="0" x2="90" y2="0">
                      <stop offset="0%" stopColor="#e2e8f0" stopOpacity="0.4" />
                      <stop offset="100%" stopColor="#e80b3bff" stopOpacity="0.6" />
                    </linearGradient>
                  </defs>
                </svg>

                {/* Card */}
                <div
                  className={`md:w-[44%] rounded-2xl border border-purple-500/10  backdrop-blur-sm p-6 transition-all duration-500 hover:border-purple-500/25 ${step.side === 'left' ? 'md:mr-auto' : 'md:ml-auto'
                    }`}
                >
                  <span className="text-stone-950 text-xs font-bold tracking-widest uppercase">
                    Step {step.num}
                  </span>
                  <h3 className="text-lg font-bold text-stone-850 mt-2 mb-2">{step.title}</h3>
                  <p className="text-stone-600 text-sm leading-relaxed">{step.description}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}