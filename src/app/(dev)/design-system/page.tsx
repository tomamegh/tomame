import { notFound } from "next/navigation";
import {
  AirplaneTilt,
  ArrowRight,
  BellSimple,
  BookmarkSimple,
  House,
  LinkSimple,
  Package,
  Path,
  Receipt,
  Sparkle,
  Storefront,
  Tote,
} from "@phosphor-icons/react/ssr";

import { Logo } from "@/components/brand/logo";

/**
 * Phase 0 reference surface for the UI redesign.
 *
 * Every swatch, radius and motion sample below renders from the CSS custom
 * properties defined in globals.css — nothing here restates a value, so this
 * page cannot drift from the theme it documents.
 *
 * Dev-only: excluded from production builds.
 */

const PALETTE: { token: string; label: string; note: string }[] = [
  { token: "--tm-coral", label: "Coral", note: "accent, links, primary" },
  { token: "--tm-coral-strong", label: "Coral strong", note: "link hover" },
  { token: "--tm-ink", label: "Ink", note: "text only — never a surface" },
  { token: "--tm-paper", label: "Paper", note: "page background" },
  { token: "--tm-tint", label: "Tint", note: "highlights" },
  { token: "--tm-green", label: "Green", note: "success / done" },
  { token: "--tm-green-ink", label: "Green ink", note: "text on green bg" },
  { token: "--tm-green-bg", label: "Green bg", note: "success surface" },
  { token: "--tm-amber", label: "Amber", note: "in progress / soon" },
  { token: "--tm-amber-bg", label: "Amber bg", note: "pending surface" },
  { token: "--tm-text-2", label: "Text 2", note: "secondary" },
  { token: "--tm-text-3", label: "Text 3", note: "tertiary" },
  { token: "--tm-border", label: "Border", note: "1px card border" },
  { token: "--tm-hairline", label: "Hairline", note: "dividers" },
];

const MOTION: { cls: string; name: string; note: string }[] = [
  { cls: "tm-up", name: "tmUp", note: "14px rise + fade, page load" },
  { cls: "tm-in", name: "tmIn", note: "plain fade" },
  { cls: "tm-pop", name: "tmPop", note: "total pops after last receipt row" },
  { cls: "tm-float", name: "tmFloat", note: "hero cards drift ±8px" },
  { cls: "tm-pulse-dot", name: "tmPulse", note: "live rate dot" },
  { cls: "tm-fill", name: "tmFill", note: "bars scale from left" },
  { cls: "tm-words", name: "tmWords", note: "store name cycle" },
];

function Section({
  n,
  title,
  children,
}: {
  n: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-5">
      <div className="flex items-baseline gap-3">
        <span className="text-tm-text-3 text-[11px] font-semibold uppercase tracking-[0.14em]">
          {n}
        </span>
        <h2 className="text-[26px] font-bold">{title}</h2>
      </div>
      {children}
    </section>
  );
}

export default function DesignSystemPage() {
  if (process.env.NODE_ENV === "production") notFound();

  return (
    <main className="mx-auto flex max-w-[1120px] flex-col gap-14 px-8 py-14">
      <header className="flex flex-col gap-3">
        <Logo variant="lockup" height={120} />
        <h1 className="max-w-[620px] text-[44px] font-extrabold leading-[1.03]">
          Design system — Phase 0
        </h1>
        <p className="text-tm-text-2 max-w-[560px] text-sm leading-relaxed">
          Tokens, type and motion for the redesign. Compare against the mocks
          served on{" "}
          <a href="http://localhost:4321" className="text-tm-coral">
            localhost:4321
          </a>
          . No screen is wired yet — that starts in Phase 1.
        </p>
      </header>

      <Section n="01" title="Palette">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {PALETTE.map((c) => (
            <div
              key={c.token}
              className="border-tm-border flex flex-col gap-2 rounded-2xl border bg-card p-3"
            >
              <div
                className="border-tm-hairline h-14 rounded-xl border"
                style={{ background: `var(${c.token})` }}
              />
              <div className="flex flex-col">
                <span className="text-[13px] font-semibold">{c.label}</span>
                <code className="text-tm-text-3 text-[11px]">{c.token}</code>
                <span className="text-tm-text-2 mt-1 text-[11px]">{c.note}</span>
              </div>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap gap-3">
          {[
            ["--tm-gradient", "Brand gradient — wordmark"],
            ["--tm-gradient-cta", "CTA gradient — primary buttons"],
            ["--tm-gradient-avatar", "Avatar gradient"],
          ].map(([tok, label]) => (
            <div key={tok} className="flex flex-col gap-2">
              <div
                className="h-14 w-64 rounded-xl"
                style={{ background: `var(${tok})` }}
              />
              <span className="text-tm-text-2 text-[11px]">{label}</span>
            </div>
          ))}
        </div>
      </Section>

      <Section n="02" title="Type">
        <div className="border-tm-border flex flex-col gap-5 rounded-3xl border bg-card p-7">
          <h1 className="text-[52px] font-extrabold leading-[1.02]">
            Shop the world. Pay in cedis.
          </h1>
          <h2 className="text-[32px] font-bold leading-[1.05]">
            Four steps between a link and your front door.
          </h2>
          <h3 className="text-[22px] font-bold">Your freight box</h3>
          <p className="text-tm-text-2 max-w-[640px] text-sm leading-[1.6]">
            Instrument Sans, 400 weight, for everything that is not a heading.
            Secondary copy sits on Text 2 so it recedes without going grey.
          </p>
          <div className="border-tm-hairline flex items-baseline gap-6 border-t pt-4">
            <span className="tm-nums text-[38px] font-extrabold">
              GH₵5,041.16
            </span>
            <span className="text-tm-text-2 text-sm">
              tabular-nums — digits never shift width as the figure updates
            </span>
          </div>
        </div>
      </Section>

      <Section n="03" title="Shape & controls">
        <div className="flex flex-wrap items-end gap-4">
          {[
            ["rounded-lg", "14px — buttons"],
            ["rounded-2xl", "22px — cards"],
            ["rounded-3xl", "26px — large cards"],
            ["rounded-full", "999px — pills"],
          ].map(([cls, label]) => (
            <div key={cls} className="flex flex-col gap-2">
              <div
                className={`border-tm-border h-20 w-32 border bg-card ${cls}`}
              />
              <span className="text-tm-text-2 text-[11px]">{label}</span>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button className="tm-cta-gradient h-12 rounded-lg px-6 text-sm font-semibold">
            Get landed price
          </button>
          <button className="h-12 rounded-lg bg-primary px-6 text-sm font-semibold text-primary-foreground">
            Add to bag
          </button>
          <button className="border-tm-border h-12 rounded-lg border bg-card px-6 text-sm font-semibold">
            Watch price instead
          </button>
          <span className="border-tm-border text-tm-text-2 flex h-[38px] items-center gap-2 rounded-full border px-3 text-[13px] font-medium">
            <span className="relative inline-flex h-2 w-2">
              <span className="tm-pulse-dot bg-tm-green absolute inset-0 rounded-full" />
              <span className="bg-tm-green absolute inset-0 rounded-full" />
            </span>
            <span className="tm-nums">$1 = GH₵14.43</span>
          </span>
          <span className="bg-tm-green-bg text-tm-green-ink rounded-full px-3 py-1.5 text-xs font-semibold">
            Delivered
          </span>
          <span className="bg-tm-amber-bg rounded-full px-3 py-1.5 text-xs font-semibold text-tm-amber">
            Being purchased
          </span>
        </div>
      </Section>

      <Section n="04" title="Motion">
        <p className="text-tm-text-2 -mt-2 text-sm">
          All 13 keyframes are registered. Easing is{" "}
          <code className="text-[12px]">cubic-bezier(.16,1,.3,1)</code>. Reload
          to replay the entrances. Everything is suppressed under{" "}
          <code className="text-[12px]">prefers-reduced-motion</code>.
        </p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {MOTION.map((m, i) => (
            <div
              key={m.cls}
              className="tm-stagger border-tm-border flex flex-col gap-3 rounded-2xl border bg-card p-4"
              style={{ "--tm-i": i } as React.CSSProperties}
            >
              <div className="bg-tm-tint flex h-16 items-center justify-center overflow-hidden rounded-xl">
                {m.cls === "tm-fill" ? (
                  <div className="h-2.5 w-full px-3">
                    <div className="tm-fill bg-tm-coral h-full rounded-full" />
                  </div>
                ) : m.cls === "tm-words" ? (
                  <span className="tm-words-window text-[17px] font-bold">
                    <span className="tm-words">
                      {["Amazon", "eBay", "Walmart", "Best Buy", "Amazon"].map(
                        (w, k) => (
                          <span key={k} className="tm-word text-tm-coral">
                            {w}
                          </span>
                        ),
                      )}
                    </span>
                  </span>
                ) : m.cls === "tm-pulse-dot" ? (
                  <span className="relative inline-flex h-3 w-3">
                    <span className="tm-pulse-dot bg-tm-green absolute inset-0 rounded-full" />
                    <span className="bg-tm-green absolute inset-0 rounded-full" />
                  </span>
                ) : (
                  <div
                    className={`${m.cls} bg-tm-coral h-9 w-9 rounded-xl`}
                  />
                )}
              </div>
              <div className="flex flex-col">
                <code className="text-[12px] font-semibold">{m.name}</code>
                <span className="text-tm-text-2 text-[11px]">{m.note}</span>
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section n="05" title="Icons">
        <p className="text-tm-text-2 -mt-2 text-sm">
          Phosphor, imported from{" "}
          <code className="text-[12px]">@phosphor-icons/react/ssr</code> — the
          hook-free entry, so icons render in server components. The root barrel
          calls <code className="text-[12px]">useContext</code> and breaks in
          RSC. These all render on the server.
        </p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            {
              w: "duotone" as const,
              title: "duotone",
              note: "feature icons",
              icons: [Package, Receipt, AirplaneTilt, Sparkle],
            },
            {
              w: "fill" as const,
              title: "fill",
              note: "status + active nav",
              icons: [House, Storefront, BookmarkSimple, Path],
            },
            {
              w: "regular" as const,
              title: "regular",
              note: "inline + inactive nav",
              icons: [Tote, BellSimple, LinkSimple, House],
            },
            {
              w: "bold" as const,
              title: "bold",
              note: "arrows inside filled CTAs",
              icons: [ArrowRight, ArrowRight, ArrowRight, ArrowRight],
            },
          ].map((g) => (
            <div
              key={g.title}
              className="border-tm-border flex flex-col gap-3 rounded-2xl border bg-card p-4"
            >
              <div className="text-tm-coral flex items-center gap-4">
                {g.icons.map((Icon, k) => (
                  <Icon key={k} size={26} weight={g.w} />
                ))}
              </div>
              <div className="flex flex-col">
                <code className="text-[12px] font-semibold">{g.title}</code>
                <span className="text-tm-text-2 text-[11px]">{g.note}</span>
              </div>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button className="tm-cta-gradient flex h-12 items-center gap-2 rounded-lg px-6 text-sm font-semibold">
            Get landed price
            <ArrowRight size={17} weight="bold" />
          </button>
          <span className="border-tm-border text-tm-text-2 flex h-[38px] items-center gap-2 rounded-full border px-4 text-[13px] font-medium">
            <BookmarkSimple size={18} />
            Price watch
          </span>
          <span className="flex h-[38px] items-center gap-2 rounded-full bg-card px-4 text-[13px] font-semibold shadow-[0_1px_3px_rgba(43,36,34,.08)]">
            <House size={18} weight="fill" />
            Home
          </span>
        </div>
      </Section>
    </main>
  );
}
