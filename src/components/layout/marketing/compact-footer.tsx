import Link from "next/link";

import { Logo } from "@/components/brand/logo";
import { cn } from "@/lib/utils";
import { FOCUS_RING } from "./styles";

/** The links every screen keeps within reach. All are real routes. */
const LINKS = [
  { label: "Fees", href: "/fees" },
  { label: "Where we buy", href: "/where-we-buy" },
  { label: "Track an order", href: "/track" },
  { label: "FAQ", href: "/faq" },
  { label: "Policies", href: "/policies" },
] as const;

export interface CompactFooterProps {
  className?: string;
}

/**
 * The marketing footer's last row, for the app and the sign-in screens: the
 * same mark, the same links and the same line, so the site ends the same way
 * everywhere. Static: no settings read, so it costs the app shell nothing.
 */
export function CompactFooter({ className }: CompactFooterProps) {
  return (
    <footer className={cn("border-t border-border text-[13px] text-muted-foreground", className)}>
      <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-3 px-5 py-6 md:flex-row md:items-center md:justify-between md:px-8">
        <div className="flex items-center gap-3">
          <Link href="/" aria-label="Tomame home" className={cn("rounded-sm", FOCUS_RING)}>
            <Logo variant="horizontal" height={16} decorative />
          </Link>
          <span>© {new Date().getFullYear()} Tomame</span>
        </div>
        <nav aria-label="Footer">
          <ul className="flex flex-wrap gap-x-4 gap-y-1">
            {LINKS.map((link) => (
              <li key={link.href}>
                <Link href={link.href} className={cn("inline-flex min-h-8 items-center rounded-sm transition-colors hover:text-foreground", FOCUS_RING)}>
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </footer>
  );
}
