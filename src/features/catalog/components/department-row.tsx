import Link from "next/link";

import { cn } from "@/lib/utils";
import { departmentIcon } from "./department-icons";

/**
 * "Shop by department" — the one row of shelves, shared by every screen that
 * offers them.
 *
 * WHY ONE COMPONENT AND NOT TWO. Home and the Buy-for-me browse screen both
 * offer the same shelves, derived from the same `catalog_categories` rows, and
 * until now each drew its own row of pills. They had already drifted — one knew
 * how to show the open shelf and the other did not — and a customer who taps a
 * department on Home lands on a screen where the same list looks like a
 * different control. There is one row now, and the two callers differ only in
 * the hrefs they hand it.
 *
 * WHY THERE IS NO NUMBER ON A CELL. There used to be a count badge on every
 * shelf, and it was the size of our scrape rather than the size of the shop:
 * "Electronics 14" tells a customer we have fourteen electronics, which is not
 * true of what Tomame can buy — the catalogue is a head start, and the paste
 * box behind it takes any listing from any store we support. A small number
 * beside a department made the shop look empty and made the customer's real
 * options look smaller than they are. So the cells carry a glyph and a name,
 * and the honest sentence about what we hold lives in the shelf copy below.
 *
 * WHY IT SCROLLS SIDEWAYS ON A PHONE. A fixed cell width inside an
 * `overflow-x-auto` box is the only shape that cannot widen the page: a
 * wrapping row of variable-width cells produces a ragged block on a narrow
 * screen, and the implicit `1fr` track it used to sit in is exactly the thing
 * that has pushed this app's layouts past the viewport before. From `sm` up
 * there is room for the whole row, so the cells share the width instead.
 *
 * It is a plain server component. Every cell is a `<Link>` because the open
 * shelf lives in the address bar: the back button walks back through the
 * departments somebody looked at, and a department is a thing they can send to
 * a friend.
 */

export interface DepartmentRowItem {
  /** The shelf's own name, exactly as the catalogue stored it. Never rewritten. */
  label: string;
  /** Absolute href including the query string: the caller owns URL assembly. */
  href: string;
  /** The open shelf. Optional because Home has no open shelf to mark. */
  active?: boolean;
}

export interface DepartmentRowProps {
  departments: readonly DepartmentRowItem[];
  /**
   * True when pressing a department stays on THIS screen and only swaps the
   * shelf below — the browse panel, where the href is the same route with a
   * different `?category=`.
   *
   * WHY IT MATTERS. Next's `<Link>` scrolls to the top of the document on every
   * navigation, which is right when the destination is a different page and
   * plainly wrong when it is the same one: the customer reaches down to the
   * department row, taps Phones, and is thrown back above the heading, the mode
   * switch and the search box, having to scroll down again to see the shelf
   * they just asked for. Kelvin: "anytime I hit a category the page scrolls to
   * the top and I have to scroll back down."
   *
   * Home leaves it false ON PURPOSE. There the row's hrefs point at
   * `/app/orders/new`, a different screen, and arriving at a new page already
   * scrolled halfway down it is its own kind of broken.
   */
  preserveScroll?: boolean;
  className?: string;
}

export function DepartmentRow({
  departments,
  preserveScroll = false,
  className,
}: DepartmentRowProps) {
  if (departments.length === 0) return null;

  return (
    <nav
      aria-label="Shop by department"
      className={cn("flex min-w-0 flex-col gap-2", className)}
    >
      <p className="text-[12px] leading-none font-bold tracking-[0.04em] text-tm-text-3 uppercase">
        Shop by department
      </p>

      {/*
        The scroll track, at EVERY width rather than only on a phone. The browse
        screen offers every shelf the catalogue holds, which is however many the
        scraper has produced — twenty departments sharing a desktop row would be
        twenty 60px cells with their names broken across three lines. So the
        cells share the width when they comfortably can (`sm:flex-1` against a
        floor of `sm:min-w-[104px]`) and the row scrolls when they cannot,
        instead of the page growing to fit them.

        `-mx-1 px-1` so a focus ring on the first or last cell is not clipped by
        the box that makes the scrolling safe, and the scrollbar itself is
        hidden because on a phone it sits on top of the labels.
      */}
      <div className="-mx-1 flex min-w-0 snap-x gap-2 overflow-x-auto overscroll-x-contain px-1 pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {departments.map((department) => (
          <DepartmentCell
            key={department.label}
            department={department}
            preserveScroll={preserveScroll}
          />
        ))}
      </div>
    </nav>
  );
}

/**
 * One department.
 *
 * Nothing moves on hover — no lift, no scale. The row sits directly above a
 * grid of product cards that do move, and two things reacting to the same
 * pointer pass reads as the page twitching. The warmth is carried by colour
 * alone: the border, the label and the tile all move towards the coral, and the
 * open shelf goes the whole way to a solid coral tile so it is unmistakable
 * without needing the row to shuffle.
 */
function DepartmentCell({
  department,
  preserveScroll,
}: {
  department: DepartmentRowItem;
  preserveScroll: boolean;
}) {
  const Icon = departmentIcon(department.label);
  const active = department.active === true;

  return (
    <Link
      href={department.href}
      // See `preserveScroll` on the props: false here would throw the customer
      // back to the top of the browse screen every time they pick a shelf.
      scroll={!preserveScroll}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group flex h-[98px] w-[96px] shrink-0 snap-start flex-col items-center justify-center gap-[9px] rounded-[18px] border-[1.5px] px-2",
        "transition-colors focus-visible:ring-2 focus-visible:ring-tm-coral focus-visible:ring-offset-2 focus-visible:outline-none",
        "sm:w-auto sm:min-w-[104px] sm:flex-1 sm:basis-0",
        active
          ? "border-tm-coral/35 bg-tm-tint"
          : "border-tm-border bg-card hover:border-tm-coral/30",
      )}
    >
      <span
        className={cn(
          "flex size-[42px] shrink-0 items-center justify-center rounded-[13px] transition-colors",
          active
            ? "bg-tm-coral text-white"
            : "bg-tm-pill-bg text-tm-text-3 group-hover:bg-tm-tint group-hover:text-tm-coral",
        )}
      >
        <Icon
          weight={active ? "fill" : "duotone"}
          className="size-[21px]"
          aria-hidden
        />
      </span>

      {/*
        `text-center` with a hard `w-full` and no truncation: the cell is fixed
        width, so a two-word department wraps onto its second line inside the
        cell rather than stretching it. Truncating instead is what quietly
        widened this app's phone layouts before — a truncated label in a track
        that can still grow reports a width it never shows.
      */}
      <span
        className={cn(
          "w-full text-center text-[12px] leading-[1.2] font-semibold transition-colors",
          active
            ? "font-bold text-tm-coral-strong"
            : "text-tm-text-2 group-hover:text-tm-ink",
        )}
      >
        {department.label}
      </span>
    </Link>
  );
}
