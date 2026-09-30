"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useState } from "react";
import { ArrowLeftIcon, MinusIcon, PlusIcon, PrinterIcon, TriangleAlertIcon } from "lucide-react";

import { apiFetch } from "@/lib/api-client";
import { toast } from "@/lib/sonner";
import { cn } from "@/lib/utils";

import type { PackageStatus } from "../types";

/**
 * The print console around a label (081).
 *
 * Switching size is a URL change (`?size=`), so the server renders exactly the
 * label that will print. The `@page` rule is injected per mode — a 4×6 roll, a
 * 2×1 roll and the manifest each tell the printer their own paper size, so the
 * operator never has to find the paper-size menu in a print dialog.
 *
 * Copies repeat the sheet in the document rather than trusting the dialog's
 * copies field, which several thermal drivers ignore.
 */

export type LabelMode = "4x6" | "roll80" | "2x1" | "manifest";

const MODES: Array<{ value: LabelMode; label: string; hint: string }> = [
  { value: "4x6", label: "Shipping 4×6″", hint: "Label printer, 4×6 labels — goes on top of the box" },
  { value: "roll80", label: "Receipt roll 80 mm", hint: "Receipt printer, 80 mm paper roll" },
  { value: "2x1", label: "Small 2×1″", hint: "For a side, or a parcel inside" },
  { value: "manifest", label: "Manifest", hint: "Contents list for the sleeve" },
];

const PAGE: Record<LabelMode, { size: string; margin: string; stock: string }> = {
  "4x6": { size: "4in 6in", margin: "0", stock: "4 × 6 in label" },
  roll80: { size: "80mm 148mm", margin: "4mm 4mm", stock: "80 mm roll" },
  "2x1": { size: "2in 1in", margin: "0", stock: "2 × 1 in label" },
  manifest: { size: "4in 6in", margin: "0", stock: "4 × 6 in label" },
};

const WIDTH_IN: Record<LabelMode, number> = { "4x6": 4, roll80: 72 / 25.4, "2x1": 2, manifest: 4 };

export function LabelToolbar({
  pkg,
  mode,
  children,
}: {
  pkg: { id: string; reference: string; status: PackageStatus; printed: number };
  mode: LabelMode;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [copies, setCopies] = useState(mode === "2x1" ? 2 : 1);
  const [scale, setScale] = useState(1);

  // The print-only rules key off this class; see globals.css.
  useEffect(() => {
    document.body.classList.add("tm-printing");
    return () => document.body.classList.remove("tm-printing");
  }, []);

  useEffect(() => setCopies(mode === "2x1" ? 2 : 1), [mode]);

  // Fit the physical-size preview to a phone without resizing the print.
  useLayoutEffect(() => {
    const fit = () => {
      const available = Math.min(window.innerWidth - 32, 720);
      const labelPx = WIDTH_IN[mode] * 96;
      const zoom = mode === "2x1" ? 1.6 : 1;
      setScale(Math.min(zoom, available / labelPx));
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [mode]);

  const print = () => {
    // Counted on the click, not on `afterprint`: Safari fires that whether or
    // not the dialog was cancelled, and a missed count is worse than an extra.
    void apiFetch(`/api/warehouse/packages/${pkg.id}/actions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "label_printed" }),
    })
      .then(() => router.refresh())
      .catch(() => toast.error({ title: "The print was not counted", description: "The label still prints." }));
    window.print();
  };

  const sheets = Array.from({ length: copies }, (_, i) => i);

  return (
    <div className="min-h-dvh bg-[#ece7e3]">
      <style>{`@page { size: ${PAGE[mode].size}; margin: ${PAGE[mode].margin}; }`}</style>

      <div className="tm-safe-top sticky top-0 z-30 border-b border-tm-hairline bg-card/92 backdrop-blur-[12px] print:hidden">
        <div className="mx-auto flex max-w-[980px] flex-wrap items-center gap-3 px-4 py-3">
          <Link
            href={`/warehouse/packages/${pkg.id}`}
            className="inline-flex h-9 items-center gap-1.5 rounded-full px-2 text-[13px] font-semibold text-tm-text-2 hover:text-tm-ink"
          >
            <ArrowLeftIcon className="size-4" aria-hidden />
            <span className="font-mono">{pkg.reference}</span>
          </Link>

          <div className="order-3 flex w-full gap-1 overflow-x-auto rounded-full bg-tm-paper p-1 sm:order-none sm:w-auto">
            {MODES.map((m) => (
              <Link
                key={m.value}
                href={`?size=${m.value}`}
                replace
                scroll={false}
                title={m.hint}
                aria-current={mode === m.value ? "page" : undefined}
                className={cn(
                  "inline-flex h-8 shrink-0 items-center rounded-full px-3.5 text-[12.5px] font-semibold whitespace-nowrap transition-colors",
                  mode === m.value ? "bg-tm-ink text-white" : "text-tm-text-2 hover:text-tm-ink",
                )}
              >
                {m.label}
              </Link>
            ))}
          </div>

          <div className="ml-auto flex items-center gap-2">
            <div className="flex h-9 items-center rounded-full border border-tm-border bg-card" aria-label="Copies">
              <button
                type="button"
                onClick={() => setCopies((c) => Math.max(1, c - 1))}
                className="flex size-9 items-center justify-center text-tm-text-2 hover:text-tm-ink"
                aria-label="Fewer copies"
              >
                <MinusIcon className="size-3.5" />
              </button>
              <span className="tm-nums min-w-[3ch] text-center text-[13px] font-bold text-tm-ink">×{copies}</span>
              <button
                type="button"
                onClick={() => setCopies((c) => Math.min(20, c + 1))}
                className="flex size-9 items-center justify-center text-tm-text-2 hover:text-tm-ink"
                aria-label="More copies"
              >
                <PlusIcon className="size-3.5" />
              </button>
            </div>
            <button
              type="button"
              onClick={print}
              className="tm-cta-gradient inline-flex h-9 items-center gap-2 rounded-full px-5 text-[13px] font-semibold text-white shadow-[0_10px_24px_-14px_rgba(244,63,94,0.65)]"
            >
              <PrinterIcon className="size-4" aria-hidden />
              Print
            </button>
          </div>
        </div>
      </div>

      {pkg.status === "packing" ? (
        <div className="mx-auto mt-4 flex max-w-[980px] px-4 print:hidden">
          <p className="flex w-full items-center gap-2 rounded-[14px] bg-tm-amber-bg px-4 py-3 text-[13px] font-medium text-[#7a4a06]">
            <TriangleAlertIcon className="size-4 shrink-0" aria-hidden />
            This package is still open. Seal it first so the label cannot fall out of date.
          </p>
        </div>
      ) : null}

      <div className="flex justify-center px-4 py-8 print:p-0">
        <div
          className="tm-print-root"
          // `zoom`, not a transform: it scales layout too, so a stack of copies
          // scrolls correctly. Reset to 1 for print in globals.css.
          style={{ zoom: scale }}
        >
          {sheets.map((i) => (
            <div key={i} className="tm-label-sheet shadow-[0_22px_48px_-26px_rgba(43,36,34,0.55)] print:shadow-none">
              {children}
            </div>
          ))}
        </div>
      </div>

      <div className="mx-auto max-w-[560px] px-4 pb-12 print:hidden">
        <details className="rounded-[16px] border border-tm-border bg-card px-4 py-3 text-[12.5px] leading-[1.55] font-medium text-tm-text-2">
          <summary className="cursor-pointer text-[13px] font-semibold text-tm-ink">Printing tips</summary>
          <ul className="mt-2 list-disc space-y-1 pl-4">
            <li>
              Print from <b>Chrome or Edge</b> on the computer the printer is plugged into. Safari and phones ignore
              the paper size and shrink the label.
            </li>
            <li>
              In the print dialog pick the thermal printer, paper <b>{PAGE[mode].stock}</b>, margins <b>None</b>,
              scale <b>100%</b> (or Default), and untick headers and footers.
            </li>
            <li>
              Set the printer driver&apos;s darkness to about 10–15 of 30 and print a test: the barcode should be crisp
              black bars with clean white gaps.
            </li>
            <li>A 58 mm pocket receipt printer is too narrow for a shipping label — use the 80 mm or 4×6 printer.</li>
          </ul>
          {pkg.printed ? (
            <p className="mt-2 text-tm-text-3">
              Printed {pkg.printed} time{pkg.printed === 1 ? "" : "s"} so far.
            </p>
          ) : null}
        </details>
      </div>
    </div>
  );
}
