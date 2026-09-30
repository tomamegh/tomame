"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ArrowUpRightIcon, PrinterIcon, UsersIcon } from "lucide-react";

import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

import type { WarehousePackage } from "../types";
import { formatLbs, formatRelative, packageWeight, pluralise, recipientPlace } from "./format";
import { PackageBox } from "./package-box";
import { ItemFlags, ItemThumb, PackageStatusBadge } from "./warehouse-ui";

/**
 * A package on a grid, and the peek that opens it (081).
 *
 * Tapping a card does not navigate. It opens the box in place: the flaps swing
 * out, and the contents rise out of it one at a time and settle into a list —
 * the question an operator walks up to a shelf with is "what is in this one?",
 * and this answers it without losing their place on the grid. The full page is
 * one tap further, for editing.
 */

const EASE = [0.16, 1, 0.3, 1] as const;

export function PackageCard({ pkg, index = 0 }: { pkg: WarehousePackage; index?: number }) {
  const [open, setOpen] = useState(false);
  const weight = packageWeight(pkg);
  const primary = pkg.recipients[0];

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="group tm-up relative flex w-full min-w-0 flex-col overflow-hidden rounded-[22px] border border-tm-border bg-card text-left transition-[border-color,box-shadow,transform] [animation-duration:0.5s] hover:-translate-y-0.5 hover:border-tm-coral/35 hover:shadow-[0_18px_40px_-28px_rgba(43,36,34,0.45)] focus-visible:ring-2 focus-visible:ring-tm-coral/40 focus-visible:outline-none"
        style={{ animationDelay: `${0.05 + index * 0.05}s` }}
        aria-label={`Open ${pkg.reference}`}
      >
        <div className="relative flex h-[148px] items-end justify-center overflow-hidden bg-[radial-gradient(120%_90%_at_50%_0%,#fff1ec_0%,#fdf9f6_60%)] pb-4">
          <div className="absolute top-3 left-3">
            <PackageStatusBadge status={pkg.status} />
          </div>
          {pkg.is_consolidated ? (
            <span className="absolute top-3 right-3 inline-flex items-center gap-1 rounded-full bg-tm-ink px-2 py-1 text-[11px] leading-none font-semibold text-white">
              <UsersIcon className="size-3" aria-hidden />
              {pkg.recipients.length}
            </span>
          ) : null}
          <div className="transition-transform duration-500 ease-[cubic-bezier(.16,1,.3,1)] group-hover:-translate-y-1 group-hover:scale-[1.03]">
            <PackageBox status={pkg.status} size={112} />
          </div>
        </div>
        <div className="flex flex-col gap-2 border-t border-tm-hairline p-4">
          <div className="flex items-baseline justify-between gap-2">
            <span className="font-mono text-[15px] font-bold tracking-tight text-tm-ink">{pkg.reference}</span>
            <span className="text-[12px] font-medium text-tm-text-3">{formatRelative(pkg.updated_at)}</span>
          </div>
          <span className="line-clamp-1 text-[13px] font-semibold text-tm-text-2">
            {pkg.is_consolidated
              ? `Consolidated · ${pluralise(pkg.recipients.length, "customer")}`
              : primary?.name ?? (pkg.line_count ? "Hand-described items" : "Empty")}
            {!pkg.is_consolidated && primary && recipientPlace(primary) ? (
              <span className="font-medium text-tm-text-3"> · {recipientPlace(primary)}</span>
            ) : null}
          </span>
          <div className="flex items-center gap-3 text-[12px] font-semibold text-tm-text-3">
            <span>{pluralise(pkg.unit_count, "item")}</span>
            <span aria-hidden>·</span>
            <span>
              {formatLbs(weight.value)}
              {weight.estimated ? " est." : ""}
            </span>
            {pkg.held_count > 0 ? <span className="ml-auto text-tm-coral-strong">{pkg.held_count} held</span> : null}
          </div>
          <ThumbStrip pkg={pkg} />
        </div>
      </button>
      <PackagePeek pkg={pkg} open={open} onOpenChange={setOpen} />
    </>
  );
}

function ThumbStrip({ pkg }: { pkg: WarehousePackage }) {
  const items = pkg.lines.map((l) => l.item).filter((i): i is NonNullable<typeof i> => !!i);
  if (items.length === 0) return null;
  const shown = items.slice(0, 5);
  return (
    <div className="flex items-center pt-1">
      {shown.map((item, i) => (
        <span key={item.order_id} className="-ml-2 first:ml-0" style={{ zIndex: shown.length - i }}>
          <ItemThumb item={item} size={30} rounded={9} className="ring-2 ring-card" />
        </span>
      ))}
      {items.length > shown.length ? (
        <span className="-ml-2 flex size-[30px] items-center justify-center rounded-[9px] bg-tm-ink text-[11px] font-bold text-white ring-2 ring-card">
          +{items.length - shown.length}
        </span>
      ) : null}
    </div>
  );
}

export function PackagePeek({
  pkg,
  open,
  onOpenChange,
}: {
  pkg: WarehousePackage;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const reduce = useReducedMotion();
  // The box arrives shut and opens a beat later, so the opening is seen.
  const [lidOpen, setLidOpen] = useState(false);
  useEffect(() => {
    if (!open) {
      setLidOpen(false);
      return;
    }
    const t = window.setTimeout(() => setLidOpen(true), reduce ? 0 : 380);
    return () => window.clearTimeout(t);
  }, [open, reduce]);

  const weight = packageWeight(pkg);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] gap-0 overflow-hidden p-0 sm:max-w-[560px]">
        <div className="relative flex h-[250px] items-end justify-center overflow-hidden bg-[radial-gradient(110%_100%_at_50%_0%,#ffe4d9_0%,#fff1ec_35%,#fdf9f6_75%)] pb-6">
          {/* Light spilling out of the open box */}
          <motion.div
            className="pointer-events-none absolute bottom-[86px] left-1/2 h-[160px] w-[220px] -translate-x-1/2 rounded-[50%] bg-[radial-gradient(closest-side,rgba(255,214,170,.85),transparent)] blur-[8px]"
            initial={false}
            animate={{ opacity: lidOpen ? 1 : 0, scale: lidOpen ? 1 : 0.6 }}
            transition={{ duration: 0.7, ease: EASE }}
          />
          <motion.div
            initial={reduce ? false : { y: 40, scale: 0.85, opacity: 0 }}
            animate={{ y: 0, scale: 1, opacity: 1 }}
            transition={{ duration: 0.45, ease: EASE }}
          >
            <PackageBox status={pkg.status} open={lidOpen} reference={pkg.reference} size={176} />
          </motion.div>
        </div>

        <div className="flex flex-col gap-1 border-t border-tm-hairline px-5 pt-4 pb-3">
          <div className="flex items-center justify-between gap-3 pr-10">
            <DialogTitle className="font-mono text-[20px] font-bold tracking-tight text-tm-ink">
              {pkg.reference}
            </DialogTitle>
            <PackageStatusBadge status={pkg.status} />
          </div>
          <DialogDescription className="text-[13px] font-medium text-tm-text-2">
            {pluralise(pkg.unit_count, "item")} · {formatLbs(weight.value)}
            {weight.estimated ? " estimated" : ""} · {pkg.origin} → {pkg.destination}
          </DialogDescription>
        </div>

        <div className="max-h-[38dvh] overflow-y-auto px-3 pb-3">
          <AnimatePresence>
            {lidOpen
              ? pkg.lines.map((line, i) => (
                  <motion.div
                    key={line.id}
                    initial={reduce ? false : { y: -70, scale: 0.6, opacity: 0 }}
                    animate={{ y: 0, scale: 1, opacity: 1 }}
                    transition={{ duration: 0.55, ease: EASE, delay: reduce ? 0 : 0.18 + i * 0.07 }}
                    className="flex items-center gap-3 rounded-[14px] px-2 py-2.5 odd:bg-tm-paper/70"
                  >
                    {line.item ? (
                      <>
                        <ItemThumb item={line.item} size={46} rounded={12} />
                        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                          <span className="line-clamp-1 text-[13.5px] font-semibold text-tm-ink">
                            {line.item.title}
                          </span>
                          <span className="truncate text-[12px] font-medium text-tm-text-3">
                            <span className="font-mono text-tm-text-2">{line.item.order_no}</span> ·{" "}
                            {line.item.recipient.name ?? "Customer"}
                          </span>
                          <ItemFlags item={line.item} />
                        </div>
                      </>
                    ) : (
                      <>
                        <span className="flex size-[46px] shrink-0 items-center justify-center rounded-[12px] border border-dashed border-tm-border text-[11px] font-bold text-tm-text-3">
                          Note
                        </span>
                        <span className="min-w-0 flex-1 text-[13.5px] font-semibold text-tm-ink">
                          {line.description}
                        </span>
                      </>
                    )}
                    <span className="shrink-0 rounded-full bg-tm-tint px-2 py-1 text-[12px] leading-none font-bold text-tm-ink">
                      ×{line.quantity}
                    </span>
                  </motion.div>
                ))
              : null}
          </AnimatePresence>
          {lidOpen && pkg.lines.length === 0 ? (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="px-2 py-6 text-center text-[13px] font-medium text-tm-text-3"
            >
              Nothing in here yet.
            </motion.p>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-tm-hairline bg-tm-paper/60 px-5 py-3.5">
          <Link
            href={`/warehouse/packages/${pkg.id}/label`}
            className="inline-flex h-9 items-center gap-1.5 rounded-full border border-tm-border bg-card px-4 text-[13px] font-semibold text-tm-ink transition-colors hover:bg-tm-paper"
          >
            <PrinterIcon className="size-4" aria-hidden />
            Label
          </Link>
          <Link
            href={`/warehouse/packages/${pkg.id}`}
            className={cn(
              "tm-cta-gradient inline-flex h-9 items-center gap-1.5 rounded-full px-4 text-[13px] font-semibold text-white",
              "shadow-[0_10px_24px_-14px_rgba(244,63,94,0.65)]",
            )}
          >
            Open package
            <ArrowUpRightIcon className="size-4" aria-hidden />
          </Link>
        </div>
      </DialogContent>
    </Dialog>
  );
}
