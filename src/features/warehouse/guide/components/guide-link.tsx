import Link from "next/link";
import { CircleHelpIcon } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * "Learn how" — a quiet link from a working screen to its chapter of the
 * operator guide (081). Server-safe; `print:hidden` so it never lands on a label.
 */
export function GuideLink({
  section,
  children = "Learn how",
  className,
  floating = false,
}: {
  section: string;
  children?: React.ReactNode;
  className?: string;
  /** Pinned to the corner of a chrome-less page, like the label page. */
  floating?: boolean;
}) {
  return (
    <Link
      href={`/warehouse/guide#${section}`}
      className={cn(
        "inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-[13px] font-semibold text-tm-text-2 transition-colors hover:bg-tm-hairline hover:text-tm-ink focus-visible:ring-2 focus-visible:ring-tm-coral/40 focus-visible:outline-none print:hidden",
        floating && "fixed right-4 bottom-4 z-40 border border-tm-border bg-card shadow-[0_12px_28px_-16px_rgba(43,36,34,.5)] hover:bg-card",
        className,
      )}
    >
      <CircleHelpIcon className="size-4" aria-hidden />
      {children}
    </Link>
  );
}
