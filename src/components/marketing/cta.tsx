'use client';

import Image from 'next/image';
import Link from 'next/link';
import { motion, type Variants } from 'motion/react';
import {
  HiArrowRight,
} from 'react-icons/hi2';
import { Button } from '../ui/button';

const stagger: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.1, delayChildren: 0.05 } },
};

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0, transition: { duration: 0.8, ease: [0.16, 1, 0.3, 1] } },
};


export default function CTASection() {
  return (
    <section className="px-4 py-24 sm:px-6 sm:py-32 lg:px-8 lg:py-36">
      <div className="mx-auto max-w-7xl">
        <motion.div
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.25 }}
          variants={stagger}
          className="relative overflow-hidden rounded-3xl bg-stone-950 px-6 py-20 text-center sm:px-10 sm:py-24 lg:py-28"
        >
          {/* Background image */}
          <div className="absolute inset-0 overflow-hidden rounded-3xl">
            <Image
              src="/images/boxes.jpg"
              alt=""
              fill
              sizes="(max-width: 1280px) 100vw, 1280px"
              className="object-cover object-center opacity-15"
            />
          </div>


          {/* Content */}
          <div className="relative z-10 mx-auto max-w-2xl">

            <motion.h2
              variants={fadeUp}
              className="mt-6 text-4xl font-black leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl bg-linear-to-r from-rose-400 via-orange-400 to-amber-400 bg-clip-text text-transparent"
            >
                Ready to shop the world?
            </motion.h2>

            <motion.p
              variants={fadeUp}
              className="mx-auto mt-5 max-w-lg text-base leading-relaxed text-white/65 sm:text-lg"
            >
              Join thousands of Ghanaians already shopping globally. No hidden fees, no forex stress.
            </motion.p>

            {/* CTAs */}
            <motion.div
              variants={fadeUp}
              className="mt-8 flex flex-wrap items-center justify-center gap-3 sm:gap-4"
            >
              <Link href="/auth/signup">
                <Button variant="primary" size="lg" className="h-12 px-7 text-base">
                  Create Free Account
                  <HiArrowRight className="ml-1 h-4 w-4" />
                </Button>
              </Link>
            </motion.div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
