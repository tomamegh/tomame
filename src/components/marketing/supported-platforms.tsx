"use client";

import Image from "next/image";
import { motion } from "motion/react";

const LOGOS = [
  { src: "/icons/Amazon.svg", alt: "Amazon", className: "h-10 w-auto sm:h-12" },
  { src: "/icons/ebay.svg", alt: "eBay", className: "h-10 w-auto sm:h-12" },
];

export default function LandingPageSupportedPlatforms() {
  return (
    <section className="border-t border-stone-100 bg-white py-12 sm:py-14">
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.4 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="flex flex-col items-center gap-10 sm:gap-12"
        >
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-stone-400">
            Supported platforms
          </p>
          <div className="flex items-center justify-center gap-14 sm:gap-20 lg:gap-24">
            {LOGOS.map((logo) => (
              <div
                key={logo.alt}
                className="flex items-center justify-center opacity-45 grayscale transition-all duration-300 hover:opacity-100 hover:grayscale-0"
              >
                <Image
                  src={logo.src}
                  alt={logo.alt}
                  width={120}
                  height={48}
                  className={logo.className}
                />
              </div>
            ))}

            {/* SHEIN — no logo file, use styled wordmark */}
            <div className="flex items-center justify-center opacity-45 grayscale transition-all duration-300 hover:opacity-100 hover:grayscale-0">
              <span className="text-3xl font-black tracking-[0.12em] text-stone-900 sm:text-4xl">
                SHEIN
              </span>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
