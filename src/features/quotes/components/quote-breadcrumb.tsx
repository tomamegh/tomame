import Link from "next/link";
import { ArrowLeft, CheckCircle, LinkSimple } from "@phosphor-icons/react/ssr";

import { formatRelativeTime } from "@/features/app-home/components/format";
import { formatProductUrlLabel } from "./format";

export interface QuoteBreadcrumbProps {
  productUrl: string;
  /** `extraction_cache.result.fetched_at` — when we last read the listing. */
  fetchedAt: string;
  /** The instant the quote landed in the browser, so the clause is stable. */
  now: Date;
}

/**
 * "Home / amazon.com/… / Read 2 min ago".
 *
 * The freshness clause is the screen's quiet claim that these numbers came off
 * the real listing rather than a cache of unknown age, so it prints the actual
 * `fetched_at` and disappears entirely when that timestamp is unusable.
 */
export function QuoteBreadcrumb({
  productUrl,
  fetchedAt,
  now,
}: QuoteBreadcrumbProps) {
  const read = formatRelativeTime(fetchedAt, now);

  return (
    <nav
      aria-label="Breadcrumb"
      className="tm-in flex flex-wrap items-center gap-3 text-[13px] leading-none font-medium text-tm-text-3 [animation-duration:0.5s]"
    >
      <Link
        href="/app"
        className="flex items-center gap-1.5 rounded-md text-tm-ink transition-colors hover:text-tm-coral focus-visible:ring-2 focus-visible:ring-tm-coral focus-visible:ring-offset-2 focus-visible:outline-none"
      >
        <ArrowLeft className="size-4 shrink-0" aria-hidden />
        Home
      </Link>

      <span aria-hidden>/</span>

      <span className="flex min-w-0 max-w-[520px] items-center gap-1.5 overflow-hidden rounded-lg border border-tm-border bg-card px-2.5 py-1.5 whitespace-nowrap text-tm-text-2">
        <LinkSimple className="size-4 shrink-0" aria-hidden />
        <span className="truncate">{formatProductUrlLabel(productUrl)}</span>
      </span>

      {read && (
        <span className="inline-flex items-center gap-1.5 font-semibold text-tm-green">
          <CheckCircle weight="fill" className="size-4 shrink-0" aria-hidden />
          Read {read}
        </span>
      )}
    </nav>
  );
}
