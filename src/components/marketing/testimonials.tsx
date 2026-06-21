"use client";
import React from "react";
import { motion } from "motion/react";
import { Testimonial } from "@/types";

const TESTIMONIALS: Testimonial[] = [
  {
    quote:
      "Tomame cut my sourcing time completely. I paste a link, pay with Mobile Money, and it arrives. No forex stress, no surprises.",
    name: "Kwame Asante",
    role: "Founder, Kente Boutique — Accra",
    initials: "KA",
  },
  {
    quote:
      "I used to spend hours trying to buy from Amazon. Now I do it in minutes and pay in cedis. The tracking updates on WhatsApp are a bonus.",
    name: "Abena Mensah",
    role: "CEO, Accra Imports Ltd.",
    initials: "AM",
  },
  {
    quote:
      "The pricing breakdown is incredibly honest. I see exactly what I'm paying before I confirm. That trust is everything.",
    name: "Kofi Boateng",
    role: "Owner, GoldCoast Trends — Kumasi",
    initials: "KB",
  },
];

export const TestimonialsColumn = (props: {
  className?: string;
  testimonials: Testimonial[];
  duration?: number;
}) => {
  return (
    <div className={props.className}>
      <motion.div
        animate={{
          translateY: "-50%",
        }}
        transition={{
          duration: props.duration || 10,
          repeat: Infinity,
          ease: "linear",
          repeatType: "loop",
        }}
        className="flex flex-col gap-6 pb-6 bg-background"
      >
        {[
          ...new Array(2).fill(0).map((_, index) => (
            <React.Fragment key={index}>
              {props.testimonials.map((t, _) => (
                <motion.article
                  key={t.name}
                  className="group relative overflow-hidden rounded-2xl border border-stone-200 bg-white p-7 py-5 transition-all duration-300 hover:-translate-y-0.5 hover:border-stone-300 drop-shadow-lg hover:drop-shadow-xl"
                >
                  {/* Top accent line on hover */}
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute top-0 left-6 right-6 h-px bg-linear-to-r from-transparent via-rose-400 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100"
                  />

                  {/* Quote mark */}
                  <span
                    aria-hidden="true"
                    className="block select-none font-serif text-5xl leading-none text-stone-200"
                  >
                    &ldquo;
                  </span>

                  {/* Quote */}
                  <p className="text-base leading-relaxed text-stone-700">
                    {t.quote}
                  </p>

                  {/* Author */}
                  <div className="mt-5 flex items-center gap-3 border-t border-stone-100 pt-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-linear-to-br from-rose-500 to-amber-500 text-xs font-bold text-white shadow-[0_6px_20px_-6px_rgba(244,63,94,0.5)]">
                      {t.initials}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-stone-900">
                        {t.name}
                      </p>
                      <p className="text-xs text-stone-500">{t.role}</p>
                    </div>
                  </div>
                </motion.article>
              ))}
            </React.Fragment>
          )),
        ]}
      </motion.div>
    </div>
  );
};

const firstColumn = TESTIMONIALS.slice(0, 3);
const secondColumn = TESTIMONIALS.slice(-3, 3);
const thirdColumn = TESTIMONIALS.slice(0, 3);

const Testimonials = () => {
  return (
    <section className="bg-background my-20 relative overflow-hidden">
      <div className="mx-auto max-w-7xl z-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
          viewport={{ once: true }}
          className="mx-auto max-w-2xl text-center"
        >
          <motion.span className="inline-flex items-center gap-2 rounded-full border border-stone-200 bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-stone-500">
            <span
              className="h-1.5 w-1.5 rounded-full bg-rose-500"
              aria-hidden="true"
            />
            Customer stories
          </motion.span>
          <motion.h2 className="mt-5 text-3xl font-bold tracking-tight text-stone-900 sm:text-4xl lg:text-5xl">
            What our customers say
          </motion.h2>
          <motion.p className="mt-4 text-base leading-relaxed text-stone-500 sm:text-lg">
            Stories from teams already moving faster with Tomame.
          </motion.p>
        </motion.div>

        <div className="flex justify-center gap-6 mt-10 mask-[linear-gradient(to_bottom,transparent,black_25%,black_75%,transparent)] max-h-185 overflow-hidden">
          <TestimonialsColumn testimonials={firstColumn} duration={15} />
          <TestimonialsColumn
            testimonials={secondColumn}
            className="hidden md:block"
            duration={19}
          />
          <TestimonialsColumn
            testimonials={thirdColumn}
            className="hidden lg:block"
            duration={17}
          />
        </div>
      </div>
    </section>
  );
};

export default Testimonials;
