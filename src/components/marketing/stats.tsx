'use client';

import { motion, type Variants } from 'motion/react';

type Stat = {
  value: string;
  label: string;
};

const STATS: Stat[] = [
  { value: '5,000+', label: 'Orders delivered' },
  { value: '3', label: 'Regions sourced' },
  { value: '14 days', label: 'Average delivery' },
  { value: '100%', label: 'Transparent pricing' },
];

const stagger: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.1, delayChildren: 0.05 } },
};

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.16, 1, 0.3, 1] } },
};

export default function StatsSection() {
  return (
    <section
      className="relative overflow-hidden bg-stone-950 py-16 sm:py-20"
      aria-label="Tomame by the numbers"
    >
      {/* Fine grid texture */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage:
            'linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)',
          backgroundSize: '40px 40px',
        }}
        aria-hidden="true"
      />

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <motion.dl
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.4 }}
          variants={stagger}
          className="grid grid-cols-2 gap-px bg-white/10 sm:grid-cols-4"
        >
          {STATS.map((stat) => (
            <motion.div
              key={stat.label}
              variants={fadeUp}
              className="flex flex-col items-center justify-center bg-stone-950 px-6 py-10 text-center"
            >
              <dt className="sr-only">{stat.label}</dt>
              <dd className="text-5xl font-black tracking-tight text-white sm:text-6xl">
                {stat.value}
              </dd>
              <p className="mt-2 text-sm text-stone-400">{stat.label}</p>
            </motion.div>
          ))}
        </motion.dl>
      </div>
    </section>
  );
}
