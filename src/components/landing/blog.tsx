'use client';

import Link from 'next/link';
import { motion, type Variants } from 'motion/react';
import { HiArrowRight } from 'react-icons/hi2';

type BlogPost = {
  title: string;
  description: string;
  tag: string;
  href: string;
  date: string;
  author: string;
  readTime: string;
};

const BLOG_POSTS: BlogPost[] = [
  {
    title: 'How to reduce sourcing costs by 40%',
    description:
      'A practical guide to smarter global purchasing for Ghanaian businesses.',
    tag: 'Guide',
    href: '/blog/reduce-sourcing-costs',
    date: 'Jan 14, 2025',
    author: 'Tomame Team',
    readTime: '5 min read',
  },
  {
    title: 'The hidden costs of international shipping',
    description:
      'Understanding freight surcharges, duties, and how to read a landed cost breakdown.',
    tag: 'Insights',
    href: '/blog/hidden-shipping-costs',
    date: 'Feb 3, 2025',
    author: 'Tomame Team',
    readTime: '4 min read',
  },
];

const stagger: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.12, delayChildren: 0.05 } },
};

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0, transition: { duration: 0.7, ease: [0.16, 1, 0.3, 1] } },
};

export default function BlogSection() {
  return (
    <section className="relative overflow-hidden bg-white py-28 sm:py-32 lg:py-36">
      <div className="relative mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <motion.div
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.4 }}
          variants={stagger}
          className="flex flex-col items-start gap-6 sm:flex-row sm:items-end sm:justify-between"
        >
          <div className="max-w-2xl">
            <motion.span
              variants={fadeUp}
              className="inline-flex items-center gap-2 rounded-full border border-stone-200 bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-stone-500"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-rose-500" aria-hidden="true" />
              Blog
            </motion.span>
            <motion.h2
              variants={fadeUp}
              className="mt-5 text-3xl font-bold tracking-tight text-stone-900 sm:text-4xl lg:text-5xl"
            >
              Insights &amp; resources
            </motion.h2>
            <motion.p
              variants={fadeUp}
              className="mt-4 text-base leading-relaxed text-stone-500 sm:text-lg"
            >
              The latest on global sourcing, logistics, and shopping smarter from Ghana.
            </motion.p>
          </div>

          <motion.div variants={fadeUp}>
            <Link
              href="/blog"
              className="group inline-flex items-center gap-1.5 text-sm font-semibold text-stone-900 transition-colors hover:text-rose-500"
            >
              Read all posts
              <HiArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-0.5" />
            </Link>
          </motion.div>
        </motion.div>

        {/* Cards */}
        <motion.div
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.2 }}
          variants={stagger}
          className="mt-14 grid grid-cols-1 gap-5 sm:gap-6 md:grid-cols-2 lg:mt-16"
        >
          {BLOG_POSTS.map((post) => (
            <motion.div key={post.title} variants={fadeUp}>
              <Link
                href={post.href}
                className="group relative flex min-h-72 flex-col overflow-hidden rounded-2xl bg-linear-to-br from-stone-900 to-stone-800 p-6 transition-all duration-500 hover:-translate-y-0.5 hover:shadow-[0_16px_48px_-8px_rgba(0,0,0,0.25)] sm:min-h-80 sm:p-8"
              >
                {/* Single gradient overlay — no ambient orbs */}
                <div
                  className="pointer-events-none absolute inset-0 bg-linear-to-t from-stone-950/90 via-stone-900/40 to-transparent"
                  aria-hidden="true"
                />

                <div className="relative z-10 flex h-full flex-col justify-end">
                  <span className="mb-4 inline-flex w-fit items-center rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-semibold text-white/80 backdrop-blur-md">
                    {post.tag}
                  </span>
                  <h3 className="text-xl font-bold text-white transition-colors duration-300 group-hover:text-rose-200 sm:text-2xl">
                    {post.title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-white/55 sm:text-base">
                    {post.description}
                  </p>

                  {/* Metadata row */}
                  <div className="mt-4 flex items-center gap-3 text-[11px] text-white/40">
                    <span>{post.date}</span>
                    <span aria-hidden="true">·</span>
                    <span>{post.readTime}</span>
                  </div>

                  <span className="mt-5 inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-white/70 transition-colors duration-300 group-hover:text-rose-200">
                    Read article
                    <HiArrowRight className="h-3.5 w-3.5 transition-transform duration-300 group-hover:translate-x-0.5" />
                  </span>
                </div>
              </Link>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
