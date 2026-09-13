"use client";

import { useState } from "react";
import { Check, Copy } from "@phosphor-icons/react/ssr";

import { cn } from "@/lib/utils";

/**
 * A value an admin will paste into Paystack's dashboard — a reference, a row id.
 *
 * The copy lives next to the value rather than in a toast: the confirmation an
 * admin needs is "that one, yes", and a tick on the button says it without
 * covering the screen. Falls back silently when the clipboard is unavailable
 * (an insecure origin), leaving the text itself selectable.
 */
export function AdminCopyValue({ value, className }: { value: string; className?: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }

  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      <span className="font-mono text-[13px] break-all text-tm-ink">{value}</span>
      <button
        type="button"
        onClick={copy}
        aria-label={copied ? "Copied" : `Copy ${value}`}
        className="shrink-0 rounded-md p-1 text-tm-text-3 transition-colors hover:bg-tm-paper hover:text-tm-ink focus-visible:ring-2 focus-visible:ring-tm-coral/40 focus-visible:outline-none"
      >
        {copied ? (
          <Check size={13} weight="bold" className="text-tm-green" />
        ) : (
          <Copy size={13} weight="bold" />
        )}
      </button>
    </span>
  );
}
