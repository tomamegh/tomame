"use client";
import { ChartBarIcon, LinkIcon, PackageIcon, RocketIcon, RouteIcon } from "lucide-react";
import { motion, Variants } from "motion/react";

const FEATURES = [
  {
    icon: LinkIcon,
    title: 'Intelligent Extraction',
    description: 'Paste any product link and our engine extracts titles, images, prices, and specs automatically.',
  },
  {
    icon: PackageIcon,
    title: 'Transparent Pricing',
    description: 'See a full cost breakdown — product, shipping, freight, taxes, and fees — before you commit.',
  },
  {
    icon: RocketIcon,
    title: 'Global Fulfillment',
    description: 'We source from 50+ countries with competitive carrier rates and reliable delivery timelines.',
  },
  {
    icon: RouteIcon,
    title: 'Live Order Tracking',
    description: 'Follow every order from purchase to doorstep with real-time status updates and notifications.',
  },
];

export default function LadningFeaturesSection() {
  return (
    <section className="py-20 sm:py-28 lg:py-32 bg-stone-50">
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
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: i * 0.2 }}
              key={i}
              className="group relative rounded-2xl border border-stone-200/60 bg-white hover:bg-stone-950 p-6 sm:p-7 transition-all duration-500 hover:shadow-[0_8px_40px_-6px_rgba(120,113,108,0.12)] hover:-translate-y-1"
            >
              <div className="w-12 h-12 rounded-xl gradient-primary flex items-center justify-center text-2xl mb-5">
                <f.icon color="white" />
              </div>
              <h3 className="font-bold text-lg text-stone-900 mb-2">{f.title}</h3>
              <p className="text-stone-500 text-sm leading-relaxed">{f.description}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}