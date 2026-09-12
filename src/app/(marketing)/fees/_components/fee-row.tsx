import type { FeeLine } from "@/features/marketing/types";
import { cn } from "@/lib/utils";
import { MarketingIcon } from "../../_components/marketing-icon";

/**
 * One fee row — design/Tomame - Marketing v2.dc.html #mk-fees.
 *
 * The figure is never copy: `FeeLine.figure` is the engine's live value
 * (`resolveMarketingFigures`). Its `note` renders too — the service publishes
 * "5%" with "from 4%" precisely because the engine charges 4–8% by category,
 * and dropping the note would make the row false.
 */

export interface FeeRowProps {
  line: FeeLine;
  /** Entry delay from the mock: ".1s" ".18s" ".26s" ".34s" ".42s". */
  animationDelay: string;
}

export function FeeRow({ line, animationDelay }: FeeRowProps) {
  const tone = line.accent ? "accent" : line.positive ? "positive" : "neutral";

  return (
    <li
      className={cn(
        "tm-up grid grid-cols-[52px_1fr] items-center gap-x-4 gap-y-3 rounded-3xl border border-tm-border p-5 sm:grid-cols-[52px_1fr_auto] sm:p-6",
        tone === "accent" && "bg-[#FFF8F5]",
        tone === "positive" && "bg-[#F4FBF6]",
        tone === "neutral" && "bg-card",
      )}
      style={{ animationDelay }}
    >
      <span className="flex size-13 items-center justify-center rounded-2xl border border-tm-border bg-card">
        <MarketingIcon
          name={line.icon}
          weight="duotone"
          className={cn(
            "size-6.5",
            tone === "accent" && "text-tm-coral",
            tone === "positive" && "text-tm-green",
            tone === "neutral" && "text-tm-text-2",
          )}
        />
      </span>

      <div className="min-w-0">
        <h3 className="text-[17px] font-bold leading-tight">{line.title}</h3>
        <p className="mt-1 text-sm leading-relaxed text-tm-text-2">
          {line.body}
        </p>
      </div>

      {line.figure ? (
        <p className="col-start-2 text-left sm:col-start-3 sm:text-right">
          <span
            className={cn(
              "tm-nums block whitespace-nowrap text-xl font-bold leading-none tracking-[-0.02em]",
              tone === "accent" && "text-tm-coral",
              tone === "positive" && "text-tm-green",
              tone === "neutral" && "text-tm-text-2",
            )}
          >
            {line.figure.display}
          </span>
          {line.figure.secondary ? (
            <span className="tm-nums mt-1.5 block text-xs font-medium leading-none text-tm-text-3">
              {line.figure.secondary}
            </span>
          ) : null}
          {line.figure.note ? (
            <span className="tm-nums mt-1.5 block text-xs font-medium leading-none text-tm-text-3">
              {line.figure.note}
            </span>
          ) : null}
        </p>
      ) : null}
    </li>
  );
}
