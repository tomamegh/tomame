import Link from "next/link";

import { cn } from "@/lib/utils";
import { MARKETING_NAV_ITEMS } from "./links";
import { MarketingMobileMenu } from "./marketing-mobile-menu";
import { MarketingNavLinks } from "./marketing-nav-links";
import { FOCUS_RING } from "./styles";
import type { MarketingNavItem } from "./types";
import { Logo } from "@/components/brand/logo";

export interface MarketingNavProps {
  /** Override the destinations; defaults to the five in the design. */
  items?: readonly MarketingNavItem[];
  /**
   * Swaps the Sign in / Get started pair for a single dashboard link. The
   * parent resolves the session — this component never touches Supabase.
   */
  isAuthenticated?: boolean;
  className?: string;
}

/**
 * Shared marketing nav — design/TmMarketingNav.dc.html.
 *
 * 76px tall, white, 1px hairline underline, gradient wordmark, 28px link gap,
 * and a pair of 40px pill actions. Server component: only the active-link
 * highlight and the mobile drawer are client-side.
 */
export function MarketingNav({
  items = MARKETING_NAV_ITEMS,
  isAuthenticated = false,
  className,
}: MarketingNavProps) {
  return (
    <header
      className={cn(
        "tm-safe-top sticky top-0 z-50 border-b border-tm-hairline bg-card",
        className,
      )}
    >
      <nav
        aria-label="Primary"
        className="mx-auto flex h-16 max-w-[1280px] items-center justify-between gap-4 px-5 md:h-[76px] md:px-8"
      >
        <Link
          href="/"
          aria-label="Tomame home"
          className={cn("rounded-sm", FOCUS_RING)}
        >
          {/* The link already announces "Tomame — home", so the image is
              decorative. One element sized by CSS, not two with one hidden —
              a hidden next/image still downloads. */}
          {/* One element, not one per breakpoint: a hidden next/image still
              downloads, so the md:hidden pair fetched the artwork twice. 22px
              suits both the 64px mobile bar and the 76px desktop one. */}
          <Logo variant="horizontal" height={22} decorative priority />
        </Link>

        <MarketingNavLinks items={items} />

        <div className="hidden items-center gap-2 lg:flex">
          {isAuthenticated ? (
            <Link
              href="/app"
              className={cn(
                "tm-cta-gradient inline-flex h-10 items-center rounded-full px-[18px] text-sm font-semibold transition-[transform,box-shadow] duration-200 hover:-translate-y-px hover:shadow-[0_6px_20px_-6px_rgba(244,63,94,0.5)]",
                FOCUS_RING,
              )}
            >
              Go to dashboard
            </Link>
          ) : (
            <>
              <Link
                href="/auth/login"
                className={cn(
                  "inline-flex h-10 items-center rounded-full px-4 text-sm font-semibold text-tm-ink transition-colors duration-200 hover:bg-tm-tint",
                  FOCUS_RING,
                )}
              >
                Sign in
              </Link>
              <Link
                href="/auth/signup"
                className={cn(
                  "tm-cta-gradient inline-flex h-10 items-center rounded-full px-[18px] text-sm font-semibold transition-[transform,box-shadow] duration-200 hover:-translate-y-px hover:shadow-[0_6px_20px_-6px_rgba(244,63,94,0.5)]",
                  FOCUS_RING,
                )}
              >
                Get started
              </Link>
            </>
          )}
        </div>

        <MarketingMobileMenu items={items} isAuthenticated={isAuthenticated} />
      </nav>
    </header>
  );
}
