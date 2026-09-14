import { MagnifyingGlass } from "@phosphor-icons/react/ssr";

import { CATALOG_SEARCH } from "@/config/catalog";
import { cn } from "@/lib/utils";

export interface CatalogSearchFieldProps {
  /** What is in the address bar, so a shared link reopens with its own term. */
  defaultValue?: string;
  className?: string;
}

/**
 * The search box, and the whole point of the screen.
 *
 * A plain GET form to `/app/products`: submitting navigates, the server
 * re-renders, and the term stays in the URL. That is what makes a search
 * shareable and the back button honest, and it is why this screen needs no
 * client component at all. The same reasoning as `AdminSearchForm`, applied to
 * a customer-facing search rather than an admin filter.
 *
 * `maxLength` matches what the server accepts, so the field cannot compose a
 * query the search would reject.
 */
export function CatalogSearchField({
  defaultValue,
  className,
}: CatalogSearchFieldProps) {
  return (
    <form
      action="/app/products"
      method="get"
      role="search"
      className={cn("flex w-full min-w-0 flex-col gap-2.5 sm:flex-row", className)}
    >
      <label htmlFor="catalog-search" className="sr-only">
        Search products we have already priced
      </label>

      <div className="relative flex min-w-0 flex-1 items-center">
        <MagnifyingGlass
          weight="bold"
          className="pointer-events-none absolute left-4 size-[18px] text-tm-text-3"
          aria-hidden
        />
        <input
          id="catalog-search"
          type="search"
          name="q"
          defaultValue={defaultValue}
          autoComplete="off"
          maxLength={CATALOG_SEARCH.maxQueryLength}
          placeholder="wireless earbuds, air fryer, laptop stand"
          className={cn(
            "h-[52px] w-full min-w-0 rounded-[16px] border-[1.5px] border-tm-border bg-card pr-4 pl-11",
            "text-[15px] font-medium text-tm-ink placeholder:text-tm-text-3",
            "focus:border-tm-coral focus:outline-none",
          )}
        />
      </div>

      <button
        type="submit"
        className="tm-cta-gradient inline-flex h-[52px] shrink-0 items-center justify-center rounded-[16px] px-6 text-[15px] leading-none font-bold text-white focus-visible:ring-2 focus-visible:ring-tm-coral focus-visible:ring-offset-2 focus-visible:outline-none"
      >
        Search
      </button>
    </form>
  );
}
