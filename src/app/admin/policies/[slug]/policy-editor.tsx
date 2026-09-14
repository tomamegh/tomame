"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeftIcon,
  Columns2Icon,
  EyeIcon,
  Loader2Icon,
  PencilIcon,
  Trash2Icon,
} from "lucide-react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { AdminBadge } from "@/components/layout/admin";
import { RichTextEditor } from "@/features/policies/components/rich-text-editor";
import { PolicyHtml } from "@/features/policies/components/policy-html";
import { policyLinkBadge, policyLinkState } from "@/features/policies/format";
import { apiFetch } from "@/lib/auth/api-helpers";
import { toast } from "@/lib/sonner";
import { cn } from "@/lib/utils";
import type { PolicyRow } from "@/features/policies/types";
import type { ApiSuccessResponse } from "@/types/api";

/**
 * The policy editor, on the v2 palette.
 *
 * Two things changed beyond colour.
 *
 * The publish control was a checkbox in a grey sub-bar reading "Publish
 * (visible on /policies)", which is the quietest possible spelling of the most
 * consequential switch on the screen: for the five storefront-linked slugs,
 * turning it off takes a link that customers reach from the Pay button and
 * points it at nothing. It is now a stated, two-state control that says what
 * the current setting MEANS for this particular slug.
 *
 * And the footer now says that `/policies` is cached for an hour
 * (`revalidate = 3600`). An admin who saves, opens the public page, sees the
 * old text and saves again is not confused about the editor — they are
 * confused about the cache, and nothing told them it existed.
 */

type ViewMode = "editor" | "split" | "preview";

const VIEW_OPTIONS: { value: ViewMode; label: string; Icon: typeof EyeIcon }[] = [
  { value: "editor", label: "Editor", Icon: PencilIcon },
  { value: "split", label: "Split", Icon: Columns2Icon },
  { value: "preview", label: "Preview", Icon: EyeIcon },
];

function formatTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function PolicyEditor({ policy }: { policy: PolicyRow }) {
  const router = useRouter();

  const [content, setContent] = useState(policy.content);
  const [isPublished, setIsPublished] = useState(policy.is_published);
  const [effectiveDate, setEffectiveDate] = useState(policy.effective_date ?? "");
  const [lastUpdated, setLastUpdated] = useState(policy.last_updated);
  const [viewMode, setViewMode] = useState<ViewMode>("editor");
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isDirty, setIsDirty] = useState(false);

  const showEditor = viewMode === "editor" || viewMode === "split";
  const showPreview = viewMode === "preview" || viewMode === "split";

  // The badge reflects the UNSAVED state, so an admin who unticks publish sees
  // "Linked but unpublished" before they commit to it, not after.
  const badge = policyLinkBadge(policyLinkState({ slug: policy.slug, is_published: isPublished }));
  const linkedState = policyLinkState({ slug: policy.slug, is_published: isPublished });

  function handleContentChange(html: string) {
    setContent(html);
    setIsDirty(true);
  }

  async function handleSave() {
    if (isSaving) return;
    setIsSaving(true);
    try {
      const res = await apiFetch<ApiSuccessResponse<PolicyRow>>(
        `/api/admin/policies/${policy.slug}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            content,
            is_published: isPublished,
            effective_date: effectiveDate.trim() || null,
          }),
        },
      );
      setLastUpdated(res.data.last_updated);
      setIsDirty(false);
      toast.success({
        title: "Policy saved",
        description: isPublished
          ? "Live on /policies within the hour; the page is cached."
          : "Saved as a draft. Customers cannot see it.",
      });
      router.refresh();
    } catch (error) {
      toast.error({
        title: "Could not save policy",
        description: error instanceof Error ? error.message : "Please try again.",
      });
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete() {
    setIsDeleting(true);
    try {
      await apiFetch(`/api/admin/policies/${policy.slug}`, { method: "DELETE" });
      toast.success({ title: "Policy deleted" });
      router.push("/admin/policies");
      router.refresh();
    } catch (error) {
      toast.error({
        title: "Could not delete policy",
        description: error instanceof Error ? error.message : "Please try again.",
      });
      setIsDeleting(false);
    }
  }

  return (
    <div className="tm-up flex h-[calc(100vh-8rem)] flex-col overflow-hidden rounded-[20px] border border-tm-border bg-card [animation-duration:0.5s]">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-tm-hairline px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            onClick={() => router.push("/admin/policies")}
            aria-label="Back to policies"
            className="flex size-8 shrink-0 items-center justify-center rounded-full text-tm-text-3 transition-colors hover:bg-tm-paper hover:text-tm-ink"
          >
            <ArrowLeftIcon className="size-4" aria-hidden />
          </button>
          <div className="min-w-0">
            <h1 className="truncate font-display text-[17px] leading-none font-bold text-tm-ink">
              {policy.label}
            </h1>
            <p className="tm-nums mt-1 text-[12px] leading-none font-medium text-tm-text-3">
              /policies#{policy.slug}
            </p>
          </div>
          <AdminBadge tone={badge.tone}>{badge.label}</AdminBadge>
          {isDirty ? (
            <AdminBadge tone="amber" className="hidden sm:inline-flex">
              Unsaved
            </AdminBadge>
          ) : null}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <div className="hidden items-center gap-0.5 rounded-full border border-tm-border bg-tm-paper p-0.5 sm:flex">
            {VIEW_OPTIONS.map(({ value, label, Icon }) => (
              <button
                key={value}
                type="button"
                onClick={() => setViewMode(value)}
                aria-pressed={viewMode === value}
                title={label}
                className={cn(
                  "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] leading-none font-semibold transition-colors",
                  viewMode === value
                    ? "bg-card text-tm-ink"
                    : "text-tm-text-2 hover:text-tm-ink",
                )}
              >
                <Icon className="size-3.5" aria-hidden />
                <span className="hidden lg:inline">{label}</span>
              </button>
            ))}
          </div>

          {/* Mobile has no room for a split pane, so it gets two states. */}
          <div className="flex items-center gap-0.5 rounded-full border border-tm-border bg-tm-paper p-0.5 sm:hidden">
            {(["editor", "preview"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setViewMode(mode)}
                aria-pressed={viewMode === mode}
                className={cn(
                  "rounded-full px-3 py-1.5 text-[12px] leading-none font-semibold capitalize transition-colors",
                  viewMode === mode ? "bg-card text-tm-ink" : "text-tm-text-2",
                )}
              >
                {mode}
              </button>
            ))}
          </div>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <button
                type="button"
                disabled={isDeleting}
                aria-label="Delete policy"
                className="flex size-8 items-center justify-center rounded-full text-tm-text-3 transition-colors hover:bg-tm-pill-bg hover:text-tm-coral-strong disabled:opacity-40"
              >
                {isDeleting ? (
                  <Loader2Icon className="size-4 animate-spin" aria-hidden />
                ) : (
                  <Trash2Icon className="size-4" aria-hidden />
                )}
              </button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete “{policy.label}”?</AlertDialogTitle>
                <AlertDialogDescription>
                  {linkedState === "live" || linkedState === "broken_link"
                    ? `The storefront links to /policies#${policy.slug} from the footer, the bag and the account screen. Deleting this policy leaves those links pointing at nothing. This cannot be undone.`
                    : "This permanently removes the policy and its section on /policies. This cannot be undone."}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleDelete}
                  className="bg-tm-coral text-white hover:bg-tm-coral-strong"
                >
                  Delete policy
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          <button
            type="button"
            onClick={handleSave}
            disabled={!isDirty || isSaving}
            aria-busy={isSaving}
            className="tm-cta-gradient flex h-9 items-center gap-1.5 rounded-full px-4 text-[13px] font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSaving ? <Loader2Icon className="size-3.5 animate-spin" aria-hidden /> : null}
            {isSaving ? "Saving…" : "Save"}
          </button>
        </div>
      </header>

      {/* ── Publish state and effective date ────────────────────────────── */}
      <div className="flex shrink-0 flex-wrap items-center gap-x-6 gap-y-3 border-b border-tm-hairline bg-tm-paper px-4 py-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            role="switch"
            aria-checked={isPublished}
            onClick={() => {
              setIsPublished(!isPublished);
              setIsDirty(true);
            }}
            className={cn(
              "relative h-6 w-11 shrink-0 rounded-full transition-colors",
              isPublished ? "bg-tm-green" : "bg-tm-border",
            )}
          >
            <span className="sr-only">
              {isPublished ? "Unpublish this policy" : "Publish this policy"}
            </span>
            <span
              className={cn(
                "absolute top-0.5 size-5 rounded-full bg-white transition-[left]",
                isPublished ? "left-[22px]" : "left-0.5",
              )}
              aria-hidden
            />
          </button>
          <p className="max-w-[46ch] text-[12px] leading-[1.45] font-medium text-tm-text-2">
            {isPublished ? (
              <>
                <span className="font-semibold text-tm-ink">Published.</span> This section
                appears on /policies.
              </>
            ) : linkedState === "broken_link" ? (
              <>
                <span className="font-semibold text-tm-coral-strong">
                  Not published, and linked.
                </span>{" "}
                The footer, the bag and the account screen all point at
                /policies#{policy.slug}, and it renders nothing.
              </>
            ) : (
              <>
                <span className="font-semibold text-tm-ink">Draft.</span> Customers cannot see
                it, and nothing links to it.
              </>
            )}
          </p>
        </div>

        <label className="flex items-center gap-2 text-[12px] font-semibold text-tm-text-2">
          Effective date
          <input
            type="text"
            value={effectiveDate}
            onChange={(event) => {
              setEffectiveDate(event.target.value);
              setIsDirty(true);
            }}
            placeholder="e.g. May 2026"
            className="h-8 w-36 rounded-[10px] border border-tm-border bg-card px-2.5 text-[12px] font-medium text-tm-ink outline-none transition-colors placeholder:text-tm-text-3 focus:border-tm-coral/50 focus:ring-2 focus:ring-tm-coral/15"
          />
        </label>
      </div>

      {/* ── Panes ───────────────────────────────────────────────────────── */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/*
          The editor stays mounted and is hidden with CSS rather than unmounted:
          the rich-text editor owns the document, and remounting it on every
          view switch would throw away the cursor and the undo stack.
        */}
        <div
          className={cn(
            "flex min-w-0 flex-col overflow-y-auto",
            showEditor ? (showPreview ? "w-1/2 border-r border-tm-hairline" : "w-full") : "hidden",
          )}
        >
          <RichTextEditor
            content={content}
            onChange={handleContentChange}
            placeholder="Start writing the policy…"
          />
        </div>

        {showPreview ? (
          <div className={cn("flex min-w-0 flex-col", showEditor ? "w-1/2" : "w-full")}>
            <div className="flex shrink-0 items-center border-b border-tm-hairline bg-tm-paper px-4 py-2">
              <span className="text-[11px] leading-none font-bold tracking-[0.08em] text-tm-text-3 uppercase">
                Preview
              </span>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-5 sm:px-8 sm:py-6">
              <PolicyHtml content={content} />
            </div>
          </div>
        ) : null}
      </div>

      {/* ── Footer ──────────────────────────────────────────────────────── */}
      <footer className="shrink-0 border-t border-tm-hairline bg-tm-paper px-5 py-2.5 text-[11px] leading-[1.4] font-medium text-tm-text-3">
        <span className="tm-nums">Last saved {formatTimestamp(lastUpdated)}</span>
        {effectiveDate.trim() ? ` · Effective ${effectiveDate.trim()}` : null}
        {" · "}/policies is cached for an hour, so a saved change can take that long to reach
        customers.
      </footer>
    </div>
  );
}
