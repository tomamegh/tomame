import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { ArrowRight } from "@phosphor-icons/react/ssr";

import { cn } from "@/lib/utils";

/**
 * Shared chrome for the redesigned marketing pages
 * (design/Tomame - Marketing v2.dc.html, artboards 02–04).
 *
 * Everything here is a server component: these are layout and type primitives,
 * never state. Focus rings live here rather than on each usage so the whole
 * marketing surface rings identically.
 */

export const MARKETING_FOCUS_RING =
  "outline-none focus-visible:ring-3 focus-visible:ring-tm-coral/30 focus-visible:ring-offset-2 focus-visible:ring-offset-card";

/** `mx-auto max-w-[1280px]` gutters, matching the marketing nav. */
export const MARKETING_GUTTER = "mx-auto w-full max-w-[1280px] px-5 md:px-8";

// ── Eyebrow ──────────────────────────────────────────────────────────────────

export interface EyebrowProps {
  children: ReactNode;
  className?: string;
}

/** The 11px coral, letter-spaced label above every section heading. */
export function Eyebrow({ children, className }: EyebrowProps) {
  return (
    <span
      className={cn(
        "text-[11px] font-semibold uppercase leading-none tracking-[0.14em] text-tm-coral",
        className,
      )}
    >
      {children}
    </span>
  );
}

// ── Calls to action ──────────────────────────────────────────────────────────

export interface MarketingCtaProps extends ComponentProps<typeof Link> {
  children: ReactNode;
  /** Appends the bold arrow the design puts on every primary CTA. */
  withArrow?: boolean;
}

export function PrimaryCta({
  children,
  className,
  withArrow = true,
  ...props
}: MarketingCtaProps) {
  return (
    <Link
      {...props}
      className={cn(
        "tm-cta-gradient inline-flex h-13 items-center gap-2 rounded-lg px-6",
        "text-[15px] font-bold leading-none",
        "shadow-[0_12px_28px_-12px_rgba(244,63,94,0.5)]",
        "transition-transform duration-300 hover:-translate-y-px",
        MARKETING_FOCUS_RING,
        className,
      )}
    >
      {children}
      {withArrow ? (
        <ArrowRight weight="bold" className="size-4" aria-hidden="true" />
      ) : null}
    </Link>
  );
}

export function SecondaryCta({
  children,
  className,
  ...props
}: Omit<MarketingCtaProps, "withArrow">) {
  return (
    <Link
      {...props}
      className={cn(
        "inline-flex h-13 items-center gap-2 rounded-lg border-[1.5px] border-tm-border bg-card px-5",
        "text-[15px] font-semibold leading-none text-tm-ink",
        "transition-colors duration-300 hover:bg-tm-paper",
        MARKETING_FOCUS_RING,
        className,
      )}
    >
      {children}
    </Link>
  );
}

// ── Status pill ──────────────────────────────────────────────────────────────

export interface StatusPillProps {
  /** `regions.status`. Only `live` is purchasable. */
  status: "live" | "soon" | "off";
  className?: string;
}

const STATUS_LABEL: Record<StatusPillProps["status"], string> = {
  live: "Live",
  soon: "Soon",
  off: "Closed",
};

const STATUS_CLASS: Record<StatusPillProps["status"], string> = {
  live: "bg-tm-green-bg text-tm-green-ink",
  soon: "bg-tm-amber-bg text-[#8A5A0A]",
  off: "bg-tm-hairline text-tm-text-3",
};

export function StatusPill({ status, className }: StatusPillProps) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1.5",
        "text-[10px] font-bold uppercase leading-none tracking-[0.08em]",
        STATUS_CLASS[status],
        className,
      )}
    >
      {status === "live" ? (
        <span className="relative inline-flex size-1.5" aria-hidden="true">
          <span className="tm-pulse-dot absolute inset-0 rounded-full bg-tm-green" />
          <span className="absolute inset-0 rounded-full bg-tm-green" />
        </span>
      ) : null}
      {STATUS_LABEL[status]}
    </span>
  );
}

// ── Figure note ──────────────────────────────────────────────────────────────

export interface FigureNoteProps {
  /** `ResolvedFigure.note` — "from 4%", "1 lb minimum", "GH₵40–GH₵55 elsewhere". */
  note: string | null;
  className?: string;
}

/**
 * The qualifier that keeps a headline figure honest. The engine charges 4–8%
 * by category, so "5%" alone would be false — the note is not decoration.
 */
export function FigureNote({ note, className }: FigureNoteProps) {
  if (!note) return null;
  return (
    <span
      className={cn(
        "tm-nums block text-[12px] font-medium leading-none text-tm-text-3",
        className,
      )}
    >
      {note}
    </span>
  );
}
