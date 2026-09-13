import Link from "next/link";
import { Check } from "@phosphor-icons/react/ssr";

import { Logo } from "@/components/brand/logo";
import { DEFAULT_MARKETING_TAGLINE } from "@/components/layout/marketing/marketing-footer";
import { formatPaymentChannels } from "@/components/layout/marketing/links";
import { getMarketingSettings } from "@/features/marketing/services";

/**
 * The sign-in / sign-up shell.
 *
 * TWO THINGS WERE WRONG HERE. The Tomame logo was not on it at all — the panel
 * said "Tomame" as an `<h2>` in plain bold text, so the first screen a customer
 * ever sees carried no brand mark. And the copy beside it was invented: "Trusted
 * by 5,000+ businesses", "50+ countries supported", "Enterprise-grade security",
 * plus four fake avatars. Tomame ships to one country from one lane and has no
 * such customer base; a login page is the last place to make a claim that cannot
 * be backed (CLAUDE.md's "nothing static" rule applies to promises as much as to
 * data).
 *
 * So the panel now carries the real lockup and three statements the product
 * actually keeps, and the payment channels come from `site_settings` — the same
 * row the footer and the bag's pay selector read, so adding a network is an
 * admin edit and this screen follows.
 */

/**
 * What the left panel promises. Every line is a rule the platform enforces
 * server-side, not marketing: the landed total is computed before payment
 * (`lib/pricing/calculator.ts`), full pre-payment is required before any order
 * is worked (CLAUDE.md), and the refund is the published returns policy.
 */
const PROMISES = [
  "The full landed price in cedis, before you pay",
  "Nothing is charged until you approve the quote",
  "Refunded in full if we cannot source it",
] as const;

export default async function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const settings = await getMarketingSettings();
  const channels = formatPaymentChannels(settings.paymentChannels);

  return (
    <main className="relative flex min-h-screen flex-col overflow-hidden lg:flex-row">
      {/* ── Branded panel (desktop) ─────────────────────────────────────── */}
      <div className="relative hidden overflow-hidden bg-[image:var(--tm-gradient)] lg:flex lg:w-[45%]">
        {/* Soft depth, not decoration for its own sake — the artwork sits on it. */}
        <div className="pointer-events-none absolute top-[-10%] left-[-10%] h-[60%] w-[60%] rounded-full bg-white/10" />
        <div className="pointer-events-none absolute right-[-10%] bottom-[-15%] h-[50%] w-[50%] rounded-full bg-white/10" />

        <div className="relative z-10 flex w-full flex-col justify-between p-10 xl:p-12">
          <Link href="/" aria-label="Tomame — home" className="w-fit rounded-sm">
            <Logo variant="wordmark" height={34} decorative priority />
          </Link>

          <div className="flex flex-col gap-7">
            <h1 className="font-display text-[34px] leading-[1.05] font-bold tracking-[-0.02em] text-white xl:text-[42px]">
              Shop the world.
              <br />
              Pay in cedis.
            </h1>
            <p className="max-w-sm text-base leading-[1.5] text-white/80">
              {DEFAULT_MARKETING_TAGLINE}
            </p>

            <ul className="flex flex-col gap-3">
              {PROMISES.map((promise) => (
                <li key={promise} className="flex items-center gap-3">
                  <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-white/20">
                    <Check weight="bold" className="size-3 text-white" aria-hidden />
                  </span>
                  <span className="text-sm leading-[1.4] text-white/85">{promise}</span>
                </li>
              ))}
            </ul>
          </div>

          {/*
            Was four fake avatars and "Trusted by 5,000+ businesses". This is the
            real payment channel list from `site_settings.payment_channels`, and
            it disappears rather than inventing one if the row cannot be read.
          */}
          {channels && (
            <p className="text-sm leading-[1.5] text-white/70">
              Pay with <span className="font-semibold text-white">{channels}</span>
            </p>
          )}
        </div>
      </div>

      {/* ── Branded header (mobile) ─────────────────────────────────────── */}
      <div className="flex flex-col items-center gap-2 bg-[image:var(--tm-gradient)] px-6 py-6 text-center lg:hidden">
        <Link href="/" aria-label="Tomame — home" className="rounded-sm">
          <Logo variant="wordmark" height={26} decorative priority />
        </Link>
        <p className="text-sm leading-[1.4] text-white/80">
          Shop the world. Pay in cedis.
        </p>
      </div>

      {/* ── Form ────────────────────────────────────────────────────────── */}
      <div className="flex flex-1 items-center justify-center bg-card px-8 py-10 lg:px-12 lg:py-14">
        <div className="w-full max-w-md">{children}</div>
      </div>
    </main>
  );
}
