import Link from "next/link";

import { cn } from "@/lib/utils";

/**
 * A row of filter pills that are LINKS, not buttons.
 *
 * The filter lives in the URL, so a filtered view is a thing an admin can
 * bookmark, send to a colleague, or reach from a sidebar badge — and the page
 * stays a server component, because there is no client state to hold. The old
 * orders and deliveries tables each kept their filter in a `useState` inside a
 * client island, which meant the one view anybody actually wanted to share
 * ("everything waiting on review") had no address at all.
 *
 * Shared by the orders and deliveries screens. It lives under
 * `features/orders/components` rather than in the admin kit because the kit is
 * shared with four other slices of this redesign and a new shape there needs
 * their agreement; if it earns a place in the kit later, moving it is a rename.
 */

export interface AdminFilterPill {
  label: string;
  /** Absolute href including the query string — the caller owns URL assembly. */
  href: string;
  active: boolean;
  /** A figure printed after the label. Omitted entirely when null, never shown as "0". */
  count?: number | null;
}

export function AdminFilterPills({
  pills,
  label,
}: {
  pills: readonly AdminFilterPill[];
  /** Names the group for a screen reader: "Filter orders by status". */
  label: string;
}) {
  return (
    <nav aria-label={label} className="flex flex-wrap items-center gap-1.5">
      {pills.map((pill) => (
        <Link
          key={pill.href}
          href={pill.href}
          aria-current={pill.active ? "page" : undefined}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12.5px] leading-none font-semibold transition-colors",
            pill.active
              ? "border-tm-coral/40 bg-tm-pill-bg text-tm-coral-strong"
              : "border-tm-border bg-card text-tm-text-2 hover:border-tm-coral/30 hover:text-tm-ink",
          )}
        >
          {pill.label}
          {pill.count != null && pill.count > 0 ? (
            <span
              className={cn(
                "tm-nums rounded-full px-1.5 py-0.5 text-[11px] leading-none font-bold",
                pill.active ? "bg-card text-tm-coral-strong" : "bg-tm-paper text-tm-text-3",
              )}
            >
              {pill.count}
            </span>
          ) : null}
        </Link>
      ))}
    </nav>
  );
}

/**
 * A search box that works without JavaScript.
 *
 * A plain GET form: submitting navigates, the server re-renders, and the term
 * stays in the URL with the rest of the filter. No client component, no
 * debounce, no stale query cache.
 */
export function AdminSearchForm({
  action,
  name = "q",
  defaultValue,
  placeholder,
  label,
  hidden = {},
}: {
  action: string;
  name?: string;
  defaultValue?: string;
  placeholder: string;
  label: string;
  /** Filters to carry through the submit, so searching does not silently drop them. */
  hidden?: Record<string, string | undefined>;
}) {
  return (
    <form action={action} method="get" role="search" className="flex items-center gap-2">
      {Object.entries(hidden).map(([key, value]) =>
        value ? <input key={key} type="hidden" name={key} value={value} /> : null,
      )}
      <label htmlFor={`admin-search-${name}`} className="sr-only">
        {label}
      </label>
      <input
        id={`admin-search-${name}`}
        type="search"
        name={name}
        defaultValue={defaultValue}
        placeholder={placeholder}
        className="h-9 w-[190px] rounded-full border border-tm-border bg-card px-3.5 text-[13px] font-medium text-tm-ink placeholder:text-tm-text-3 focus:border-tm-coral/40 focus:outline-none sm:w-[230px]"
      />
      <button
        type="submit"
        className="h-9 rounded-full border border-tm-border px-3.5 text-[12.5px] font-semibold text-tm-text-2 transition-colors hover:border-tm-coral/30 hover:text-tm-ink"
      >
        Search
      </button>
    </form>
  );
}
