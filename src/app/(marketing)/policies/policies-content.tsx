"use client";

import { useRef, useEffect, useState } from "react";
import { motion, type Variants, useReducedMotion } from "motion/react";
import Link from "next/link";
import { PolicyHtml } from "@/features/policies/components/policy-html";
import type { PolicyRow } from "@/features/policies/types";

const stagger: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08, delayChildren: 0.05 } },
};

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0, transition: { duration: 0.7, ease: [0.16, 1, 0.3, 1] } },
};

function formatUpdated(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

interface PoliciesContentProps {
  policies: PolicyRow[];
}

export function PoliciesContent({ policies }: PoliciesContentProps) {
  const reduceMotion = useReducedMotion();
  const [activeSlug, setActiveSlug] = useState<string>(policies[0]?.slug ?? "");
  const sectionsRef = useRef<Map<string, HTMLElement>>(new Map());

  const headerEffectiveDate = policies[0]?.effective_date ?? "";

  useEffect(() => {
    const elements = Array.from(sectionsRef.current.values());
    if (!elements.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        const first = visible[0];
        if (first) {
          const slug = first.target.getAttribute("id");
          if (slug) setActiveSlug(slug);
        }
      },
      { rootMargin: "-20% 0px -55% 0px", threshold: [0, 0.25, 0.5, 1] },
    );

    elements.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [policies]);

  const registerSection = (slug: string) => (el: HTMLElement | null) => {
    if (el) sectionsRef.current.set(slug, el);
    else sectionsRef.current.delete(slug);
  };

  const handleNavClick =
    (slug: string) => (e: React.MouseEvent<HTMLAnchorElement>) => {
      e.preventDefault();
      const target = sectionsRef.current.get(slug);
      if (target) {
        const top = target.getBoundingClientRect().top + window.scrollY - 96;
        window.scrollTo({
          top,
          behavior: reduceMotion ? "auto" : "smooth",
        });
        setActiveSlug(slug);
        window.history.pushState(null, "", `#${slug}`);
      }
    };

  return (
    <>
      {/* Dark header */}
      <section className="relative overflow-hidden bg-stone-950 py-20 sm:py-24 shadow-[0_4px_24px_rgba(0,0,0,0.18)]">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)",
            backgroundSize: "40px 40px",
          }}
          aria-hidden="true"
        />
        <div className="relative mx-auto max-w-3xl px-4 text-center sm:px-6 lg:px-8">
          <motion.div initial="hidden" animate="show" variants={stagger}>
            <motion.span
              variants={fadeUp}
              className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-white/70 backdrop-blur-md"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-rose-400" aria-hidden="true" />
              Legal
            </motion.span>
            <motion.h1
              variants={fadeUp}
              className="mt-6 text-4xl font-bold tracking-tight text-white sm:text-5xl"
            >
              Policies
            </motion.h1>
            <motion.p
              variants={fadeUp}
              className="mx-auto mt-4 max-w-xl text-base leading-relaxed text-white/65"
            >
              Everything you need to know about how Tomame operates, protects your data,
              and handles your orders.
            </motion.p>
            {headerEffectiveDate && (
              <motion.p variants={fadeUp} className="mt-3 text-xs text-white/40">
                Last updated: {headerEffectiveDate}
              </motion.p>
            )}
          </motion.div>
        </div>
      </section>

      {/* Content */}
      <section className="bg-white py-20 sm:py-24">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 gap-12 lg:grid-cols-12 lg:gap-16">

            {/* Sidebar */}
            <aside className="lg:col-span-3">
              <div className="lg:sticky lg:top-24">
                <p className="mb-4 text-xs font-bold uppercase tracking-[0.2em] text-stone-400">
                  Sections
                </p>
                <nav aria-label="Policy sections">
                  {/* Desktop vertical nav */}
                  <ul className="hidden flex-col gap-1 border-l border-stone-200 lg:flex">
                    {policies.map((policy) => {
                      const isActive = activeSlug === policy.slug;
                      return (
                        <li key={policy.slug}>
                          <a
                            href={`#${policy.slug}`}
                            onClick={handleNavClick(policy.slug)}
                            aria-current={isActive ? "true" : undefined}
                            className={`-ml-px block border-l-2 py-1.5 pl-4 text-sm transition-colors duration-200 ${
                              isActive
                                ? "border-rose-500 font-semibold text-stone-900"
                                : "border-transparent font-medium text-stone-500 hover:border-stone-300 hover:text-stone-900"
                            }`}
                          >
                            {policy.label}
                          </a>
                        </li>
                      );
                    })}
                  </ul>

                  {/* Mobile horizontal scroll pills */}
                  <ul className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 lg:hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                    {policies.map((policy) => {
                      const isActive = activeSlug === policy.slug;
                      return (
                        <li key={policy.slug} className="shrink-0">
                          <a
                            href={`#${policy.slug}`}
                            onClick={handleNavClick(policy.slug)}
                            aria-current={isActive ? "true" : undefined}
                            className={`inline-flex h-8 items-center rounded-full border px-3 text-xs font-semibold transition-colors duration-200 ${
                              isActive
                                ? "border-rose-200 bg-rose-50 text-rose-600"
                                : "border-stone-200 bg-white text-stone-600 hover:border-stone-300"
                            }`}
                          >
                            {policy.label}
                          </a>
                        </li>
                      );
                    })}
                  </ul>
                </nav>
              </div>
            </aside>

            {/* Policy sections */}
            <div className="space-y-16 lg:col-span-9 lg:space-y-20">
              {policies.map((policy) => (
                <section
                  key={policy.slug}
                  id={policy.slug}
                  ref={registerSection(policy.slug)}
                  className="scroll-mt-24"
                  aria-labelledby={`${policy.slug}-heading`}
                >
                  <div className="mb-6 flex items-start justify-between gap-4 border-b border-stone-200 pb-4">
                    <h2
                      id={`${policy.slug}-heading`}
                      className="text-xl font-bold tracking-tight text-stone-900 sm:text-2xl"
                    >
                      {policy.label}
                    </h2>
                    <span className="mt-1 shrink-0 text-xs font-medium text-stone-400">
                      Updated {formatUpdated(policy.last_updated)}
                    </span>
                  </div>
                  <PolicyHtml content={policy.content} />
                </section>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="bg-stone-50 py-14 sm:py-16">
        <div className="mx-auto max-w-2xl px-4 text-center sm:px-6 lg:px-8">
          <p className="text-sm font-semibold text-stone-500">
            Questions about any of our policies?
          </p>
          <p className="mt-2 text-base text-stone-600">
            Reach out at{" "}
            <a
              href="mailto:support@tomame.ca"
              className="font-semibold text-rose-600 hover:underline"
            >
              support@tomame.ca
            </a>{" "}
            — we respond within 2 hours.
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3 text-xs text-stone-400">
            {policies.map((p, i) => (
              <span key={p.slug} className="flex items-center gap-3">
                <Link
                  href={`/policies#${p.slug}`}
                  className="hover:text-stone-600 transition-colors"
                >
                  {p.label}
                </Link>
                {i < policies.length - 1 && <span aria-hidden="true">·</span>}
              </span>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
