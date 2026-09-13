"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { DownloadSimple, UploadSimple } from "@phosphor-icons/react/ssr";

import { AdminCard } from "@/components/layout/admin";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AdminButton } from "@/features/settings/components/admin-controls";
import { toast } from "@/lib/sonner";

/**
 * Moving the whole pricing configuration in and out as a spreadsheet.
 *
 * This is how the pricing is actually maintained in bulk — it is easier to
 * reason about forty groups in Excel than in forty dialogs — so it belongs in
 * plain sight on the console rather than buried at the bottom of a settings
 * page. The flow is unchanged: upload, read the preview the server produced,
 * and only then apply. The preview is the guardrail: an import rewrites the
 * pricing of every category in the file at once.
 */

interface ImportPreview {
  groups: {
    create: { slug: string; name: string }[];
    update: { slug: string; changes: Record<string, unknown> }[];
    unchanged: string[];
  };
  mappings: {
    create: { tomame_category: string; pricing_group_slug: string }[];
    update: { tomame_category: string; pricing_group_slug: string }[];
    unchanged: string[];
  };
  errors: string[];
}

export function AdminPricingTransfer() {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [exporting, setExporting] = useState(false);
  const [reading, setReading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [file, setFile] = useState<File | null>(null);

  async function exportSheet() {
    setExporting(true);
    try {
      const res = await fetch("/api/admin/pricing-groups/export");
      if (!res.ok) {
        const json = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(json?.error ?? "The export failed.");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download =
        res.headers.get("Content-Disposition")?.match(/filename="(.+)"/)?.[1] ??
        "pricing-config.xlsx";
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      toast.error({
        title: "Could not export",
        description: error instanceof Error ? error.message : "Please try again.",
      });
    } finally {
      setExporting(false);
    }
  }

  async function readSheet(event: React.ChangeEvent<HTMLInputElement>) {
    const chosen = event.target.files?.[0];
    if (!chosen) return;
    setFile(chosen);
    setReading(true);
    try {
      const body = new FormData();
      body.append("file", chosen);
      const res = await fetch("/api/admin/pricing-groups/import", { method: "POST", body });
      const json = (await res.json()) as { data?: ImportPreview; error?: string };
      if (!res.ok) throw new Error(json.error ?? "The file could not be read.");
      setPreview(json.data ?? null);
    } catch (error) {
      setPreview(null);
      setFile(null);
      toast.error({
        title: "Could not read that file",
        description: error instanceof Error ? error.message : "Please try again.",
      });
    } finally {
      setReading(false);
      // Let the same file be chosen again after a failure.
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  async function applyImport() {
    if (!file) return;
    setApplying(true);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/admin/pricing-groups/import?mode=confirm", {
        method: "POST",
        body,
      });
      const json = (await res.json()) as {
        data?: { groupsCreated: number; groupsUpdated: number; mappingsUpserted: number };
        error?: string;
      };
      if (!res.ok || !json.data) throw new Error(json.error ?? "The import failed.");
      const { groupsCreated, groupsUpdated, mappingsUpserted } = json.data;
      toast.success({
        title: "Pricing imported",
        description: `${groupsCreated} groups created, ${groupsUpdated} updated, ${mappingsUpserted} categories routed.`,
      });
      setPreview(null);
      setFile(null);
      router.refresh();
    } catch (error) {
      toast.error({
        title: "Import failed",
        description: error instanceof Error ? error.message : "Nothing was changed.",
      });
    } finally {
      setApplying(false);
    }
  }

  const changeCount = preview
    ? preview.groups.create.length +
      preview.groups.update.length +
      preview.mappings.create.length +
      preview.mappings.update.length
    : 0;

  return (
    <>
      <AdminCard
        title="Import and export"
        blurb="The whole pricing configuration as one spreadsheet — groups and category routing together. An import shows you what it would change before it changes it."
        index={6}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <AdminButton onClick={exportSheet} busy={exporting}>
              <DownloadSimple size={14} weight="bold" />
              Export
            </AdminButton>
            <AdminButton
              onClick={() => fileInput.current?.click()}
              busy={reading}
              variant="secondary"
            >
              <UploadSimple size={14} weight="bold" />
              Import
            </AdminButton>
          </div>
        }
      >
        <input
          ref={fileInput}
          type="file"
          accept=".xlsx,.xls"
          className="hidden"
          aria-hidden="true"
          tabIndex={-1}
          onChange={readSheet}
        />
        <p className="max-w-[70ch] text-[13px] leading-[1.55] font-medium text-tm-text-2">
          Export writes today&rsquo;s groups and routing to an .xlsx file. Import reads one back:
          rows in the file are created or updated, and anything not mentioned in it is left exactly
          as it is — an import never deletes a group or unroutes a category.
        </p>
      </AdminCard>

      <Dialog
        open={preview != null}
        onOpenChange={(open) => {
          if (!open) {
            setPreview(null);
            setFile(null);
          }
        }}
      >
        <DialogContent className="max-h-[80vh] overflow-y-auto rounded-[20px] border-tm-border sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-display text-[18px] leading-tight font-bold text-tm-ink">
              What this file would change
            </DialogTitle>
            <DialogDescription className="text-[13px] leading-[1.55] font-medium text-tm-text-2">
              Nothing has been written yet. Applying this changes the price of every future quote
              in the affected categories.
            </DialogDescription>
          </DialogHeader>

          {preview ? (
            <div className="flex flex-col gap-3 text-[13px]">
              {preview.errors.length > 0 ? (
                <div className="rounded-[14px] bg-tm-pill-bg px-4 py-3">
                  <p className="font-semibold text-tm-coral-strong">
                    The file has {preview.errors.length}{" "}
                    {preview.errors.length === 1 ? "problem" : "problems"} and cannot be applied:
                  </p>
                  <ul className="mt-1.5 list-disc pl-4 font-medium text-tm-text-2">
                    {preview.errors.map((message) => (
                      <li key={message}>{message}</li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <ChangeLine
                label="Groups created"
                items={preview.groups.create.map((group) => group.name)}
              />
              <ChangeLine
                label="Groups updated"
                items={preview.groups.update.map((group) => group.slug)}
              />
              <ChangeLine
                label="Categories newly routed"
                items={preview.mappings.create.map((mapping) => mapping.tomame_category)}
              />
              <ChangeLine
                label="Categories re-routed"
                items={preview.mappings.update.map((mapping) => mapping.tomame_category)}
              />

              {changeCount === 0 && preview.errors.length === 0 ? (
                <p className="rounded-[14px] bg-tm-paper px-4 py-3 font-medium text-tm-text-2">
                  This file matches what is already configured. Applying it would change nothing.
                </p>
              ) : null}
            </div>
          ) : null}

          <DialogFooter>
            <AdminButton
              variant="quiet"
              onClick={() => {
                setPreview(null);
                setFile(null);
              }}
              disabled={applying}
            >
              Cancel
            </AdminButton>
            <AdminButton
              variant="primary"
              onClick={applyImport}
              busy={applying}
              disabled={
                preview == null || preview.errors.length > 0 || changeCount === 0 || applying
              }
            >
              Apply {changeCount} {changeCount === 1 ? "change" : "changes"}
            </AdminButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function ChangeLine({ label, items }: { label: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div className="rounded-[14px] bg-tm-paper px-4 py-3">
      <p className="font-semibold text-tm-ink">
        {label} <span className="tm-nums">({items.length})</span>
      </p>
      <p className="mt-1 leading-[1.5] font-medium text-tm-text-2">{items.join(", ")}</p>
    </div>
  );
}
