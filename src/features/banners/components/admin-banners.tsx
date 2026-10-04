"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { PencilSimple, Plus, Trash } from "@phosphor-icons/react/ssr";

import { AdminBadge, AdminButton, AdminCard, AdminConfirm, AdminEmpty, type AdminTone } from "@/components/layout/admin";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ApiFetchError, apiFetch } from "@/lib/api-client";
import { toast } from "@/lib/sonner";
import { cn } from "@/lib/utils";
import { createBannerSchema } from "../schema";
import {
  BANNER_PLACEMENTS,
  BANNER_TONES,
  PLACEMENT_LABELS,
  TONE_LABELS,
  bannerStatus,
  type BannerPlacement,
  type BannerStatus,
  type BannerTone,
  type SiteBanner as SiteBannerRow,
} from "../types";
import { SiteBanner } from "./site-banner";

const STATUS: Record<BannerStatus, { label: string; tone: AdminTone }> = {
  live: { label: "Live", tone: "green" },
  scheduled: { label: "Scheduled", tone: "amber" },
  ended: { label: "Ended", tone: "muted" },
  off: { label: "Off", tone: "muted" },
};

const INPUT =
  "h-10 w-full rounded-[10px] border border-tm-border bg-card px-3 text-[13px] font-medium text-tm-ink outline-none focus:border-tm-coral/50";

type Draft = {
  placement: BannerPlacement;
  tone: BannerTone;
  title: string;
  body: string;
  link_label: string;
  link_url: string;
  is_active: boolean;
  dismissible: boolean;
  starts_at: string;
  ends_at: string;
  sort_order: number;
};

const EMPTY: Draft = {
  placement: "checkout",
  tone: "info",
  title: "",
  body: "",
  link_label: "",
  link_url: "",
  is_active: false,
  dismissible: false,
  starts_at: "",
  ends_at: "",
  sort_order: 0,
};

/** ISO → the `datetime-local` value in the admin's own timezone (Accra is UTC). */
function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const fromLocalInput = (value: string) => (value ? new Date(value).toISOString() : null);

function draftOf(banner: SiteBannerRow): Draft {
  return {
    placement: banner.placement,
    tone: banner.tone,
    title: banner.title,
    body: banner.body ?? "",
    link_label: banner.link_label ?? "",
    link_url: banner.link_url ?? "",
    is_active: banner.is_active,
    dismissible: banner.dismissible,
    starts_at: toLocalInput(banner.starts_at),
    ends_at: toLocalInput(banner.ends_at),
    sort_order: banner.sort_order,
  };
}

function payloadOf(draft: Draft) {
  return {
    ...draft,
    body: draft.body.trim() || null,
    link_label: draft.link_label.trim() || null,
    link_url: draft.link_url.trim() || null,
    starts_at: fromLocalInput(draft.starts_at),
    ends_at: fromLocalInput(draft.ends_at),
  };
}

const errorMessage = (error: unknown) => (error instanceof Error && error.message ? error.message : "Try again in a moment.");

/**
 * `/admin/banners` — banners in named sections of the app (089). Grouped by
 * section so the admin sees what a customer sees in each; every write goes
 * through `/api/admin/banners`, which validates and audits.
 */
export function AdminBanners({ banners, now }: { banners: SiteBannerRow[]; now: string }) {
  const router = useRouter();
  const at = useMemo(() => new Date(now), [now]);
  const [editing, setEditing] = useState<SiteBannerRow | "new" | null>(null);
  const [deleting, setDeleting] = useState<SiteBannerRow | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function toggle(banner: SiteBannerRow, isActive: boolean) {
    setBusyId(banner.id);
    try {
      await apiFetch(`/api/admin/banners/${banner.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: isActive }),
      });
      toast.success({ title: isActive ? "Banner switched on" : "Banner switched off" });
      router.refresh();
    } catch (error) {
      toast.error({ title: "Could not change the banner", description: errorMessage(error) });
    } finally {
      setBusyId(null);
    }
  }

  async function remove(banner: SiteBannerRow) {
    setBusyId(banner.id);
    try {
      await apiFetch(`/api/admin/banners/${banner.id}`, { method: "DELETE" });
      toast.success({ title: "Banner deleted" });
      setDeleting(null);
      router.refresh();
    } catch (error) {
      toast.error({ title: "Could not delete the banner", description: errorMessage(error) });
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <div className="flex justify-end">
        <AdminButton variant="primary" onClick={() => setEditing("new")}>
          <Plus weight="bold" className="size-4" aria-hidden />
          New banner
        </AdminButton>
      </div>

      {BANNER_PLACEMENTS.map((placement, index) => {
        const rows = banners.filter((b) => b.placement === placement);
        return (
          <AdminCard key={placement} index={index + 1} title={PLACEMENT_LABELS[placement].label} blurb={PLACEMENT_LABELS[placement].where}>
            {rows.length === 0 ? (
              <AdminEmpty title="No banners here" body="Nothing shows in this section. Create one with “New banner”." />
            ) : (
              <ul className="flex flex-col gap-4">
                {rows.map((banner) => {
                  const status = STATUS[bannerStatus(banner, at)];
                  return (
                    <li key={banner.id} className="flex flex-col gap-3 rounded-[16px] border border-tm-hairline p-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <AdminBadge tone={status.tone}>{status.label}</AdminBadge>
                        <AdminBadge tone="neutral">{TONE_LABELS[banner.tone]}</AdminBadge>
                        {banner.dismissible && <AdminBadge tone="muted">Can be closed</AdminBadge>}
                        {(banner.starts_at || banner.ends_at) && (
                          <span className="text-[12px] font-medium text-tm-text-3">
                            {banner.starts_at ? `From ${new Date(banner.starts_at).toLocaleString("en-GB")}` : "Now"}
                            {banner.ends_at ? ` until ${new Date(banner.ends_at).toLocaleString("en-GB")}` : ""}
                          </span>
                        )}
                        <div className="ml-auto flex items-center gap-2">
                          <Switch
                            checked={banner.is_active}
                            disabled={busyId === banner.id}
                            onChange={(on) => void toggle(banner, on)}
                            label={`Show “${banner.title}”`}
                          />
                          <AdminButton variant="quiet" onClick={() => setEditing(banner)} aria-label="Edit banner">
                            <PencilSimple className="size-4" aria-hidden />
                            Edit
                          </AdminButton>
                          <AdminButton variant="danger" onClick={() => setDeleting(banner)} aria-label="Delete banner">
                            <Trash className="size-4" aria-hidden />
                          </AdminButton>
                        </div>
                      </div>
                      <SiteBanner banner={{ ...banner, dismissible: false }} />
                    </li>
                  );
                })}
              </ul>
            )}
          </AdminCard>
        );
      })}

      <BannerEditor
        key={editing === null ? "closed" : editing === "new" ? "new" : editing.id}
        banner={editing}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          router.refresh();
        }}
      />

      <AdminConfirm
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="Delete this banner?"
        consequence={`“${deleting?.title ?? ""}” is removed for good and disappears from the app straight away. To hide it for now and keep the wording, switch it off instead.`}
        confirmLabel="Delete banner"
        busy={deleting !== null && busyId === deleting.id}
        onConfirm={() => deleting && void remove(deleting)}
      />
    </>
  );
}

function BannerEditor({
  banner,
  onClose,
  onSaved,
}: {
  banner: SiteBannerRow | "new" | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isNew = banner === "new";
  const [draft, setDraft] = useState<Draft>(() => (banner && banner !== "new" ? draftOf(banner) : EMPTY));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
    setError(null);
  };

  async function save(event: React.FormEvent) {
    event.preventDefault();
    const payload = payloadOf(draft);
    const parsed = createBannerSchema.safeParse(payload);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check the banner and try again.");
      return;
    }
    setSaving(true);
    try {
      await apiFetch(isNew ? "/api/admin/banners" : `/api/admin/banners/${(banner as SiteBannerRow).id}`, {
        method: isNew ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      toast.success({ title: isNew ? "Banner created" : "Banner saved", description: draft.is_active ? "Live on the next page load." : "Saved, switched off." });
      onSaved();
    } catch (e) {
      setError(e instanceof ApiFetchError ? e.message : errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  const preview = {
    id: "preview",
    tone: draft.tone,
    title: draft.title || "Your headline",
    body: draft.body.trim() || null,
    link_label: draft.link_label.trim() || null,
    link_url: draft.link_url.trim() ? "#" : null,
    dismissible: false,
    updated_at: "",
  };

  return (
    <Dialog open={banner !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto rounded-[24px] border-tm-border sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle className="font-display text-xl leading-none font-bold">{isNew ? "New banner" : "Edit banner"}</DialogTitle>
          <DialogDescription className="text-[13px] leading-[1.5] text-tm-text-2">
            Short and plain works best. Customers see exactly the preview below.
          </DialogDescription>
        </DialogHeader>

        <form className="flex flex-col gap-3.5" onSubmit={save} noValidate>
          <div className="grid gap-3.5 sm:grid-cols-2">
            <Field label="Section" htmlFor="banner-placement">
              <select id="banner-placement" className={INPUT} value={draft.placement} onChange={(e) => set("placement", e.target.value as BannerPlacement)}>
                {BANNER_PLACEMENTS.map((p) => (
                  <option key={p} value={p}>
                    {PLACEMENT_LABELS[p].label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Style" htmlFor="banner-tone">
              <select id="banner-tone" className={INPUT} value={draft.tone} onChange={(e) => set("tone", e.target.value as BannerTone)}>
                {BANNER_TONES.map((t) => (
                  <option key={t} value={t}>
                    {TONE_LABELS[t]}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <p className="-mt-1.5 text-[12px] font-medium text-tm-text-3">{PLACEMENT_LABELS[draft.placement].where}</p>

          <Field label="Headline" htmlFor="banner-title">
            <input id="banner-title" className={INPUT} value={draft.title} maxLength={120} onChange={(e) => set("title", e.target.value)} placeholder="Payments from Ghana only, for now" />
          </Field>
          <Field label="Text (optional)" htmlFor="banner-body">
            <textarea
              id="banner-body"
              className={cn(INPUT, "h-auto min-h-[76px] py-2.5 leading-[1.5]")}
              value={draft.body}
              maxLength={400}
              onChange={(e) => set("body", e.target.value)}
            />
          </Field>
          <div className="grid gap-3.5 sm:grid-cols-2">
            <Field label="Link text (optional)" htmlFor="banner-link-label">
              <input id="banner-link-label" className={INPUT} value={draft.link_label} maxLength={40} onChange={(e) => set("link_label", e.target.value)} placeholder="How payment works" />
            </Field>
            <Field label="Link goes to" htmlFor="banner-link-url">
              <input id="banner-link-url" className={INPUT} value={draft.link_url} onChange={(e) => set("link_url", e.target.value)} placeholder="/policies#payment" />
            </Field>
          </div>
          <div className="grid gap-3.5 sm:grid-cols-2">
            <Field label="Show from (optional)" htmlFor="banner-starts">
              <input id="banner-starts" type="datetime-local" className={INPUT} value={draft.starts_at} onChange={(e) => set("starts_at", e.target.value)} />
            </Field>
            <Field label="Until (optional)" htmlFor="banner-ends">
              <input id="banner-ends" type="datetime-local" className={INPUT} value={draft.ends_at} onChange={(e) => set("ends_at", e.target.value)} />
            </Field>
          </div>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            <Switch checked={draft.is_active} onChange={(on) => set("is_active", on)} label="Switched on" showLabel />
            <Switch checked={draft.dismissible} onChange={(on) => set("dismissible", on)} label="Customers can close it" showLabel />
            <label className="flex items-center gap-2 text-[13px] font-semibold text-tm-ink">
              Order
              <input
                type="number"
                min={0}
                max={9999}
                className={cn(INPUT, "w-20")}
                value={draft.sort_order}
                onChange={(e) => set("sort_order", Math.max(0, Math.min(9999, Number(e.target.value) || 0)))}
              />
            </label>
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-[12px] font-semibold text-tm-text-3">Preview</span>
            <SiteBanner key={preview.tone} banner={preview} />
          </div>

          {error && (
            <p role="alert" className="text-[13px] leading-[1.4] font-medium text-tm-coral-strong">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2">
            <AdminButton onClick={onClose}>Cancel</AdminButton>
            <AdminButton type="submit" variant="primary" busy={saving}>
              {isNew ? "Create banner" : "Save banner"}
            </AdminButton>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-[13px] leading-none font-semibold text-tm-ink">
        {label}
      </label>
      {children}
    </div>
  );
}

function Switch({
  checked,
  onChange,
  label,
  disabled,
  showLabel = false,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  disabled?: boolean;
  showLabel?: boolean;
}) {
  return (
    <label className="flex w-fit cursor-pointer items-center gap-2.5">
      <input
        type="checkbox"
        role="switch"
        aria-label={label}
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className="peer sr-only"
      />
      <span
        aria-hidden
        className="relative h-6 w-11 shrink-0 rounded-full bg-tm-border transition-colors peer-checked:bg-tm-green peer-focus-visible:ring-2 peer-focus-visible:ring-tm-coral/40 peer-disabled:opacity-60 after:absolute after:top-0.5 after:left-0.5 after:size-5 after:rounded-full after:bg-white after:transition-transform after:content-[''] peer-checked:after:translate-x-5"
      />
      {showLabel && <span className="text-[13px] leading-none font-semibold text-tm-ink">{label}</span>}
    </label>
  );
}
