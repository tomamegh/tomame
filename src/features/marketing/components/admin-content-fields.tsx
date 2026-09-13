"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2Icon } from "lucide-react";

import { apiFetch } from "@/lib/auth/api-helpers";
import { toast } from "@/lib/sonner";
import { cn } from "@/lib/utils";

/**
 * The shared pieces of `/admin/content`'s editors.
 *
 * Four tables are edited on that screen and every one of them needs the same
 * three things: a labelled field at the v2 rhythm, a save that reports what
 * happened, and a refresh so the server component re-renders with the stored
 * value rather than the one the form is holding. Writing that three times
 * produced three slightly different spellings of "Saved", which is how an admin
 * learns not to trust any of them.
 *
 * `useContentPatch` is the single write path. Every editor on the screen goes
 * through `PATCH /api/admin/content`, which authenticates, validates the
 * shape and writes the audit entry — nothing here talks to Supabase.
 */

export const CONTENT_INPUT_CLASS =
  "h-10 w-full rounded-[12px] border border-tm-border bg-card px-3 text-[14px] text-tm-ink outline-none transition-colors placeholder:text-tm-text-3 focus:border-tm-coral/50 focus:ring-2 focus:ring-tm-coral/15";

export const CONTENT_TEXTAREA_CLASS =
  "w-full rounded-[12px] border border-tm-border bg-card px-3 py-2.5 text-[13px] leading-[1.5] text-tm-ink outline-none transition-colors placeholder:text-tm-text-3 focus:border-tm-coral/50 focus:ring-2 focus:ring-tm-coral/15";

export function ContentField({
  label,
  htmlFor,
  help,
  children,
  className,
}: {
  label: string;
  htmlFor: string;
  help?: string | null;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label
        htmlFor={htmlFor}
        className="text-[12px] leading-none font-semibold text-tm-text-2"
      >
        {label}
      </label>
      {children}
      {help ? (
        <p className="max-w-[62ch] text-[12px] leading-[1.45] font-medium text-tm-text-3">
          {help}
        </p>
      ) : null}
    </div>
  );
}

/**
 * The save button.
 *
 * Disabled until something has changed, so an admin cannot write an identical
 * row and produce an audit entry recording that nothing happened.
 */
export function ContentSaveButton({
  isDirty,
  isSaving,
  label = "Save",
}: {
  isDirty: boolean;
  isSaving: boolean;
  label?: string;
}) {
  return (
    <button
      type="submit"
      disabled={!isDirty || isSaving}
      aria-busy={isSaving}
      className="tm-cta-gradient inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-4 text-[13px] font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
    >
      {isSaving ? <Loader2Icon className="size-3.5 animate-spin" aria-hidden /> : null}
      {isSaving ? "Saving…" : label}
    </button>
  );
}

export interface ContentPatchOptions {
  /** Shown on success. Say what a customer will now see, not "Saved". */
  successTitle: string;
  successDescription?: string;
}

/**
 * The one write path for every editor on the content screen.
 *
 * Returns `false` on failure so a caller can keep its form dirty rather than
 * clearing it over an error — a form that resets after a failed save has just
 * thrown away the admin's work.
 */
export function useContentPatch() {
  const router = useRouter();
  const [isSaving, setIsSaving] = useState(false);

  async function patch(
    body: Record<string, unknown>,
    options: ContentPatchOptions,
  ): Promise<boolean> {
    setIsSaving(true);
    try {
      await apiFetch("/api/admin/content", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      toast.success({
        title: options.successTitle,
        description: options.successDescription,
      });
      // The panels are rendered from server components, so the stored value
      // comes back through a refresh rather than being assumed here.
      router.refresh();
      return true;
    } catch (error) {
      toast.error({
        title: "Could not save",
        description: error instanceof Error ? error.message : "Please try again.",
      });
      return false;
    } finally {
      setIsSaving(false);
    }
  }

  return { patch, isSaving };
}
