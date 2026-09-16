import { cn } from "@/lib/utils";
import { formatEta, formatMileage, originLabel } from "../format";
import type { CarListingView } from "../types";
import { bodyTypeLabel, drivetrainLabel, fuelLabel, transmissionLabel } from "./labels";

export interface CarSpecTableProps {
  car: CarListingView;
  className?: string;
}

interface Spec {
  label: string;
  value: string;
  /** Rendered in the tabular figures face: an odometer reading, a year, a VIN. */
  nums?: boolean;
}

/**
 * Everything we know about the vehicle, and nothing we do not.
 *
 * EVERY NULLABLE COLUMN IS OMITTED RATHER THAN DEFAULTED. Most of this table is
 * nullable in migration 067 — mileage, body type, drivetrain, colour, VIN,
 * vessel, sail date, ETA — and each of them is nullable because the paperwork
 * for a car genuinely arrives in pieces. A row reading "Mileage —" or, worse,
 * "Mileage 0 mi" is not an empty field, it is a claim about a car somebody is
 * deciding whether to spend six figures on. So the row is not drawn, and the
 * table is however long the truth is.
 *
 * MILEAGE IS NEVER CONVERTED — `formatMileage` prints the reading in the unit it
 * was taken in. A Japanese import reads 80,000 km and an American one reads
 * 80,000 mi; converting would produce a number that is on no odometer anywhere
 * and that the customer cannot check against the vehicle when it lands.
 *
 * A `<dl>`, not a `<table>`. These are name/value pairs about one thing, which
 * is what a description list is; a table would promise columns that mean
 * something across rows, and would need a scroll container at 390px to keep its
 * own promise. The list reflows to one column on a phone instead.
 */
export function CarSpecTable({ car, className }: CarSpecTableProps) {
  const specs: Spec[] = [];

  const push = (label: string, value: string | null | undefined, nums = false) => {
    const trimmed = value?.trim();
    if (trimmed) specs.push({ label, value: trimmed, nums });
  };

  push("Year", String(car.year), true);
  push("Mileage", formatMileage(car.mileage, car.mileage_unit), true);
  push("Body", car.body_type ? bodyTypeLabel(car.body_type) : null);
  push("Fuel", fuelLabel(car.fuel));
  push("Transmission", transmissionLabel(car.transmission));
  push("Drivetrain", car.drivetrain ? drivetrainLabel(car.drivetrain) : null);
  push("Exterior colour", car.exterior_colour);
  push("VIN", car.vin, true);
  push("Shipping from", originLabel(car.origin_country));
  push("Vessel", car.vessel_name);
  push("Sailed", formatEta(car.sailed_on), true);
  push("Arrives Tema", formatEta(car.eta_tema), true);

  return (
    <dl
      className={cn(
        // `minmax(0,1fr)` rather than a bare `1fr`: an implicit grid track is
        // sized to its widest content's min-content, and a 17-character VIN in
        // one is what pushes a 390px page sideways.
        "grid min-w-0 grid-cols-[minmax(0,1fr)] gap-x-6 sm:grid-cols-[repeat(2,minmax(0,1fr))]",
        className,
      )}
    >
      {specs.map((spec) => (
        <div
          key={spec.label}
          className="flex min-w-0 items-baseline justify-between gap-4 border-b border-tm-hairline py-2.5"
        >
          <dt className="shrink-0 text-[13px] leading-[1.35] font-medium text-tm-text-3">
            {spec.label}
          </dt>
          {/* `break-words` rather than `truncate`: a long value wraps inside
              the cell instead of reporting a width the cell never shows. */}
          <dd
            className={cn(
              "min-w-0 text-right text-[13.5px] leading-[1.35] font-semibold break-words text-tm-ink",
              spec.nums && "tm-nums",
            )}
          >
            {spec.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
