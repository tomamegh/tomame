"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeftIcon, Loader2Icon } from "lucide-react";

import { AdminCard, AdminPage } from "@/components/layout/admin";
import { LINKED_POLICY_SLUGS } from "@/features/policies/format";
import { toast } from "@/lib/sonner";
import { cn } from "@/lib/utils";

/**
 * `/admin/policies/new` — create the row, then open the editor.
 *
 * A client component because the slug mirrors the label as it is typed, which
 * is the one thing that stops an admin creating `Payment Policy` at slug
 * `payment-policy` when the storefront links to `#payment`. That mistake is the
 * whole reason the linked slugs are offered as one-click presets below: it
 * produces a policy that looks correct in this list and a link that still goes
 * nowhere.
 */
function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

const FIELD_CLASS =
  "h-10 w-full rounded-[12px] border border-tm-border bg-card px-3 text-[14px] text-tm-ink outline-none transition-colors placeholder:text-tm-text-3 focus:border-tm-coral/50 focus:ring-2 focus:ring-tm-coral/15";

export default function NewPolicyPage() {
  const router = useRouter();
  const [label, setLabel] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const slugValid = /^[a-z0-9-]+$/.test(slug) && slug.length > 0;
  const isLinkedSlug = (LINKED_POLICY_SLUGS as readonly string[]).includes(slug);

  function handleLabelChange(event: React.ChangeEvent<HTMLInputElement>) {
    const value = event.target.value;
    setLabel(value);
    if (!slugTouched) setSlug(slugify(value));
  }

  function applyPreset(preset: string) {
    setSlug(preset);
    setSlugTouched(true);
    if (!label.trim()) setLabel(preset.charAt(0).toUpperCase() + preset.slice(1));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!label.trim() || !slugValid || isSubmitting) return;

    setIsSubmitting(true);
    try {
      const res = await fetch("/api/admin/policies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: label.trim(), slug }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "Failed to create policy");

      router.push(`/admin/policies/${slug}`);
    } catch (error) {
      toast.error({
        title: "Could not create policy",
        description: error instanceof Error ? error.message : "Please try again.",
      });
      setIsSubmitting(false);
    }
  }

  return (
    <AdminPage
      title="New policy"
      blurb="Creates the row as a draft. Nothing reaches customers until you publish it in the editor."
      action={
        <Link
          href="/admin/policies"
          className="inline-flex h-9 items-center gap-1.5 rounded-full border border-tm-border bg-card px-4 text-[13px] font-semibold text-tm-text-2 transition-colors hover:bg-tm-paper"
        >
          <ArrowLeftIcon className="size-4" aria-hidden />
          Back to policies
        </Link>
      }
    >
      <AdminCard className="max-w-[640px]">
        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="policy-label"
              className="text-[13px] leading-none font-semibold text-tm-ink"
            >
              Policy name
            </label>
            <input
              id="policy-label"
              type="text"
              value={label}
              onChange={handleLabelChange}
              placeholder="e.g. Cookie policy"
              required
              autoFocus
              className={FIELD_CLASS}
            />
            <p className="text-[12px] leading-[1.4] font-medium text-tm-text-3">
              The heading customers read on /policies.
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="policy-slug"
              className="text-[13px] leading-none font-semibold text-tm-ink"
            >
              Anchor
            </label>
            <div className="flex items-stretch overflow-hidden rounded-[12px] border border-tm-border transition-colors focus-within:border-tm-coral/50 focus-within:ring-2 focus-within:ring-tm-coral/15">
              <span className="flex select-none items-center border-r border-tm-hairline bg-tm-paper px-3 text-[13px] font-medium text-tm-text-3">
                /policies#
              </span>
              <input
                id="policy-slug"
                type="text"
                value={slug}
                onChange={(event) => {
                  setSlugTouched(true);
                  setSlug(slugify(event.target.value));
                }}
                placeholder="cookies"
                required
                className="h-10 min-w-0 flex-1 bg-card px-3 text-[14px] text-tm-ink outline-none placeholder:text-tm-text-3"
              />
            </div>
            {slug && !slugValid ? (
              <p className="text-[12px] leading-[1.4] font-medium text-tm-coral-strong">
                Lowercase letters, numbers and hyphens only.
              </p>
            ) : (
              <p className="text-[12px] leading-[1.4] font-medium text-tm-text-3">
                {isLinkedSlug
                  ? "The storefront already links to this anchor — publishing this policy fixes that link."
                  : "Nothing on the storefront links to this anchor. It will be reachable by scrolling /policies."}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-[12px] leading-none font-semibold text-tm-text-2">
              Anchors the storefront already links to
            </span>
            <div className="flex flex-wrap gap-2">
              {LINKED_POLICY_SLUGS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => applyPreset(preset)}
                  aria-pressed={slug === preset}
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-[12px] leading-none font-semibold transition-colors",
                    slug === preset
                      ? "border-tm-coral/40 bg-tm-pill-bg text-tm-coral-strong"
                      : "border-tm-border bg-card text-tm-text-2 hover:bg-tm-paper",
                  )}
                >
                  {preset}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-1">
            <Link
              href="/admin/policies"
              className="inline-flex h-9 items-center rounded-full border border-tm-border bg-card px-4 text-[13px] font-semibold text-tm-text-2 transition-colors hover:bg-tm-paper"
            >
              Cancel
            </Link>
            <button
              type="submit"
              disabled={isSubmitting || !slugValid || !label.trim()}
              aria-busy={isSubmitting}
              className="tm-cta-gradient inline-flex h-9 items-center gap-1.5 rounded-full px-4 text-[13px] font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSubmitting ? <Loader2Icon className="size-3.5 animate-spin" aria-hidden /> : null}
              {isSubmitting ? "Creating…" : "Create and edit"}
            </button>
          </div>
        </form>
      </AdminCard>
    </AdminPage>
  );
}
