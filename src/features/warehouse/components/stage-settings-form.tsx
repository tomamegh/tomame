"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { PhoneIcon } from "lucide-react";

import { AdminButton } from "@/components/layout/admin/controls";
import type { StageSetting } from "@/features/shipments/stages";
import { toast } from "@/lib/sonner";
import { cn } from "@/lib/utils";

import { errorText, warehouseRequest } from "./warehouse-actions";

/**
 * Each step's customer wording and default contact (098). Admins edit; warehouse
 * operators see the same cards read-only, so they know what customers are told.
 */
export function StageSettingsForm({ settings, editable }: { settings: StageSetting[]; editable: boolean }) {
  return (
    <ol className="flex flex-col gap-3">
      {settings.map((setting, index) => (
        <StageCard key={setting.stage} setting={setting} index={index} editable={editable} />
      ))}
    </ol>
  );
}

const FIELD =
  "h-10 w-full rounded-[12px] border border-tm-border bg-card px-3 text-[13.5px] font-medium text-tm-ink outline-none placeholder:text-tm-text-3 focus:border-tm-coral/60 disabled:bg-tm-paper disabled:text-tm-text-2";

function StageCard({ setting, index, editable }: { setting: StageSetting; index: number; editable: boolean }) {
  const router = useRouter();
  const [draft, setDraft] = useState({
    title: setting.title,
    description: setting.description,
    contact_name: setting.contact_name ?? "",
    contact_phone: setting.contact_phone ?? "",
    contact_whatsapp: setting.contact_whatsapp,
    contact_hours: setting.contact_hours ?? "",
    typical_days: setting.typical_days === null ? "" : String(setting.typical_days),
  });
  const [busy, setBusy] = useState(false);
  const dirty =
    draft.title !== setting.title ||
    draft.description !== setting.description ||
    draft.contact_name !== (setting.contact_name ?? "") ||
    draft.contact_phone !== (setting.contact_phone ?? "") ||
    draft.contact_whatsapp !== setting.contact_whatsapp ||
    draft.contact_hours !== (setting.contact_hours ?? "") ||
    draft.typical_days !== (setting.typical_days === null ? "" : String(setting.typical_days));

  const set = <K extends keyof typeof draft>(key: K, value: (typeof draft)[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      const saved = await warehouseRequest<StageSetting>("/api/warehouse/stage-settings", "PUT", {
        stage: setting.stage,
        title: draft.title,
        description: draft.description,
        contact_name: draft.contact_name || null,
        contact_phone: draft.contact_phone || null,
        contact_whatsapp: draft.contact_whatsapp,
        contact_hours: draft.contact_hours || null,
        typical_days: draft.typical_days ? Number(draft.typical_days) : null,
      });
      setDraft((d) => ({ ...d, contact_phone: saved.contact_phone ?? "" }));
      toast.success({ title: `${saved.title} saved`, description: "Customers see it from their next page load." });
      router.refresh();
    } catch (error) {
      toast.error({ title: "Could not save it", description: errorText(error) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className="tm-up rounded-[20px] border border-tm-border bg-card p-4 [animation-duration:0.4s]" style={{ animationDelay: `${index * 0.03}s` }}>
      <form onSubmit={save} className="flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-tm-paper text-[12px] font-bold text-tm-text-2">
            {index + 1}
          </span>
          <input
            value={draft.title}
            onChange={(e) => set("title", e.target.value)}
            disabled={!editable}
            maxLength={60}
            required
            aria-label="Step name"
            className={cn(FIELD, "font-display h-10 text-[16px] font-bold")}
          />
        </div>
        <textarea
          value={draft.description}
          onChange={(e) => set("description", e.target.value)}
          disabled={!editable}
          maxLength={300}
          required
          rows={2}
          aria-label="What is happening at this step"
          className={cn(FIELD, "h-auto py-2.5")}
        />
        <div className="grid grid-cols-[minmax(0,1fr)] gap-2 md:grid-cols-[1fr_1fr_1fr_110px]">
          <label className="flex flex-col gap-1">
            <span className="text-[12px] font-semibold text-tm-text-2">Contact name</span>
            <input value={draft.contact_name} onChange={(e) => set("contact_name", e.target.value)} disabled={!editable} maxLength={80} placeholder="e.g. Accra warehouse" className={FIELD} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[12px] font-semibold text-tm-text-2">Phone</span>
            <input value={draft.contact_phone} onChange={(e) => set("contact_phone", e.target.value)} disabled={!editable} inputMode="tel" maxLength={30} placeholder="024 412 3456" className={FIELD} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[12px] font-semibold text-tm-text-2">Hours</span>
            <input value={draft.contact_hours} onChange={(e) => set("contact_hours", e.target.value)} disabled={!editable} maxLength={80} placeholder="Mon–Sat, 8am–6pm" className={FIELD} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[12px] font-semibold text-tm-text-2">Usual days</span>
            <input value={draft.typical_days} onChange={(e) => set("typical_days", e.target.value.replace(/\D/g, "").slice(0, 2))} disabled={!editable} inputMode="numeric" placeholder="–" className={FIELD} />
          </label>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label className="flex items-center gap-2 text-[13px] font-medium text-tm-text-2">
            <input type="checkbox" checked={draft.contact_whatsapp} onChange={(e) => set("contact_whatsapp", e.target.checked)} disabled={!editable} className="size-4 accent-tm-coral" />
            <PhoneIcon className="size-3.5" aria-hidden />
            This number takes WhatsApp
          </label>
          {editable && (
            <AdminButton type="submit" variant={dirty ? "primary" : "secondary"} busy={busy} disabled={!dirty}>
              Save
            </AdminButton>
          )}
        </div>
      </form>
    </li>
  );
}
