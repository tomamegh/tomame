"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeftIcon,
  Loader2Icon,
  PencilIcon,
  EyeIcon,
  Columns2Icon,
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
import { RichTextEditor } from "@/features/policies/components/rich-text-editor";
import { PolicyHtml } from "@/features/policies/components/policy-html";
import { apiFetch } from "@/lib/auth/api-helpers";
import { toast } from "@/lib/sonner";
import { cn } from "@/lib/utils";
import type { PolicyRow } from "@/features/policies/types";
import type { ApiSuccessResponse } from "@/types/api";

type ViewMode = "editor" | "split" | "preview";

const VIEW_OPTIONS: { value: ViewMode; label: string; Icon: typeof EyeIcon }[] = [
  { value: "editor",  label: "Editor",  Icon: PencilIcon  },
  { value: "split",   label: "Split",   Icon: Columns2Icon },
  { value: "preview", label: "Preview", Icon: EyeIcon     },
];

function formatTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-GB", {
    day: "numeric", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

export function PolicyEditor({ policy }: { policy: PolicyRow }) {
  const router = useRouter();

  const [content, setContent]         = useState(policy.content);
  const [isPublished, setIsPublished] = useState(policy.is_published);
  const [effectiveDate, setEffectiveDate] = useState(policy.effective_date ?? "");
  const [lastUpdated, setLastUpdated] = useState(policy.last_updated);
  const [viewMode, setViewMode]       = useState<ViewMode>("editor");
  const [isSaving, setIsSaving]       = useState(false);
  const [isDeleting, setIsDeleting]   = useState(false);
  const [isDirty, setIsDirty]         = useState(false);

  const showEditor  = viewMode === "editor"  || viewMode === "split";
  const showPreview = viewMode === "preview" || viewMode === "split";

  const handleContentChange = (html: string) => {
    setContent(html);
    setIsDirty(true);
  };

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
          ? "Changes are now live on the public page."
          : "Saved as draft — not visible to customers yet.",
      });
      router.refresh();
    } catch (err) {
      toast.error({
        title: "Could not save policy",
        description: err instanceof Error ? err.message : "Please try again.",
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
    } catch (err) {
      toast.error({
        title: "Could not delete policy",
        description: err instanceof Error ? err.message : "Please try again.",
      });
      setIsDeleting(false);
    }
  }

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs">

      {/* ── Header ───────────────────────────────────────────────── */}
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3">

        {/* Left: back + title + status */}
        <div className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            onClick={() => router.push("/admin/policies")}
            aria-label="Back to policies"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
          >
            <ArrowLeftIcon className="size-4" />
          </button>
          <div className="min-w-0">
            <h1 className="truncate text-sm font-semibold text-slate-800">{policy.label}</h1>
            <p className="text-[11px] text-slate-400">/{policy.slug}</p>
          </div>
          <span className={cn(
            "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold",
            isPublished ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500",
          )}>
            {isPublished ? "Published" : "Draft"}
          </span>
          {isDirty && (
            <span className="hidden sm:inline shrink-0 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-600">
              Unsaved
            </span>
          )}
        </div>

        {/* Right: view toggle + delete + save */}
        <div className="flex shrink-0 items-center gap-2">

          {/* View mode toggle */}
          <div className="hidden items-center gap-0.5 rounded-lg border border-slate-200 bg-slate-50 p-0.5 sm:flex">
            {VIEW_OPTIONS.map(({ value, label, Icon }) => (
              <button
                key={value}
                type="button"
                onClick={() => setViewMode(value)}
                aria-pressed={viewMode === value}
                title={label}
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                  viewMode === value
                    ? "bg-white text-slate-800 shadow-xs"
                    : "text-slate-500 hover:text-slate-700",
                )}
              >
                <Icon className="size-3.5" />
                <span className="hidden lg:inline">{label}</span>
              </button>
            ))}
          </div>

          {/* Mobile: editor / preview only */}
          <div className="flex items-center gap-0.5 rounded-lg border border-slate-200 bg-slate-50 p-0.5 sm:hidden">
            {(["editor", "preview"] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setViewMode(v)}
                aria-pressed={viewMode === v}
                className={cn(
                  "rounded-md px-2.5 py-1 text-xs font-medium capitalize transition-colors",
                  viewMode === v
                    ? "bg-white text-slate-800 shadow-xs"
                    : "text-slate-500 hover:text-slate-700",
                )}
              >
                {v}
              </button>
            ))}
          </div>

          {/* Delete */}
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <button
                type="button"
                disabled={isDeleting}
                title="Delete policy"
                className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-red-50 hover:text-red-500 disabled:opacity-40"
              >
                {isDeleting
                  ? <Loader2Icon className="size-4 animate-spin" />
                  : <Trash2Icon className="size-4" />
                }
              </button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete "{policy.label}"?</AlertDialogTitle>
                <AlertDialogDescription>
                  This permanently removes the policy and takes it off the public
                  page immediately. This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleDelete}
                  className="bg-red-500 text-white hover:bg-red-600"
                >
                  Delete policy
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          {/* Save */}
          <button
            type="button"
            onClick={handleSave}
            disabled={!isDirty || isSaving}
            className="flex h-8 items-center gap-1.5 rounded-full bg-primary px-4 text-xs font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSaving && <Loader2Icon className="size-3.5 animate-spin" />}
            {isSaving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>

      {/* ── Publish + effective date sub-bar ─────────────────────── */}
      <div className="flex shrink-0 flex-wrap items-center gap-5 border-b border-slate-100 bg-slate-50/70 px-4 py-2">
        <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-slate-600">
          <input
            type="checkbox"
            checked={isPublished}
            onChange={(e) => { setIsPublished(e.target.checked); setIsDirty(true); }}
            className="size-4 rounded border-slate-300 accent-rose-500"
          />
          Publish (visible on /policies)
        </label>
        <label className="flex items-center gap-2 text-xs font-medium text-slate-600">
          Effective date
          <input
            type="text"
            value={effectiveDate}
            onChange={(e) => { setEffectiveDate(e.target.value); setIsDirty(true); }}
            placeholder="e.g. May 2025"
            className="h-7 w-36 rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-700 outline-none placeholder:text-slate-300 focus:border-slate-300 focus:ring-2 focus:ring-rose-400/20"
          />
        </label>
      </div>

      {/* ── Panes ────────────────────────────────────────────────── */}
      <div className="flex min-h-0 flex-1 overflow-hidden">

        {/* Editor pane — always mounted, hidden via CSS when not shown */}
        <div className={cn(
          "flex min-w-0 flex-col overflow-y-auto",
          showEditor  ? (showPreview ? "w-1/2 border-r border-slate-200" : "w-full") : "hidden",
        )}>
          <RichTextEditor
            content={content}
            onChange={handleContentChange}
            placeholder="Start writing the policy…"
          />
        </div>

        {/* Preview pane */}
        {showPreview && (
          <div className={cn(
            "flex min-w-0 flex-col",
            showEditor ? "w-1/2" : "w-full",
          )}>
            <div className="flex shrink-0 items-center border-b border-slate-100 bg-slate-50 px-4 py-1.5">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                Preview
              </span>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-5 sm:px-8 sm:py-6">
              <PolicyHtml content={content} />
            </div>
          </div>
        )}
      </div>

      {/* ── Footer ───────────────────────────────────────────────── */}
      <div className="shrink-0 border-t border-slate-100 bg-slate-50 px-5 py-2 text-[11px] text-slate-400">
        Last saved {formatTimestamp(lastUpdated)}
        {effectiveDate.trim() && ` · Effective ${effectiveDate.trim()}`}
      </div>
    </div>
  );
}
