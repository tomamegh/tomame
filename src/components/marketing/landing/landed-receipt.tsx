import { cn } from "@/lib/utils";
import type { WorkedExample } from "@/features/marketing/types";

import { RECEIPT_ROW_ICONS } from "./icons";

export interface LandedReceiptProps {
  /** Priced live by `getFeesWorkedExample()` — never a literal. */
  example: WorkedExample;
  /**
   * `print` staggers each line in 150ms apart (the hero's floating card);
   * `static` renders them at rest (the inset inside a feature card).
   */
  motion?: "print" | "static";
  className?: string;
}

/**
 * The itemised landed-price lines: item, store tax, our fee, freight, rate.
 *
 * Every label and amount comes back from the pricing engine, so a change to a
 * pricing group, constant or FX rate moves the marketing page with it.
 */
export function LandedReceipt({
  example,
  motion = "static",
  className,
}: LandedReceiptProps) {
  return (
    <dl
      className={cn(
        "tm-nums flex flex-col gap-[9px] text-[13px] font-medium text-tm-text-2",
        className,
      )}
    >
      {example.rows.map((row, index) => {
        const RowIcon = RECEIPT_ROW_ICONS[row.key];
        return (
          <div
            key={row.key}
            className={cn(
              "flex items-center justify-between gap-2",
              motion === "print" && "tm-print",
            )}
            style={
              motion === "print"
                ? ({ "--tm-i": index + 1 } as React.CSSProperties)
                : undefined
            }
          >
            <dt className="flex min-w-0 items-center gap-2 leading-[1.35]">
              <RowIcon
                weight="duotone"
                className="size-[15px] shrink-0 text-tm-coral"
                aria-hidden
              />
              {row.label}
            </dt>
            <dd className="shrink-0 pl-2 text-right text-tm-ink">{row.value}</dd>
          </div>
        );
      })}
    </dl>
  );
}
