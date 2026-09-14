"use client";

import { Spinner } from "@/components/ui/spinner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";

/**
 * The buttons, fields and confirmations the money screens are built from.
 *
 * The admin kit (`components/layout/admin`) owns the page, card, stat, badge
 * and table shapes; it has no control shapes yet, and the shadcn `Button` is
 * still on the pre-redesign palette. Rather than five spellings of a v2 button
 * across the transactions and pricing screens, they are spelled once here.
 * If the kit grows a `AdminButton` these should collapse into it.
 *
 * `AdminConfirm` is the load-bearing one. Everything on the pricing console
 * changes the price of every future quote, and a dialog that asks "Are you
 * sure?" tells an admin nothing. Its `consequence` prop is required and is
 * meant to be a sentence about what will actually change.
 */

// ── Button ───────────────────────────────────────────────────────────────────

export type AdminButtonVariant = "primary" | "secondary" | "quiet" | "danger";

const VARIANT_CLASS: Record<AdminButtonVariant, string> = {
  primary: "tm-cta-gradient text-white shadow-[0_10px_24px_-14px_rgba(244,63,94,0.65)]",
  secondary: "border border-tm-border bg-card text-tm-ink hover:bg-tm-paper",
  quiet: "bg-tm-paper text-tm-text-2 hover:text-tm-ink",
  danger: "border border-tm-border bg-card text-tm-coral-strong hover:bg-tm-pill-bg",
};

export interface AdminButtonProps extends React.ComponentProps<"button"> {
  variant?: AdminButtonVariant;
  /** Swaps the label for a spinner and marks the control busy for a reader. */
  busy?: boolean;
}

export function AdminButton({
  variant = "secondary",
  busy = false,
  className,
  children,
  disabled,
  ...props
}: AdminButtonProps) {
  return (
    <button
      type="button"
      {...props}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      className={cn(
        "inline-flex h-9 items-center justify-center gap-1.5 rounded-full px-4",
        "text-[13px] leading-none font-semibold whitespace-nowrap",
        "transition-colors disabled:cursor-not-allowed disabled:opacity-55",
        "focus-visible:ring-2 focus-visible:ring-tm-coral/40 focus-visible:outline-none",
        VARIANT_CLASS[variant],
        className,
      )}
    >
      {busy ? <Spinner className="size-3.5" /> : null}
      {children}
    </button>
  );
}

// ── Text input ───────────────────────────────────────────────────────────────

export interface AdminInputProps extends React.ComponentProps<"input"> {
  /** Printed inside the right edge of the field — "%", "$/lb", "GH₵". */
  suffix?: string | null;
}

export function AdminInput({ suffix, className, ...props }: AdminInputProps) {
  return (
    <span className="relative inline-flex items-center">
      <input
        {...props}
        className={cn(
          "tm-nums h-9 rounded-[10px] border border-tm-border bg-card px-3",
          "text-[13px] font-semibold text-tm-ink outline-none",
          "focus:border-tm-coral/50 disabled:opacity-55",
          suffix ? "pr-9" : undefined,
          className,
        )}
      />
      {suffix ? (
        <span className="pointer-events-none absolute right-3 text-[12px] font-semibold text-tm-text-3">
          {suffix}
        </span>
      ) : null}
    </span>
  );
}

// ── Confirmation ─────────────────────────────────────────────────────────────

export interface AdminConfirmProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /**
   * What will actually happen, in words. Required: "Are you sure?" is not a
   * confirmation, it is a speed bump, and on this surface the difference is
   * the price of every quote placed afterwards.
   */
  consequence: string;
  /** Optional second block — a before/after figure, a list of what moves. */
  detail?: React.ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  busy?: boolean;
}

export function AdminConfirm({
  open,
  onOpenChange,
  title,
  consequence,
  detail,
  confirmLabel,
  onConfirm,
  busy = false,
}: AdminConfirmProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="rounded-[20px] border-tm-border">
        <AlertDialogHeader>
          <AlertDialogTitle className="font-display text-[18px] leading-tight font-bold text-tm-ink">
            {title}
          </AlertDialogTitle>
          <AlertDialogDescription className="text-[13px] leading-[1.55] font-medium text-tm-text-2">
            {consequence}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {detail ? (
          <div className="rounded-[14px] bg-tm-paper p-4 text-[13px] leading-[1.5] font-medium text-tm-ink">
            {detail}
          </div>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={(event) => {
              // Keep the dialog mounted while the write runs, so the spinner
              // has somewhere to live and a failure can be reported in place.
              event.preventDefault();
              onConfirm();
            }}
            disabled={busy}
          >
            {busy ? <Spinner className="size-3.5" /> : null}
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
