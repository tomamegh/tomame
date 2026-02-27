"use client";
import { AnimatePresence, motion, Variants } from "motion/react";
import { useEffect, useState } from "react";

type Testimonial = {
  quote: string;
  name: string;
  role: string;
  initials: string;
};

const TESTIMONIALS: Testimonial[] = [
  {
    quote:
      "Tomame cut our sourcing time by 80%. The transparent pricing alone is worth it — no more surprise fees.",
    name: "Sarah Chen",
    role: "Founder, Lumina Commerce",
    initials: "SC",
  },
  {
    quote:
      "We switched from three different tools to Tomame. The dashboard and real-time tracking are game-changers.",
    name: "Michael Torres",
    role: "Head of Ops, ShipFast",
    initials: "MT",
  },
  {
    quote:
      "The API integration took us 30 minutes. Now our entire catalog syncs automatically. Incredible product.",
    name: "Emma Wilson",
    role: "CTO, NovaBridge",
    initials: "EW",
  },
];

const stagger: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.1, delayChildren: 0.06 } },
};
const fadeUp: Variants = {
  hidden: { opacity: 0, y: 28 },
  show: { opacity: 1, y: 0, transition: { duration: 0.7, ease: "easeOut" } },
};
// const scaleIn: Variants = {
//     hidden: { opacity: 0, scale: 0.92 },
//     show: { opacity: 1, scale: 1, transition: { duration: 0.6, ease: 'easeOut' } },
// };

export default function TestimonialCarousel() {
  const [active, setActive] = useState<number>(0);

  useEffect(() => {
    const timer = setInterval(
      () => setActive((p) => (p + 1) % TESTIMONIALS.length),
      5000,
    );
    return () => clearInterval(timer);
  }, []);

  return (
    <section className="py-24 sm:py-32">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.3 }}
          variants={stagger}
          className="text-center"
        >
          <motion.p
            variants={fadeUp}
            className="text-sm font-semibold mb-3 tracking-wide uppercase"
          >
            Testimonials
          </motion.p>
          <motion.h2
            variants={fadeUp}
            className="text-3xl sm:text-4xl font-bold text-stone-850 mb-12"
          >
            Trusted by thousands
          </motion.h2>
        </motion.div>

        {/* Cards row */}
        <div className="relative overflow-hidden bg-linear-to-b from-stone-950 via-stone-900 to-stone-950 rounded-2xl">
          <div className="absolute top-[10%] left-[5%] size-120 rounded-full bg-rose-500/10 blur-[120px]" />
          <div className="absolute bottom-[10%] right-[5%] size-100 rounded-full bg-amber-500/8 blur-[100px]" />
          <AnimatePresence mode="wait">
            <motion.div
              key={active}
              initial={{ opacity: 0, x: 60 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -60 }}
              transition={{ duration: 0.5 }}
              className="rounded-2xl p-8 sm:p-10 text-center relative overflow-hidden"
            >
              <div className="absolute top-0 left-0 right-0 h-px bg-linear-to-r from-transparent via-primary/40 to-transparent" />
              <div className="mb-6 flex gap-1 justify-center text-amber-500 text-lg">
                {"★★★★★".split("").map((s, i) => (
                  <span key={i}>{s}</span>
                ))}
              </div>
              <p className="text-xl sm:text-2xl text-white/90 leading-relaxed mb-8 max-w-2xl mx-auto">
                &ldquo;{TESTIMONIALS[active]!.quote}&rdquo;
              </p>
              <div className="flex items-center justify-center gap-4">
                <div className="w-12 h-12 rounded-full gradient-primary flex items-center justify-center text-white text-sm font-bold shadow-[0_0_20px_-4px_rgba(168,85,247,0.4)]">
                  {TESTIMONIALS[active]!.initials}
                </div>
                <div className="text-left">
                  <p className="font-semibold text-white">
                    {TESTIMONIALS[active]!.name}
                  </p>
                  <p className="text-stone-400 text-sm">
                    {TESTIMONIALS[active]!.role}
                  </p>
                </div>
              </div>
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Nav dots */}
        <div className="flex justify-center gap-2 mt-8">
          {TESTIMONIALS.map((_, i) => (
            <button
              key={i}
              onClick={() => setActive(i)}
              className={`w-2.5 h-2.5 rounded-full transition-all duration-300 cursor-pointer ${
                i === active
                  ? "gradient-primary w-8"
                  : "bg-amber-500 hover:bg-amber-600"
              }`}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

// export default function TestimonialsSection() {
//     return (
//         <section className="py-20 sm:py-28 lg:py-32 bg-white">
//             <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
//                 <div className="text-center mb-12 sm:mb-16">
//                     <p className="text-sm font-semibold text-rose-500 mb-3 tracking-wide uppercase">Testimonials</p>
//                     <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-stone-900 mb-4">
//                         Loved by teams worldwide
//                     </h2>
//                     <p className="text-base sm:text-lg text-stone-500 max-w-2xl mx-auto">
//                         See how businesses are transforming their sourcing with Tomame.
//                     </p>
//                 </div>

//                 <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 sm:gap-6">
//                     {TESTIMONIALS.map((t) => (
//                         <div
//                             key={t.name}
//                             className="rounded-2xl border border-stone-200/60 bg-white p-6 sm:p-8 flex flex-col justify-between transition-all duration-500 hover:shadow-[0_8px_40px_-6px_rgba(120,113,108,0.12)] hover:-translate-y-1"
//                         >
//                             {/* Stars */}
//                             <div className="mb-4 flex gap-1 text-amber-400 text-sm">
//                                 {'★★★★★'.split('').map((s, i) => <span key={i}>{s}</span>)}
//                             </div>
//                             <p className="text-stone-600 leading-relaxed mb-6 flex-1">&ldquo;{t.quote}&rdquo;</p>
//                             <div className="flex items-center gap-3 pt-4 border-t border-stone-100">
//                                 <div className="w-10 h-10 rounded-full bg-linear-to-br from-rose-500 to-amber-500 flex items-center justify-center text-white text-xs font-bold">
//                                     {t.initials}
//                                 </div>
//                                 <div>
//                                     <p className="font-semibold text-stone-900 text-sm">{t.name}</p>
//                                     <p className="text-stone-400 text-xs">{t.role}</p>
//                                 </div>
//                             </div>
//                         </div>
//                     ))}
//                 </div>
//             </div>
//         </section>
//     );
// }
