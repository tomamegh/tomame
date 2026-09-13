"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { MagnifyingGlass } from "@phosphor-icons/react/ssr";

import {
  ADMIN_TD,
  ADMIN_TH,
  ADMIN_TR,
  AdminBadge,
  AdminCard,
  AdminEmpty,
  AdminTableScroller,
} from "@/components/layout/admin";
import type { AdminPricingGroupRow } from "@/db/queries/admin-money";
import {
  AdminButton,
  AdminConfirm,
  AdminInput,
} from "@/features/settings/components/admin-controls";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { apiFetch } from "@/lib/auth/api-helpers";
import { toast } from "@/lib/sonner";
import { cn } from "@/lib/utils";
import {
  deactivationConsequence,
  describeFreight,
  describeValueFee,
  freightShape,
} from "./pricing-group-format";

/**
 * Pricing groups — the list, searchable, with one group editable at a time.
 *
 * WHY NOT A GRID OF INPUTS. Migration 032 seeded enough groups that the old
 * screen was a wall of number boxes, every one of them live, with nothing
 * saying which had been touched. A group is eight related fields whose validity
 * depends on each other (exactly one of flat rate / weight-based; a tier
 * threshold and its high percentage stand or fall together), so it is edited in
 * a form that can state those rules, and the list stays readable.
 *
 * Every write goes to the existing routes, which validate the same rules
 * server-side with `updatePricingGroupSchema` and write an audit row. Nothing
 * here is trusted.
 */

export interface AdminPricingGroupsProps {
  groups: AdminPricingGroupRow[];
}

export function AdminPricingGroups({ groups }: AdminPricingGroupsProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [editing, setEditing] = useState<AdminPricingGroupRow | null>(null);
  const [deactivating, setDeactivating] = useState<AdminPricingGroupRow | null>(null);
  const [busy, setBusy] = useState(false);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return groups.filter((group) => {
      if (!showInactive && !group.is_active) return false;
      if (!needle) return true;
      return (
        group.name.toLowerCase().includes(needle) || group.slug.toLowerCase().includes(needle)
      );
    });
  }, [groups, query, showInactive]);

  const inactiveCount = groups.filter((group) => !group.is_active).length;
  const unpriceable = groups.filter(
    (group) => group.is_active && freightShape(group) === "unpriceable",
  );

  async function deactivate(group: AdminPricingGroupRow) {
    setBusy(true);
    try {
      await apiFetch(`/api/admin/pricing-groups/${group.id}`, { method: "DELETE" });
      toast.success({
        title: `${group.name} deactivated`,
        description: "It is no longer available to route categories to.",
      });
      setDeactivating(null);
      router.refresh();
    } catch (error) {
      toast.error({
        title: "Could not deactivate",
        description: error instanceof Error ? error.message : "Please try again.",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <AdminCard
        title="Pricing groups"
        blurb="What freight and what fee a category is priced with. A category with no group cannot be quoted at all."
        flush
        index={4}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <MagnifyingGlass
                size={14}
                weight="bold"
                className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-tm-text-3"
              />
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search groups"
                aria-label="Search pricing groups by name or slug"
                className="h-9 w-[200px] rounded-full border border-tm-border bg-tm-paper pr-3 pl-8 text-[13px] font-medium text-tm-ink outline-none placeholder:text-tm-text-3 focus:border-tm-coral/50"
              />
            </div>
            {inactiveCount > 0 ? (
              <AdminButton
                variant={showInactive ? "secondary" : "quiet"}
                onClick={() => setShowInactive((current) => !current)}
                aria-pressed={showInactive}
              >
                {showInactive ? "Hide" : "Show"} {inactiveCount} deactivated
              </AdminButton>
            ) : null}
          </div>
        }
      >
        {unpriceable.length > 0 ? (
          <div className="px-5 pt-5">
            <p className="rounded-[14px] bg-tm-amber-bg px-4 py-3 text-[13px] leading-[1.55] font-medium text-[#7a4a06]">
              {unpriceable.length === 1
                ? `${unpriceable[0]!.name} has no freight set`
                : `${unpriceable.length} active groups have no freight set`}
              , so everything routed to{" "}
              {unpriceable.length === 1 ? "it" : "them"} comes back as &ldquo;needs review&rdquo;
              instead of a price.
            </p>
          </div>
        ) : null}

        {groups.length === 0 ? (
          <div className="p-5">
            <AdminEmpty
              title="No pricing groups"
              body="Nothing can be quoted until at least one group exists — a product whose category has no group is sent for review rather than priced. Import a pricing sheet, or run the seed migrations for this database."
            />
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-5">
            <AdminEmpty
              title="Nothing matches"
              body="No group matches that search. Clear it to see the full list."
            />
          </div>
        ) : (
          <AdminTableScroller>
            <table className="w-full min-w-[820px] border-collapse">
              <thead>
                <tr>
                  <th className={ADMIN_TH}>Group</th>
                  <th className={ADMIN_TH}>Freight</th>
                  <th className={ADMIN_TH}>Tomame fee</th>
                  <th className={cn(ADMIN_TH, "text-right")}>Categories</th>
                  <th className={ADMIN_TH}>
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((group) => (
                  <tr key={group.id} className={ADMIN_TR}>
                    <td className={ADMIN_TD}>
                      <div className="flex flex-col gap-0.5">
                        <span className="flex items-center gap-2 font-semibold">
                          {group.name}
                          {!group.is_active ? (
                            <AdminBadge tone="muted">Deactivated</AdminBadge>
                          ) : null}
                        </span>
                        <span className="font-mono text-[11px] text-tm-text-3">{group.slug}</span>
                      </div>
                    </td>
                    <td className={cn(ADMIN_TD, "text-tm-text-2")}>
                      <span
                        className={
                          freightShape(group) === "unpriceable" ? "text-tm-amber" : undefined
                        }
                      >
                        {describeFreight(group)}
                      </span>
                    </td>
                    <td className={cn(ADMIN_TD, "tm-nums text-tm-text-2")}>
                      {describeValueFee(group)}
                    </td>
                    <td className={cn(ADMIN_TD, "tm-nums text-right")}>{group.category_count}</td>
                    <td className={cn(ADMIN_TD, "text-right")}>
                      <div className="inline-flex items-center gap-2">
                        <AdminButton onClick={() => setEditing(group)}>Edit</AdminButton>
                        {group.is_active ? (
                          <AdminButton variant="danger" onClick={() => setDeactivating(group)}>
                            Deactivate
                          </AdminButton>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </AdminTableScroller>
        )}
      </AdminCard>

      {editing ? (
        <EditGroupDialog
          group={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            router.refresh();
          }}
        />
      ) : null}

      <AdminConfirm
        open={deactivating != null}
        onOpenChange={(open) => {
          if (!open) setDeactivating(null);
        }}
        title={deactivating ? `Deactivate ${deactivating.name}?` : ""}
        consequence={deactivating ? deactivationConsequence(deactivating) : ""}
        confirmLabel="Deactivate"
        onConfirm={() => {
          if (deactivating) void deactivate(deactivating);
        }}
        busy={busy}
      />
    </>
  );
}

// ── Edit ─────────────────────────────────────────────────────────────────────

type FreightMode = "flat" | "weight";

/**
 * One group's fields, with the two rules the server also enforces stated on the
 * form rather than discovered through a 400: exactly one freight shape, and a
 * tier threshold only in company with its high percentage.
 */
function EditGroupDialog({
  group,
  onClose,
  onSaved,
}: {
  group: AdminPricingGroupRow;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(group.name);
  const [mode, setMode] = useState<FreightMode>(
    group.flat_rate_expression ? "weight" : "flat",
  );
  const [flatRate, setFlatRate] = useState(group.flat_rate_ghs?.toString() ?? "");
  const [valuePct, setValuePct] = useState((group.value_percentage * 100).toString());
  const [tiered, setTiered] = useState(group.value_threshold_usd != null);
  const [threshold, setThreshold] = useState(group.value_threshold_usd?.toString() ?? "");
  const [highPct, setHighPct] = useState(
    group.value_percentage_high != null ? (group.value_percentage_high * 100).toString() : "",
  );
  const [defaultWeight, setDefaultWeight] = useState(group.default_weight_lbs?.toString() ?? "");
  const [requiresWeight, setRequiresWeight] = useState(group.requires_weight);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function buildPayload(): Record<string, unknown> | string {
    const trimmedName = name.trim();
    if (!trimmedName) return "A group needs a name.";

    const value = Number(valuePct);
    if (!Number.isFinite(value) || value < 0 || value > 100) {
      return "The Tomame fee must be a percentage between 0 and 100.";
    }

    const payload: Record<string, unknown> = {
      name: trimmedName,
      value_percentage: round10(value / 100),
      requires_weight: requiresWeight,
    };

    if (mode === "flat") {
      const rate = Number(flatRate);
      if (!Number.isFinite(rate) || rate < 0) return "A flat group needs a freight rate in cedis.";
      payload.flat_rate_ghs = rate;
      payload.flat_rate_expression = null;
    } else {
      payload.flat_rate_ghs = null;
      // The column no longer holds a formula — it marks the group weight-based.
      payload.flat_rate_expression = group.flat_rate_expression || "weight";
      if (defaultWeight.trim()) {
        const weight = Number(defaultWeight);
        if (!Number.isFinite(weight) || weight <= 0) {
          return "The assumed weight must be greater than zero, or left blank.";
        }
        payload.default_weight_lbs = weight;
      } else {
        payload.default_weight_lbs = null;
      }
    }

    if (tiered) {
      const thresholdUsd = Number(threshold);
      const high = Number(highPct);
      if (!Number.isFinite(thresholdUsd) || thresholdUsd <= 0) {
        return "A tiered fee needs a threshold above zero.";
      }
      if (!Number.isFinite(high) || high < 0 || high > 100) {
        return "The second-tier fee must be a percentage between 0 and 100.";
      }
      payload.value_threshold_usd = thresholdUsd;
      payload.value_percentage_high = round10(high / 100);
    } else {
      payload.value_threshold_usd = null;
      payload.value_percentage_high = null;
    }

    return payload;
  }

  async function save() {
    const payload = buildPayload();
    if (typeof payload === "string") {
      setError(payload);
      return;
    }
    setError(null);
    setSaving(true);
    try {
      await apiFetch(`/api/admin/pricing-groups/${group.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      toast.success({
        title: `${group.name} saved`,
        description: "Quotes taken from now on use the new figures.",
      });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save this group.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent className="max-h-[85vh] overflow-y-auto rounded-[20px] border-tm-border sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display text-[18px] leading-tight font-bold text-tm-ink">
            {group.name}
          </DialogTitle>
          <DialogDescription className="text-[13px] leading-[1.55] font-medium text-tm-text-2">
            {group.category_count === 0
              ? "No category routes here yet. Saving changes nothing until one does."
              : `${group.category_count} ${group.category_count === 1 ? "category is" : "categories are"} priced by this group. Saving changes what every future quote in ${group.category_count === 1 ? "it" : "them"} costs.`}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <Field label="Name" htmlFor="group-name">
            <AdminInput
              id="group-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="w-full"
            />
          </Field>

          <Field label="Freight" hint="A group is priced one way or the other, never both.">
            <div className="flex items-center gap-2">
              {(["flat", "weight"] as FreightMode[]).map((option) => (
                <AdminButton
                  key={option}
                  variant={mode === option ? "secondary" : "quiet"}
                  aria-pressed={mode === option}
                  onClick={() => setMode(option)}
                >
                  {option === "flat" ? "Flat cedi rate" : "By weight"}
                </AdminButton>
              ))}
            </div>
          </Field>

          {mode === "flat" ? (
            <Field label="Flat rate" hint="Charged per item, in cedis." htmlFor="group-flat">
              <AdminInput
                id="group-flat"
                type="number"
                step="any"
                min="0"
                value={flatRate}
                onChange={(event) => setFlatRate(event.target.value)}
                suffix="GH₵"
                className="w-40"
              />
            </Field>
          ) : (
            <>
              <Field
                label="Assumed weight"
                hint="Used when the store lists none. Leave blank to send unweighed items to review."
                htmlFor="group-weight"
              >
                <AdminInput
                  id="group-weight"
                  type="number"
                  step="any"
                  min="0"
                  value={defaultWeight}
                  onChange={(event) => setDefaultWeight(event.target.value)}
                  suffix="lb"
                  className="w-40"
                />
              </Field>
              <label className="flex items-center gap-2 text-[13px] font-medium text-tm-ink">
                <input
                  type="checkbox"
                  checked={requiresWeight}
                  onChange={(event) => setRequiresWeight(event.target.checked)}
                  className="size-4 accent-[var(--tm-coral)]"
                />
                Refuse to price anything in this group without a weight
              </label>
              <p className="-mt-2 text-[12px] leading-[1.5] font-medium text-tm-text-3">
                The rate per pound and the handling fee are the platform constants above, not a
                figure on this group.
              </p>
            </>
          )}

          <Field label="Tomame fee" hint="A percentage of the item price." htmlFor="group-fee">
            <AdminInput
              id="group-fee"
              type="number"
              step="any"
              min="0"
              max="100"
              value={valuePct}
              onChange={(event) => setValuePct(event.target.value)}
              suffix="%"
              className="w-32"
            />
          </Field>

          <label className="flex items-center gap-2 text-[13px] font-medium text-tm-ink">
            <input
              type="checkbox"
              checked={tiered}
              onChange={(event) => setTiered(event.target.checked)}
              className="size-4 accent-[var(--tm-coral)]"
            />
            Charge a different percentage above a price threshold
          </label>

          {tiered ? (
            <div className="flex flex-wrap items-end gap-4">
              <Field label="Above" hint="Item subtotal, in dollars." htmlFor="group-threshold">
                <AdminInput
                  id="group-threshold"
                  type="number"
                  step="any"
                  min="0"
                  value={threshold}
                  onChange={(event) => setThreshold(event.target.value)}
                  suffix="$"
                  className="w-32"
                />
              </Field>
              <Field label="Charge" htmlFor="group-high">
                <AdminInput
                  id="group-high"
                  type="number"
                  step="any"
                  min="0"
                  max="100"
                  value={highPct}
                  onChange={(event) => setHighPct(event.target.value)}
                  suffix="%"
                  className="w-32"
                />
              </Field>
            </div>
          ) : null}

          <p className="text-[12px] leading-[1.5] font-medium text-tm-text-3">
            Currently priced at {describeValueFee(group)}, freight {describeFreight(group).toLowerCase()}.
          </p>

          {error ? (
            <p role="alert" className="text-[13px] font-medium text-tm-coral-strong">
              {error}
            </p>
          ) : null}
        </div>

        <DialogFooter>
          <AdminButton variant="quiet" onClick={onClose} disabled={saving}>
            Cancel
          </AdminButton>
          <AdminButton variant="primary" onClick={save} busy={saving}>
            Save group
          </AdminButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  hint,
  htmlFor,
  children,
}: {
  label: string;
  hint?: string;
  htmlFor?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor={htmlFor}
        className="text-[12px] leading-none font-bold tracking-normal text-tm-text-2"
      >
        {label}
      </label>
      {hint ? (
        <p className="max-w-[52ch] text-[12px] leading-[1.45] font-medium text-tm-text-3">{hint}</p>
      ) : null}
      {children}
    </div>
  );
}

/** Keeps `3.5 / 100` from reaching the column as 0.035000000000000003. */
function round10(value: number): number {
  return Math.round(value * 1e10) / 1e10;
}
