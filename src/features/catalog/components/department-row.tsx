import Image from "next/image";
import Link from "next/link";

import { imagePosition, type MarketingImage } from "@/config/marketing-images";
import { getMediaOverrides } from "@/db/queries/media-overrides";
import { cn } from "@/lib/utils";
import { departmentIcon } from "./department-icons";
import { departmentImage } from "./department-images";

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
 * options look smaller than they are. So the cells carry a picture and a name,
 * and the honest sentence about what we hold lives in the shelf copy below.
 *
 * WHY PHOTOS, AND WHY AN ICON IS STILL HERE. Each department we have shot gets
 * a photo tile (`department-images.ts`, overridable through `media_overrides`
 * as `dept-<slug>`); a shelf we have not shot — a new category, the synthetic
 * "All categories" pill — gets an icon tile of the same size and shape, so the
 * row never has a hole or a mismatched cell in it.
 *
 * WHY IT SCROLLS SIDEWAYS. A fixed cell width inside an `overflow-x-auto` box
 * is the only shape that cannot widen the page: a wrapping row of
 * variable-width cells produces a ragged block on a narrow screen, and the
 * implicit `1fr` track it used to sit in is exactly the thing that has pushed
 * this app's layouts past the viewport before. On a phone that is one row of
 * portrait tiles; from `md` up it is a two-row grid of landscape tiles flowing
 * sideways, which fits three dozen departments in the height of two cards
 * instead of six rows of them above the products.
 *
 * It is a server component (async only to read the image overrides). Every cell is a `<Link>` because the open
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

export async function DepartmentRow({
  departments,
  preserveScroll = false,
  className,
}: DepartmentRowProps) {
  if (departments.length === 0) return null;

  // Never throws: a failed read is an empty map and every tile keeps its
  // built-in photo.
  const overrides = await getMediaOverrides();
  // A short row stays one line on desktop instead of splitting four cells
  // across two rows of two.
  const twoRows = departments.length > 8;

  return (
    <nav
      aria-label="Shop by department"
      className={cn("flex min-w-0 flex-col gap-2.5", className)}
    >
      <p className="text-[12px] leading-none font-bold tracking-[0.04em] text-tm-text-3 uppercase">
        Shop by department
      </p>

      {/*
        The scroll track. `-mx-1 px-1 py-1` so the focus ring on an edge cell
        is not clipped by the box that makes the scrolling safe. The scrollbar
        is hidden on a phone, where it sits on top of the labels and a swipe is
        the gesture anyway, and shown thin from `md` up, where a mouse wheel
        cannot scroll sideways and the bar is the only handle a desktop user
        has on the departments past the edge.
      */}
      <div
        className={cn(
          "-mx-1 flex min-w-0 snap-x snap-mandatory scroll-px-1 gap-2.5 overflow-x-auto overscroll-x-contain px-1 py-1",
          "[-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
          "md:grid md:auto-cols-[minmax(148px,1fr)] md:grid-flow-col md:gap-3 md:pb-2 md:[scrollbar-width:thin] md:[&::-webkit-scrollbar]:block md:[&::-webkit-scrollbar]:h-1.5 md:[&::-webkit-scrollbar-thumb]:rounded-full md:[&::-webkit-scrollbar-thumb]:bg-tm-border",
          twoRows ? "md:grid-rows-2" : "md:grid-rows-1",
        )}
      >
        {departments.map((department) => (
          <DepartmentCell
            key={department.label}
            department={department}
            image={departmentImage(department.label, overrides)}
            preserveScroll={preserveScroll}
          />
        ))}
      </div>
    </nav>
  );
}

/**
 * One department: a photo under a dark scrim with the name on it, or — for a
 * shelf we hold no photo for — the department's glyph on a warm tint, in the
 * same box.
 *
 * The card itself never moves on hover. The row sits directly above a grid of
 * product cards that lift, and two things jumping under the same pointer pass
 * reads as the page twitching. The motion is kept inside the frame instead: the
 * photo eases in a little, clipped by the card, and only when the viewer has
 * not asked for reduced motion. The open shelf is a solid coral ring and a
 * coral scrim, so it is unmistakable without the row shuffling.
 */
function DepartmentCell({
  department,
  image,
  preserveScroll,
}: {
  department: DepartmentRowItem;
  image: MarketingImage | null;
  preserveScroll: boolean;
}) {
  const active = department.active === true;

  return (
    <Link
      href={department.href}
      // See `preserveScroll` on the props: false here would throw the customer
      // back to the top of the browse screen every time they pick a shelf.
      scroll={!preserveScroll}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group relative isolate block aspect-[4/5] w-[124px] shrink-0 snap-start overflow-hidden rounded-[18px] bg-tm-pill-bg",
        "md:aspect-[4/3] md:w-auto",
        "ring-1 ring-tm-border transition-[box-shadow,transform] duration-200 ease-[var(--tm-ease)] motion-safe:active:scale-[0.97]",
        "hover:shadow-[0_6px_18px_-8px_rgba(43,36,34,0.35)] hover:ring-tm-coral/40",
        "focus-visible:ring-2 focus-visible:ring-tm-coral focus-visible:ring-offset-2 focus-visible:outline-none",
        active && "ring-[2.5px] ring-tm-coral hover:ring-tm-coral",
      )}
    >
      {image ? (
        <PhotoFace image={image} active={active} />
      ) : (
        <IconFace label={department.label} active={active} />
      )}

      {/*
        No truncation: the cell is a fixed box, so a three-word department
        wraps inside it rather than stretching it. Truncating instead is what
        quietly widened this app's phone layouts before — a truncated label in
        a track that can still grow reports a width it never shows.
      */}
      <span
        className={cn(
          "absolute inset-x-0 bottom-0 z-10 px-2.5 pb-2.5 text-[12.5px] leading-[1.2] font-semibold text-balance",
          image ? "text-white [text-shadow:0_1px_2px_rgba(0,0,0,0.35)]" : "text-tm-ink",
          active && !image && "font-bold text-tm-coral-strong",
        )}
      >
        {department.label}
      </span>
    </Link>
  );
}

function PhotoFace({
  image,
  active,
}: {
  image: MarketingImage;
  active: boolean;
}) {
  return (
    <>
      <Image
        src={image.src}
        alt={image.alt}
        fill
        // Tiles are 124px on a phone and 148–200px from `md` up; next/image picks
        // the 1x/2x candidate from these.
        sizes="(min-width: 768px) 200px, 124px"
        loading="lazy"
        className="-z-10 object-cover transition-transform duration-500 ease-[var(--tm-ease)] motion-safe:group-hover:scale-[1.06]"
        // A runtime value from `media_overrides`, so it cannot be a class.
        style={{ objectPosition: imagePosition(image) }}
      />
      <span
        aria-hidden
        className={cn(
          "absolute inset-0 -z-10 bg-gradient-to-t transition-colors",
          active
            ? "from-tm-coral-strong/90 via-tm-coral/35 to-transparent"
            : "from-black/75 via-black/20 to-transparent",
        )}
      />
    </>
  );
}

function IconFace({ label, active }: { label: string; active: boolean }) {
  const Icon = departmentIcon(label);
  return (
    <span
      aria-hidden
      className={cn(
        "absolute inset-0 -z-10 flex items-start justify-start p-2.5",
        active
          ? "bg-tm-tint"
          : "bg-[linear-gradient(160deg,var(--tm-tint),var(--tm-pill-bg))]",
      )}
    >
      <span
        className={cn(
          "flex size-10 items-center justify-center rounded-[12px] transition-colors",
          active
            ? "bg-tm-coral text-white"
            : "bg-card text-tm-coral shadow-[0_1px_2px_rgba(43,36,34,0.08)] group-hover:bg-tm-coral group-hover:text-white",
        )}
      >
        <Icon
          weight={active ? "fill" : "duotone"}
          className="size-[21px]"
          aria-hidden
        />
      </span>
    </span>
  );
}
