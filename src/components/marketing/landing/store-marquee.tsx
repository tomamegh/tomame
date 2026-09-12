export interface StoreMarqueeProps {
  /** Store names collected from `regions.store_names`. */
  stores: readonly string[];
}

/**
 * The endless store strip beneath the hero.
 *
 * `tmMarquee` translates by -50%, so the list is rendered exactly twice. The
 * spacing lives in each item's padding rather than a flex `gap` — a gap is not
 * part of the last item's box, which would make the halves unequal and put a
 * visible jump at the loop point. The second copy is hidden from assistive
 * tech.
 */
export function StoreMarquee({ stores }: StoreMarqueeProps) {
  if (stores.length === 0) return null;

  const doubled = [...stores, ...stores];

  return (
    <section
      aria-label="Stores we buy from"
      className="relative overflow-hidden border-y border-tm-hairline bg-card py-6"
    >
      {/* Fade the strip into the page edges rather than cutting it off. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 left-0 z-10 w-16 bg-[linear-gradient(90deg,var(--card),transparent)] md:w-28"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 right-0 z-10 w-16 bg-[linear-gradient(270deg,var(--card),transparent)] md:w-28"
      />
      <ul className="tm-marquee flex w-max items-center">
        {doubled.map((store, index) => (
          <li
            key={`${store}-${index}`}
            aria-hidden={index >= stores.length ? true : undefined}
            className="pr-10 text-sm font-bold tracking-[0.14em] whitespace-nowrap text-tm-text-3 uppercase md:pr-14 md:text-base"
          >
            {store}
          </li>
        ))}
      </ul>
    </section>
  );
}
