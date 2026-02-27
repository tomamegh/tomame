import Link from "next/link";
import { Button } from "../ui/button";

const VALUE_PROPS = [
  {
    badge: 'Automate',
    title: 'Stop wasting hours on manual sourcing',
    description:
      'Tomame replaces spreadsheets, back-and-forth emails, and guesswork with a single workflow. Paste a link and let us handle the rest.',
    bullets: [
      'Auto-extract product data from 100+ platforms',
      'Instant shipping & tax calculations',
      'One-click order placement',
    ],
  },
  {
    badge: 'Scale',
    title: 'Built for teams that move fast',
    description:
      'Whether you source 5 products or 5,000, Tomame scales with you. Bulk discounts, API access, and dedicated support keep your pipeline flowing.',
    bullets: [
      'Unlimited product links on Pro plans',
      'RESTful API for programmatic orders',
      'Priority support & dedicated account managers',
    ],
  },
];

export default function ValueSection() {
  return (
    <section className="py-16 sm:py-24 lg:py-32 bg-stone-50">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 space-y-20 sm:space-y-28 lg:space-y-32">
        {VALUE_PROPS.map((vp, i) => {
          const reversed = i % 2 !== 0;
          return (
            <div
              key={i}
              className={`flex flex-col ${reversed ? 'lg:flex-row-reverse' : 'lg:flex-row'} gap-10 lg:gap-16 items-center`}
            >
              {/* Text */}
              <div className="flex-1 space-y-6">
                <span className="inline-block px-3 py-1 rounded-full bg-rose-500/10 text-rose-600 text-xs font-semibold tracking-wide uppercase">
                  {vp.badge}
                </span>
                <h2 className="text-3xl sm:text-4xl font-bold text-stone-900 leading-tight">
                  {vp.title}
                </h2>
                <p className="text-stone-500 text-base sm:text-lg leading-relaxed">
                  {vp.description}
                </p>
                <ul className="space-y-3">
                  {vp.bullets.map((b) => (
                    <li key={b} className="flex items-start gap-3">
                      <div className="mt-1 w-5 h-5 rounded-full bg-linear-to-br from-rose-500 to-amber-500 flex items-center justify-center shrink-0">
                        <span className="text-white text-[10px] font-bold">✓</span>
                      </div>
                      <span className="text-stone-600 text-sm sm:text-base">{b}</span>
                    </li>
                  ))}
                </ul>
                <Link href="/auth/signup">
                  <Button variant="primary" size="lg">Get Started</Button>
                </Link>
              </div>

              {/* Illustration card */}
              <div className="flex-1 w-full">
                <div className="rounded-2xl sm:rounded-3xl bg-linear-to-br from-stone-900 to-stone-800 border border-white/10 p-5 sm:p-8 shadow-[0_16px_48px_-8px_rgba(0,0,0,0.2)]">
                  <div className="space-y-4">
                    {i === 0 ? (
                      /* Product extraction mockup */
                      <>
                        <div className="flex items-center gap-3 rounded-xl bg-white/5 border border-white/5 px-4 py-3">
                          <div className="w-8 h-8 rounded-lg bg-rose-500/20 flex items-center justify-center text-sm">🔗</div>
                          <div className="flex-1 h-3 rounded bg-white/10" />
                          <div className="px-3 py-1.5 rounded-lg bg-linear-to-r from-rose-500 to-amber-500 text-white text-[10px] font-bold">Extract</div>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          {['Product Name', 'Price', 'Weight', 'Platform'].map((l) => (
                            <div key={l} className="rounded-xl bg-white/3 border border-white/5 p-3">
                              <p className="text-[10px] text-white/30 mb-1">{l}</p>
                              <div className="h-3 w-3/4 rounded bg-white/10" />
                            </div>
                          ))}
                        </div>
                        <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/20 px-4 py-3 flex items-center gap-2">
                          <span className="text-emerald-400 text-xs">✓</span>
                          <span className="text-emerald-400/80 text-xs">Product data extracted successfully</span>
                        </div>
                      </>
                    ) : (
                      /* Dashboard / scale mockup */
                      <>
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-white/40 text-xs">Orders this month</p>
                          <p className="text-white/80 text-sm font-bold">+24%</p>
                        </div>
                        <div className="h-24 sm:h-32 flex items-end gap-1.5">
                          {[30, 50, 40, 70, 55, 85, 65, 90, 75, 95, 80, 100].map((h, j) => (
                            <div
                              key={j}
                              className="flex-1 rounded-t bg-linear-to-t from-rose-500/50 to-amber-500/30"
                              style={{ height: `${h}%` }}
                            />
                          ))}
                        </div>
                        <div className="grid grid-cols-3 gap-3 mt-4">
                          {[
                            { label: 'Active', value: '2,847' },
                            { label: 'Shipped', value: '1,203' },
                            { label: 'Delivered', value: '8,492' },
                          ].map((s) => (
                            <div key={s.label} className="rounded-xl bg-white/3 border border-white/5 p-3 text-center">
                              <p className="text-[10px] text-white/30 mb-1">{s.label}</p>
                              <p className="text-sm font-bold text-white/70">{s.value}</p>
                            </div>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}