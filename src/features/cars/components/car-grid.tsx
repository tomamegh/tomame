import { cn } from "@/lib/utils";
import { CarCard } from "./car-card";
import type { CarWithCover } from "../services/cars.service";
import type { CarEnquiryRow } from "../types";

export interface CarGridProps {
  /** The viewer's live enquiries, keyed by listing id. Empty when signed out. */
  enquiries?: ReadonlyMap<string, CarEnquiryRow>;
  cars: readonly CarWithCover[];
  /** The render's ISO day, so every ribbon in the grid agrees about what has landed. */
  today: string;
  className?: string;
}

/**
 * The forecourt.
 *
 * `minmax(0,1fr)` on every track, never a bare `1fr`. An implicit or `1fr`
 * column is `minmax(auto,1fr)`, whose floor is its widest child's min-content —
 * and on 2026-09-13 exactly that widened three of this app's screens past the
 * phone viewport. The cards clamp and wrap rather than truncate, but the zero
 * floor is what makes that hold.
 *
 * Two up from `sm` and three from `xl`, not four: a car card carries a 16:10
 * photograph and two action buttons, and a quarter of 1280px is not enough
 * width for "Buy now" and "Make an offer" to sit side by side without each of
 * them truncating.
 */
export function CarGrid({ cars, today, enquiries, className }: CarGridProps) {
  if (cars.length === 0) return null;

  return (
    <ul
      className={cn(
        "grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4",
        "sm:grid-cols-[repeat(2,minmax(0,1fr))] xl:grid-cols-[repeat(3,minmax(0,1fr))]",
        className,
      )}
    >
      {cars.map((entry) => (
        <CarCard
          key={entry.car.id}
          entry={entry}
          today={today}
          standingEnquiry={enquiries?.get(entry.car.id) ?? null}
        />
      ))}
    </ul>
  );
}
