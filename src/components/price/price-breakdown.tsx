"use client";

import type { Icon } from "@phosphor-icons/react";
import { CaretRight } from "@phosphor-icons/react/ssr";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export interface PriceBreakdownRow {
  key: string;
  label: string;
  value: string;
  icon?: Icon;
  /** Shown instead of the value while this row is still being worked out. */
  pending?: string | null;
}

export interface PriceBreakdownListProps {
  rows: readonly PriceBreakdownRow[];
  /** A note under the rows (the fee rule, "checked before you pay"). */
  note?: string | null;
  className?: string;
}

/** The breakdown rows. Labels are the price-story copy, values the server's figures. */
export function PriceBreakdownList({ rows, note, className }: PriceBreakdownListProps) {
  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <dl className="tm-nums flex flex-col gap-2.5 text-[13px] leading-[1.35] font-medium text-muted-foreground">
        {rows.map((row) => {
          const RowIcon = row.icon;
          return (
            <div key={row.key} className="flex items-start justify-between gap-3">
              <dt className="flex min-w-0 items-start gap-2">
                {RowIcon && <RowIcon weight="duotone" className="mt-px size-4 shrink-0 text-tm-coral" aria-hidden />}
                <span className="min-w-0">{row.label}</span>
              </dt>
              <dd className="shrink-0 text-right text-foreground">
                {row.pending ? (
                  <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                    <span className="tm-pulse-dot size-1.5 rounded-full bg-tm-coral" aria-hidden />
                    {row.pending}
                  </span>
                ) : (
                  row.value
                )}
              </dd>
            </div>
          );
        })}
      </dl>
      {note && <p className="tm-caption text-muted-foreground">{note}</p>}
    </div>
  );
}

export interface PriceBreakdownSheetProps extends PriceBreakdownListProps {
  /** The one-line summary the trigger shows ("Includes item, tax, fee, freight (incl. customs)"). */
  summary: string;
  /** The total, repeated at the foot of the sheet. */
  total?: string | null;
  title?: string;
}

/**
 * On a phone the breakdown is one line and a tap away, in a bottom sheet
 * (the dialog is a sheet below `sm`); the card stays short and the total
 * stays the first thing read. From `lg` the caller renders the list inline.
 */
export function PriceBreakdownSheet({ rows, note, summary, total = null, title = "What's in the price", className }: PriceBreakdownSheetProps) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex min-h-11 w-full items-center justify-between gap-3 rounded-[12px] bg-muted px-3.5 py-2.5 text-left",
            "transition-colors hover:bg-tm-tint focus-visible:ring-2 focus-visible:ring-tm-coral focus-visible:outline-none dark:hover:bg-muted/70",
            className,
          )}
        >
          <span className="tm-caption min-w-0 font-medium text-muted-foreground">{summary}</span>
          <span className="flex shrink-0 items-center gap-1 text-[13px] font-semibold text-foreground">
            Breakdown
            <CaretRight weight="bold" className="size-3.5" aria-hidden />
          </span>
        </button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className="sr-only">{summary}</DialogDescription>
        </DialogHeader>
        <PriceBreakdownList rows={rows} note={note} />
        {total && (
          <div className="flex items-baseline justify-between border-t border-dashed border-border pt-3">
            <span className="text-[14px] font-semibold text-foreground">Landed in Accra</span>
            <span className="tm-nums text-[20px] leading-none font-bold text-foreground">{total}</span>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
