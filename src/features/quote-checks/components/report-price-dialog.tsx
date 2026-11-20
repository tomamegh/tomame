"use client";

import { useId, useState } from "react";
import { Flag } from "@phosphor-icons/react/ssr";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ApiFetchError } from "@/lib/api-client";
import { toast } from "@/lib/sonner";
import { cn } from "@/lib/utils";
import { useReportWrongPrice } from "../hooks/useQuoteTrust";

export interface ReportPriceLinkProps {
  extractionId: string;
  /** "$" or "£": the listing currency the customer sees on the store. */
  currencySymbol: string;
  className?: string;
}

const FIELD = cn(
  "w-full rounded-[12px] border border-border bg-card px-3.5 text-base text-foreground placeholder:text-muted-foreground",
  "focus-visible:border-tm-coral focus-visible:ring-2 focus-visible:ring-tm-coral/20 focus-visible:outline-none sm:text-[14px]",
);

/**
 * "Report a wrong price": a quiet link under the price that opens a short
 * form. It never changes the quote; staff check the store and correct it if
 * it is wrong (POST /api/extractions/:id/price-report).
 */
export function ReportPriceLink({ extractionId, currencySymbol, className }: ReportPriceLinkProps) {
  const [open, setOpen] = useState(false);
  const [seen, setSeen] = useState("");
  const [note, setNote] = useState("");
  const [sent, setSent] = useState(false);
  const report = useReportWrongPrice(extractionId);
  const priceId = useId();
  const noteId = useId();

  const seenValue = Number(seen.trim());
  const seenValid = seen.trim() === "" || (Number.isFinite(seenValue) && seenValue > 0);

  const submit = () => {
    if (!seenValid) return;
    report.mutate(
      {
        ...(seen.trim() ? { seen_price: seenValue } : {}),
        ...(note.trim() ? { note: note.trim() } : {}),
      },
      {
        onSuccess: () => {
          setSent(true);
          setOpen(false);
          toast.success({ title: "Thanks, we'll check the price", description: "If it's wrong we'll correct it before you pay." });
        },
        onError: (error) =>
          toast.error({
            title: "Couldn't send that",
            description: error instanceof ApiFetchError && error.status === 429 ? "You've sent a few already. We're looking at them." : error.message,
          }),
      },
    );
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={sent}
        className={cn(
          "inline-flex min-h-11 items-center gap-1.5 text-[13px] leading-none font-medium text-muted-foreground underline-offset-4 transition-colors",
          "hover:text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-tm-coral focus-visible:outline-none disabled:no-underline disabled:opacity-100",
          className,
        )}
      >
        <Flag className="size-4" aria-hidden />
        {sent ? "Price reported. We're checking it." : "Report a wrong price"}
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Report a wrong price</DialogTitle>
            <DialogDescription>
              Tell us what the store shows. Our team checks it and corrects the quote if it&apos;s wrong.
            </DialogDescription>
          </DialogHeader>

          <form
            id="report-price-form"
            className="flex flex-col gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              submit();
            }}
          >
            <div className="flex flex-col gap-1.5">
              <label htmlFor={priceId} className="text-[13px] font-semibold text-foreground">
                Price on the store <span className="font-normal text-muted-foreground">· optional</span>
              </label>
              <div className="relative">
                <span className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden>
                  {currencySymbol}
                </span>
                <input
                  id={priceId}
                  inputMode="decimal"
                  value={seen}
                  onChange={(event) => setSeen(event.target.value)}
                  aria-invalid={!seenValid}
                  className={cn(FIELD, "tm-nums h-11 pl-8")}
                />
              </div>
              {!seenValid && <p className="text-[12px] text-destructive">Enter the price as a number, like 49.99.</p>}
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor={noteId} className="text-[13px] font-semibold text-foreground">
                Anything else <span className="font-normal text-muted-foreground">· optional</span>
              </label>
              <textarea
                id={noteId}
                rows={3}
                maxLength={500}
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="For example, the price changes with the colour"
                className={cn(FIELD, "resize-none py-3 leading-[1.5]")}
              />
            </div>
          </form>

          <DialogFooter>
            <Button type="button" variant="outline" size="touch" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" form="report-price-form" variant="primary" size="touch" loading={report.isPending} disabled={!seenValid}>
              Send to our team
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
