import { cn } from "@/lib/utils";
import type { CatalogProduct } from "../types";
import { CatalogProductCard } from "./catalog-product-card";

/**
 * The grid of results.
 *
 * The single-column track below `sm` spells its own zero floor out rather than
 * leaning on the numbered utility: an implicit grid column's floor is its
 * content's min-content width, and a product title clamped to two lines still
 * reports its longest word as that minimum. Without the zero floor one card
 * widens the whole page past the phone. Tailwind's numbered column utilities
 * already carry the same floor, so the wider breakpoints are safe as written.
 */
export function CatalogResultsGrid({
  results,
  now,
  className,
}: {
  results: readonly CatalogProduct[];
  now: Date;
  className?: string;
}) {
  return (
    <ul
      className={cn(
        "grid grid-cols-[minmax(0,1fr)] gap-3.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4",
        className,
      )}
    >
      {results.map((product) => (
        <CatalogProductCard key={product.id} product={product} now={now} />
      ))}
    </ul>
  );
}
