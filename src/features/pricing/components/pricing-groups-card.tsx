"use client";

import { useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  useCreatePricingGroup,
  useUpdatePricingGroup,
  useDeletePricingGroup,
  type PricingGroup,
} from "../hooks/usePricingGroups";
import { PricingGroupsDataTable } from "./pricing-groups-table/data-table";

// ── Create / Edit Form ──────────────────────────────────────────────────────

interface GroupFormData {
  slug: string;
  name: string;
  rateType: "flat" | "expression";
  flat_rate_ghs: string;
  flat_rate_expression: string;
  value_percentage: string;
  value_percentage_high: string;
  value_threshold_usd: string;
  default_weight_lbs: string;
  requires_weight: boolean;
  sort_order: string;
}

const emptyForm: GroupFormData = {
  slug: "",
  name: "",
  rateType: "flat",
  flat_rate_ghs: "",
  flat_rate_expression: "",
  value_percentage: "",
  value_percentage_high: "",
  value_threshold_usd: "",
  default_weight_lbs: "",
  requires_weight: false,
  sort_order: "0",
};

function formFromGroup(g: PricingGroup): GroupFormData {
  return {
    slug: g.slug,
    name: g.name,
    rateType: g.flat_rate_expression ? "expression" : "flat",
    flat_rate_ghs: g.flat_rate_ghs?.toString() ?? "",
    flat_rate_expression: g.flat_rate_expression ?? "",
    value_percentage: ((g.value_percentage ?? 0) * 100).toString(),
    value_percentage_high:
      g.value_percentage_high != null
        ? (g.value_percentage_high * 100).toString()
        : "",
    value_threshold_usd: g.value_threshold_usd?.toString() ?? "",
    default_weight_lbs: g.default_weight_lbs?.toString() ?? "",
    requires_weight: g.requires_weight,
    sort_order: g.sort_order.toString(),
  };
}

function GroupFormDialog({
  open,
  onOpenChange,
  editGroup,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editGroup: PricingGroup | null;
}) {
  const [form, setForm] = useState<GroupFormData>(
    editGroup ? formFromGroup(editGroup) : emptyForm,
  );
  const createMutation = useCreatePricingGroup();
  const updateMutation = useUpdatePricingGroup();
  const saving = createMutation.isPending || updateMutation.isPending;

  function set<K extends keyof GroupFormData>(key: K, value: GroupFormData[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const valuePct = parseFloat(form.value_percentage) / 100;
    const valuePctHigh = form.value_percentage_high
      ? parseFloat(form.value_percentage_high) / 100
      : null;
    const thresholdUsd = form.value_threshold_usd
      ? parseFloat(form.value_threshold_usd)
      : null;

    const payload = {
      slug: form.slug,
      name: form.name,
      flat_rate_ghs:
        form.rateType === "flat" ? parseFloat(form.flat_rate_ghs) : null,
      flat_rate_expression:
        form.rateType === "expression" ? form.flat_rate_expression : null,
      value_percentage: valuePct,
      value_percentage_high: valuePctHigh,
      value_threshold_usd: thresholdUsd,
      default_weight_lbs: form.default_weight_lbs
        ? parseFloat(form.default_weight_lbs)
        : null,
      requires_weight: form.requires_weight,
      sort_order: parseInt(form.sort_order) || 0,
    };

    try {
      if (editGroup) {
        const { slug: _slug, ...updatePayload } = payload;
        await updateMutation.mutateAsync({ id: editGroup.id, ...updatePayload });
        toast.success(`"${payload.name}" updated`);
      } else {
        await createMutation.mutateAsync(payload);
        toast.success(`"${payload.name}" created`);
      }
      onOpenChange(false);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to save pricing group",
      );
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {editGroup ? "Edit Pricing Group" : "New Pricing Group"}
          </DialogTitle>
          <DialogDescription>
            {editGroup
              ? "Update the pricing configuration for this group."
              : "Create a new pricing group for product categories."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Slug + Name */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Slug</Label>
              <Input
                value={form.slug}
                onChange={(e) => set("slug", e.target.value)}
                placeholder="e.g. electronics"
                disabled={!!editGroup}
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-xs">Display Name</Label>
              <Input
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
                placeholder="e.g. Electronics"
                className="mt-1"
              />
            </div>
          </div>

          {/* Rate Type */}
          <div>
            <Label className="text-xs">Shipping Rate Type</Label>
            <div className="flex gap-3 mt-1">
              <label className="flex items-center gap-1.5 text-sm">
                <input
                  type="radio"
                  checked={form.rateType === "flat"}
                  onChange={() => set("rateType", "flat")}
                />
                Flat Rate (GHS)
              </label>
              <label className="flex items-center gap-1.5 text-sm">
                <input
                  type="radio"
                  checked={form.rateType === "expression"}
                  onChange={() => set("rateType", "expression")}
                />
                Weight Expression
              </label>
            </div>
          </div>

          {form.rateType === "flat" ? (
            <div>
              <Label className="text-xs">Flat Rate (GHS)</Label>
              <Input
                type="number"
                step="any"
                min="0"
                value={form.flat_rate_ghs}
                onChange={(e) => set("flat_rate_ghs", e.target.value)}
                placeholder="e.g. 1200"
                className="mt-1"
              />
            </div>
          ) : (
            <div>
              <Label className="text-xs">
                Weight Expression (use &quot;w&quot; for weight in lbs)
              </Label>
              <Input
                value={form.flat_rate_expression}
                onChange={(e) => set("flat_rate_expression", e.target.value)}
                placeholder='e.g. 5 + (w / 8)'
                className="mt-1 font-mono"
              />
            </div>
          )}

          {/* Value Fee */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label className="text-xs">Value Fee %</Label>
              <Input
                type="number"
                step="any"
                min="0"
                value={form.value_percentage}
                onChange={(e) => set("value_percentage", e.target.value)}
                placeholder="e.g. 5"
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-xs">High Value Fee %</Label>
              <Input
                type="number"
                step="any"
                min="0"
                value={form.value_percentage_high}
                onChange={(e) => set("value_percentage_high", e.target.value)}
                placeholder="optional"
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-xs">Threshold (USD)</Label>
              <Input
                type="number"
                step="any"
                min="0"
                value={form.value_threshold_usd}
                onChange={(e) => set("value_threshold_usd", e.target.value)}
                placeholder="e.g. 100"
                className="mt-1"
              />
            </div>
          </div>

          {/* Weight fields */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Default Weight (lbs)</Label>
              <Input
                type="number"
                step="any"
                min="0"
                value={form.default_weight_lbs}
                onChange={(e) => set("default_weight_lbs", e.target.value)}
                placeholder="optional fallback"
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-xs">Sort Order</Label>
              <Input
                type="number"
                min="0"
                value={form.sort_order}
                onChange={(e) => set("sort_order", e.target.value)}
                className="mt-1"
              />
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.requires_weight}
              onChange={(e) => set("requires_weight", e.target.checked)}
            />
            Requires weight (reject orders without weight)
          </label>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? <Spinner className="size-4 mr-1.5" /> : null}
              {editGroup ? "Save Changes" : "Create Group"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Main Card ───────────────────────────────────────────────────────────────

export function PricingGroupsCard() {
  const deleteMutation = useDeletePricingGroup();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editGroup, setEditGroup] = useState<PricingGroup | null>(null);

  function handleCreate() {
    setEditGroup(null);
    setDialogOpen(true);
  }

  function handleEdit(group: PricingGroup) {
    setEditGroup(group);
    setDialogOpen(true);
  }

  async function handleDelete(group: PricingGroup) {
    if (
      !confirm(
        `Deactivate "${group.name}"? This will not delete existing orders.`,
      )
    )
      return;
    try {
      await deleteMutation.mutateAsync(group.id);
      toast.success(`"${group.name}" deactivated`);
    } catch {
      toast.error("Failed to deactivate pricing group");
    }
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Pricing Groups</CardTitle>
          <CardDescription>
            Define shipping rates and service fees per product group.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <PricingGroupsDataTable
            onAdd={handleCreate}
            onEdit={handleEdit}
            onDelete={handleDelete}
          />
        </CardContent>
      </Card>

      <GroupFormDialog
        key={editGroup?.id ?? "new"}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editGroup={editGroup}
      />
    </>
  );
}
