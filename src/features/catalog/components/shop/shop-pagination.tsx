import Link from "next/link";
import { CaretLeft, CaretRight } from "@phosphor-icons/react/ssr";

import { cn } from "@/lib/utils";
import { paginationWindow, shopHref, type ShopState } from "../../shop-params";

/**
 * Numbered pages with previous and next. Server-rendered links: `?page=` is in
 * the address, so the back button pages backwards and page 3 can be shared.
 *
 * The phone gets the same pager with the numbers folded into "Page 2 of 5":
 * the arrows are full-size touch targets and the row can never outgrow 390px.
 */
export function ShopPagination({
  state,
  pageCount,
}: {
  state: ShopState;
  pageCount: number;
}) {
  if (pageCount <= 1) return null;
  const page = Math.min(state.page, pageCount);
  const pages = paginationWindow(page, pageCount);

  return (
    <nav
      aria-label="Pages"
      className="flex min-w-0 items-center justify-center gap-2 pt-2"
    >
      <PageArrow
        state={state}
        to={page - 1}
        disabled={page <= 1}
        direction="prev"
      />

      <p className="tm-nums px-2 text-[13.5px] font-semibold text-tm-text-2 sm:hidden">
        Page {page} of {pageCount}
      </p>

      <ol className="hidden items-center gap-1.5 sm:flex">
        {pages.map((p, i) =>
          p == null ? (
            <li
              key={`gap-${i}`}
              aria-hidden
              className="w-6 text-center text-tm-text-3"
            >
              …
            </li>
          ) : (
            <li key={p}>
              <Link
                href={shopHref(state, { page: p })}
                scroll={false}
                aria-current={p === page ? "page" : undefined}
                aria-label={`Page ${p}`}
                className={cn(
                  "tm-nums flex size-10 items-center justify-center rounded-[12px] text-[14px] font-semibold transition-colors",
                  "focus-visible:ring-2 focus-visible:ring-tm-coral focus-visible:ring-offset-2 focus-visible:outline-none",
                  p === page
                    ? "bg-tm-ink text-white"
                    : "border-[1.5px] border-tm-border bg-card text-tm-ink hover:border-tm-coral hover:text-tm-coral",
                )}
              >
                {p}
              </Link>
            </li>
          ),
        )}
      </ol>

      <PageArrow
        state={state}
        to={page + 1}
        disabled={page >= pageCount}
        direction="next"
      />
    </nav>
  );
}

function PageArrow({
  state,
  to,
  disabled,
  direction,
}: {
  state: ShopState;
  to: number;
  disabled: boolean;
  direction: "prev" | "next";
}) {
  const label = direction === "prev" ? "Previous" : "Next";
  const Icon = direction === "prev" ? CaretLeft : CaretRight;
  const classes =
    "inline-flex h-10 items-center gap-1.5 rounded-[12px] border-[1.5px] border-tm-border bg-card px-3.5 text-[13.5px] font-semibold";

  if (disabled) {
    return (
      <span aria-disabled className={cn(classes, "text-tm-text-3 opacity-60")}>
        {direction === "prev" && (
          <Icon weight="bold" className="size-3.5" aria-hidden />
        )}
        {label}
        {direction === "next" && (
          <Icon weight="bold" className="size-3.5" aria-hidden />
        )}
      </span>
    );
  }
  return (
    <Link
      href={shopHref(state, { page: to })}
      scroll={false}
      rel={direction}
      className={cn(
        classes,
        "text-tm-ink transition-colors hover:border-tm-coral hover:text-tm-coral focus-visible:ring-2 focus-visible:ring-tm-coral focus-visible:ring-offset-2 focus-visible:outline-none",
      )}
    >
      {direction === "prev" && (
        <Icon weight="bold" className="size-3.5" aria-hidden />
      )}
      {label}
      {direction === "next" && (
        <Icon weight="bold" className="size-3.5" aria-hidden />
      )}
    </Link>
  );
}
