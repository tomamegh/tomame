"use client";

import { useState, useRef } from "react";
import { DownloadIcon, UploadIcon, FileSpreadsheetIcon } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { pricingGroupKeys } from "../hooks/usePricingGroups";

// ── Types ───────────────────────────────────────────────────────────────────

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

// ── Export Button ────────────────────────────────────────────────────────────

function ExportButton() {
  const [exporting, setExporting] = useState(false);

  async function handleExport() {
    setExporting(true);
    try {
      const res = await fetch("/api/admin/pricing-groups/export");
      if (!res.ok) {
        const json = await res.json().catch(() => null);
        throw new Error(json?.error ?? "Export failed");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download =
        res.headers.get("Content-Disposition")?.match(/filename="(.+)"/)?.[1] ??
        "pricing-config.xlsx";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success("Pricing config exported");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Export failed");
    } finally {
      setExporting(false);
    }
  }

  return (
    <Button size="sm" variant="outline" onClick={handleExport} disabled={exporting}>
      {exporting ? <Spinner className="size-4 mr-1.5" /> : <DownloadIcon className="size-4 mr-1.5" />}
      Export Excel
    </Button>
  );
}

// ── Import Flow ─────────────────────────────────────────────────────────────

function ImportButton() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [previewing, setPreviewing] = useState(false);
  const [applying, setApplying] = useState(false);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const queryClient = useQueryClient();

  async function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setSelectedFile(file);

    setPreviewing(true);
    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/admin/pricing-groups/import", {
        method: "POST",
        body: formData,
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Preview failed");

      setPreview(json.data);
      setDialogOpen(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Preview failed");
    } finally {
      setPreviewing(false);
      // Reset file input so same file can be re-selected
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleConfirm() {
    if (!selectedFile) return;

    setApplying(true);
    try {
      const formData = new FormData();
      formData.append("file", selectedFile);

      const res = await fetch("/api/admin/pricing-groups/import?mode=confirm", {
        method: "POST",
        body: formData,
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Import failed");

      const { groupsCreated, groupsUpdated, mappingsUpserted } = json.data;
      toast.success(
        `Import complete: ${groupsCreated} groups created, ${groupsUpdated} updated, ${mappingsUpserted} mappings updated`,
      );
      setDialogOpen(false);
      setPreview(null);
      setSelectedFile(null);

      // Refresh pricing data
      queryClient.invalidateQueries({ queryKey: pricingGroupKeys.all });
      queryClient.invalidateQueries({ queryKey: pricingGroupKeys.categoryMappings });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Import failed");
    } finally {
      setApplying(false);
    }
  }

  const hasChanges =
    preview &&
    (preview.groups.create.length > 0 ||
      preview.groups.update.length > 0 ||
      preview.mappings.create.length > 0 ||
      preview.mappings.update.length > 0);

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx,.xls"
        className="hidden"
        onChange={handleFileSelected}
      />
      <Button
        size="sm"
        variant="outline"
        onClick={() => fileInputRef.current?.click()}
        disabled={previewing}
      >
        {previewing ? (
          <Spinner className="size-4 mr-1.5" />
        ) : (
          <UploadIcon className="size-4 mr-1.5" />
        )}
        Import Excel
      </Button>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Import Preview</DialogTitle>
            <DialogDescription>
              Review changes before applying. Existing data not in the file will
              be preserved.
            </DialogDescription>
          </DialogHeader>

          {preview && (
            <div className="space-y-4 text-sm">
              {/* Errors */}
              {preview.errors.length > 0 && (
                <div className="rounded-lg bg-red-50 border border-red-200 p-3 space-y-1">
                  <p className="font-medium text-red-700">Validation Errors</p>
                  {preview.errors.map((err, i) => (
                    <p key={i} className="text-xs text-red-600">
                      {err}
                    </p>
                  ))}
                </div>
              )}

              {/* Groups summary */}
              <div>
                <p className="font-medium text-stone-700 mb-1">Pricing Groups</p>
                <div className="flex gap-2 flex-wrap">
                  {preview.groups.create.length > 0 && (
                    <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200">
                      +{preview.groups.create.length} new
                    </Badge>
                  )}
                  {preview.groups.update.length > 0 && (
                    <Badge className="bg-blue-100 text-blue-700 border-blue-200">
                      {preview.groups.update.length} updated
                    </Badge>
                  )}
                  {preview.groups.unchanged.length > 0 && (
                    <Badge variant="secondary">
                      {preview.groups.unchanged.length} unchanged
                    </Badge>
                  )}
                </div>
                {preview.groups.create.length > 0 && (
                  <div className="mt-2 text-xs text-stone-500">
                    New:{" "}
                    {preview.groups.create.map((g) => g.name).join(", ")}
                  </div>
                )}
                {preview.groups.update.length > 0 && (
                  <div className="mt-1 text-xs text-stone-500">
                    Updated:{" "}
                    {preview.groups.update.map((g) => g.slug).join(", ")}
                  </div>
                )}
              </div>

              {/* Mappings summary */}
              <div>
                <p className="font-medium text-stone-700 mb-1">
                  Category Mappings
                </p>
                <div className="flex gap-2 flex-wrap">
                  {preview.mappings.create.length > 0 && (
                    <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200">
                      +{preview.mappings.create.length} new
                    </Badge>
                  )}
                  {preview.mappings.update.length > 0 && (
                    <Badge className="bg-blue-100 text-blue-700 border-blue-200">
                      {preview.mappings.update.length} changed
                    </Badge>
                  )}
                  {preview.mappings.unchanged.length > 0 && (
                    <Badge variant="secondary">
                      {preview.mappings.unchanged.length} unchanged
                    </Badge>
                  )}
                </div>
              </div>

              {!hasChanges && preview.errors.length === 0 && (
                <p className="text-stone-400 text-center py-2">
                  No changes detected. The file matches the current
                  configuration.
                </p>
              )}
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDialogOpen(false)}
              disabled={applying}
            >
              Cancel
            </Button>
            <Button
              onClick={handleConfirm}
              disabled={applying || !hasChanges || (preview?.errors.length ?? 0) > 0}
            >
              {applying ? <Spinner className="size-4 mr-1.5" /> : null}
              Apply Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ── Main Card ───────────────────────────────────────────────────────────────

export function ImportExportCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileSpreadsheetIcon className="size-5 text-stone-500" />
          Import / Export
        </CardTitle>
        <CardDescription>
          Export pricing config to Excel for bulk editing, then import changes
          back. Existing data not in the file is preserved.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex gap-3">
          <ExportButton />
          <ImportButton />
        </div>
      </CardContent>
    </Card>
  );
}
