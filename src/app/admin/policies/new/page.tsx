"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeftIcon, Loader2Icon } from "lucide-react";
import { toast } from "@/lib/sonner";

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

export default function NewPolicyPage() {
  const router = useRouter();
  const [label, setLabel] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleLabelChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setLabel(val);
    if (!slugTouched) setSlug(slugify(val));
  };

  const handleSlugChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSlugTouched(true);
    setSlug(slugify(e.target.value));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!label.trim() || !slug.trim()) return;

    setIsSubmitting(true);
    try {
      const res = await fetch("/api/admin/policies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: label.trim(), slug }),
      });

      const json = await res.json();

      if (!res.ok) {
        throw new Error(json?.error ?? "Failed to create policy");
      }

      router.push(`/admin/policies/${slug}`);
    } catch (err) {
      toast.error({
        title: "Could not create policy",
        description: err instanceof Error ? err.message : "Please try again.",
      });
      setIsSubmitting(false);
    }
  };

  const slugValid = /^[a-z0-9-]+$/.test(slug) && slug.length > 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link
          href="/admin/policies"
          className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-white hover:text-slate-600"
          aria-label="Back to policies"
        >
          <ArrowLeftIcon className="size-4" />
        </Link>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
            Policies
          </p>
          <h1 className="text-xl font-bold text-slate-900">New Policy</h1>
        </div>
      </div>

      {/* Form card */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs">
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Label */}
          <div className="space-y-1.5">
            <label
              htmlFor="policy-label"
              className="text-sm font-medium text-slate-700"
            >
              Policy name
            </label>
            <input
              id="policy-label"
              type="text"
              value={label}
              onChange={handleLabelChange}
              placeholder="e.g. Cookie Policy"
              required
              autoFocus
              className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none placeholder:text-slate-300 focus:border-slate-300 focus:ring-2 focus:ring-rose-400/20"
            />
          </div>

          {/* Slug */}
          <div className="space-y-1.5">
            <label
              htmlFor="policy-slug"
              className="text-sm font-medium text-slate-700"
            >
              URL slug
            </label>
            <div className="flex items-center gap-0 overflow-hidden rounded-lg border border-slate-200 focus-within:border-slate-300 focus-within:ring-2 focus-within:ring-rose-400/20">
              <span className="select-none border-r border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-400">
                /policies/
              </span>
              <input
                id="policy-slug"
                type="text"
                value={slug}
                onChange={handleSlugChange}
                placeholder="cookie-policy"
                required
                className="h-10 min-w-0 flex-1 bg-white px-3 text-sm text-slate-800 outline-none placeholder:text-slate-300"
              />
            </div>
            {slug && !slugValid && (
              <p className="text-xs text-red-500">
                Only lowercase letters, numbers, and hyphens allowed.
              </p>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <Link
              href="/admin/policies"
              className="flex h-9 items-center rounded-lg border border-slate-200 bg-white px-4 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50"
            >
              Cancel
            </Link>
            <button
              type="submit"
              disabled={isSubmitting || !slugValid || !label.trim()}
              className="flex h-9 items-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSubmitting && <Loader2Icon className="size-3.5 animate-spin" />}
              {isSubmitting ? "Creating…" : "Create & Edit"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
