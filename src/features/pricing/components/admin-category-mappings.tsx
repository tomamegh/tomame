"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { MagnifyingGlass } from "@phosphor-icons/react/ssr";

import {
  ADMIN_TD,
  ADMIN_TH,
  ADMIN_TR,
  AdminCard,
  AdminEmpty,
  AdminTableScroller,
} from "@/components/layout/admin";
import type { AdminCategoryMappingRow, AdminPricingGroupRow } from "@/db/queries/admin-money";
import {
  AdminButton,
  AdminConfirm,
} from "@/components/layout/admin";
import { apiFetch } from "@/lib/auth/api-helpers";
import { toast } from "@/lib/sonner";
import { cn } from "@/lib/utils";
import { describeFreight, describeValueFee } from "./pricing-group-format";

/**
 * Category → pricing group. The routing table behind every quote.
 *
 * WHY IT IS ITS OWN SCREEN SECTION. This is the list that decides whether a
 * product gets a price at all: `PricingCalculator` looks the extracted category
 * up here, and a miss is not a fallback — it is `needs_review`, which the
 * customer sees as "we will get back to you". Migration 032 seeded enough rows
 * that the old wall of dropdowns was unusable, so this one searches, shows what
 * each group would actually charge, and confirms a change by naming the two
 * groups rather than their ids.
 */

export interface AdminCategoryMappingsProps {
  mappings: AdminCategoryMappingRow[];
  /** Active groups only — a deactivated group is not something to route to. */
  groups: AdminPricingGroupRow[];
}

type PendingChange = {
  mapping: AdminCategoryMappingRow;
  next: AdminPricingGroupRow;
};

export function AdminCategoryMappings({ mappings, groups }: AdminCategoryMappingsProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [pending, setPending] = useState<PendingChange | null>(null);
  const [removing, setRemoving] = useState<AdminCategoryMappingRow | null>(null);
  const [busy, setBusy] = useState(false);

  const activeGroups = useMemo(() => groups.filter((group) => group.is_active), [groups]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return mappings;
    return mappings.filter(
      (mapping) =>
        mapping.tomame_category.toLowerCase().includes(needle) ||
        mapping.pricing_group_name.toLowerCase().includes(needle) ||
        mapping.pricing_group_slug.toLowerCase().includes(needle),
    );
  }, [mappings, query]);

  /**
   * A mapping whose group has been deactivated still exists in the table, and
   * still fails to price — `getCategoryPricingMap` joins active groups only.
   * It looks configured and is not, which is worth calling out by name.
   */
  const orphaned = useMemo(() => {
    const activeIds = new Set(activeGroups.map((group) => group.id));
    return mappings.filter((mapping) => !activeIds.has(mapping.pricing_group_id));
  }, [mappings, activeGroups]);

  async function applyChange({ mapping, next }: PendingChange) {
    setBusy(true);
    try {
      await apiFetch(`/api/admin/category-mappings/${encodeURIComponent(mapping.tomame_category)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pricing_group_id: next.id }),
      });
      toast.success({
        title: `${mapping.tomame_category} now prices as ${next.name}`,
        description: "Quotes taken from now on use the new group.",
      });
      setPending(null);
      router.refresh();
    } catch (error) {
      toast.error({
        title: "Could not change the mapping",
        description: error instanceof Error ? error.message : "Please try again.",
      });
    } finally {
      setBusy(false);
    }
  }

  async function removeMapping(mapping: AdminCategoryMappingRow) {
    setBusy(true);
    try {
      await apiFetch(`/api/admin/category-mappings/${encodeURIComponent(mapping.tomame_category)}`, {
        method: "DELETE",
      });
      toast.success({
        title: `${mapping.tomame_category} unmapped`,
        description: "Products in it now go to review instead of being priced.",
      });
      setRemoving(null);
      router.refresh();
    } catch (error) {
      toast.error({
        title: "Could not remove the mapping",
        description: error instanceof Error ? error.message : "Please try again.",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <AdminCard
        title="Category routing"
        blurb="Which group prices which category. A category that is not here is not priced at all. It goes to a human."
        flush
        index={5}
        action={
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
              placeholder="Search categories"
              aria-label="Search categories or groups"
              className="h-9 w-[220px] rounded-full border border-tm-border bg-tm-paper pr-3 pl-8 text-[13px] font-medium text-tm-ink outline-none placeholder:text-tm-text-3 focus:border-tm-coral/50"
            />
          </div>
        }
      >
        {orphaned.length > 0 ? (
          <div className="px-5 pt-5">
            <p className="rounded-[14px] bg-tm-amber-bg px-4 py-3 text-[13px] leading-[1.55] font-medium text-[#7a4a06]">
              {orphaned.length} {orphaned.length === 1 ? "category points" : "categories point"} at
              a deactivated group, so {orphaned.length === 1 ? "it looks" : "they look"} configured
              but {orphaned.length === 1 ? "does" : "do"} not price:{" "}
              {orphaned.map((mapping) => mapping.tomame_category).join(", ")}.
            </p>
          </div>
        ) : null}

        {mappings.length === 0 ? (
          <div className="p-5">
            <AdminEmpty
              title="No categories are routed"
              body="Nothing can be priced automatically: every product will be sent for review until at least one category points at a pricing group. Import a pricing sheet to populate this."
            />
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-5">
            <AdminEmpty
              title="Nothing matches"
              body="No category or group matches that search. Clear it to see the full list."
            />
          </div>
        ) : (
          <AdminTableScroller>
            <table className="w-full min-w-[680px] border-collapse">
              <thead>
                <tr>
                  <th className={ADMIN_TH}>Category</th>
                  <th className={ADMIN_TH}>Priced as</th>
                  <th className={ADMIN_TH}>Which charges</th>
                  <th className={ADMIN_TH}>
                    <span className="sr-only">Remove</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((mapping) => {
                  const group = activeGroups.find((row) => row.id === mapping.pricing_group_id);
                  const selectId = `mapping-${mapping.id}`;
                  return (
                    <tr key={mapping.id} className={ADMIN_TR}>
                      <td className={cn(ADMIN_TD, "font-medium")}>{mapping.tomame_category}</td>
                      <td className={ADMIN_TD}>
                        <label htmlFor={selectId} className="sr-only">
                          Pricing group for {mapping.tomame_category}
                        </label>
                        <select
                          id={selectId}
                          value={group ? mapping.pricing_group_id : ""}
                          onChange={(event) => {
                            const next = activeGroups.find(
                              (row) => row.id === event.target.value,
                            );
                            if (next) setPending({ mapping, next });
                          }}
                          className="h-9 rounded-[10px] border border-tm-border bg-card px-2.5 text-[13px] font-medium text-tm-ink outline-none focus:border-tm-coral/50"
                        >
                          {!group ? (
                            <option value="">
                              {mapping.pricing_group_name} (deactivated)
                            </option>
                          ) : null}
                          {activeGroups.map((option) => (
                            <option key={option.id} value={option.id}>
                              {option.name}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className={cn(ADMIN_TD, "text-tm-text-2")}>
                        {group ? (
                          <>
                            {describeValueFee(group)} · {describeFreight(group).toLowerCase()}
                          </>
                        ) : (
                          <span className="text-tm-amber">Nothing (the group is deactivated)</span>
                        )}
                      </td>
                      <td className={cn(ADMIN_TD, "text-right")}>
                        <AdminButton variant="danger" onClick={() => setRemoving(mapping)}>
                          Remove
                        </AdminButton>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </AdminTableScroller>
        )}
      </AdminCard>

      <AdminConfirm
        open={pending != null}
        onOpenChange={(open) => {
          if (!open) setPending(null);
        }}
        title={pending ? `Price ${pending.mapping.tomame_category} as ${pending.next.name}?` : ""}
        consequence="Every quote taken for this category from now on is priced by the new group. Quotes a customer already holds and orders already placed are untouched."
        detail={
          pending ? (
            <div className="flex flex-col gap-1.5">
              <p>
                <span className="font-semibold">{pending.mapping.pricing_group_name}</span> →{" "}
                <span className="font-semibold">{pending.next.name}</span>
              </p>
              <p className="text-tm-text-2">
                The new group charges {describeValueFee(pending.next)}, freight{" "}
                {describeFreight(pending.next).toLowerCase()}.
              </p>
            </div>
          ) : null
        }
        confirmLabel="Change routing"
        onConfirm={() => {
          if (pending) void applyChange(pending);
        }}
        busy={busy}
      />

      <AdminConfirm
        open={removing != null}
        onOpenChange={(open) => {
          if (!open) setRemoving(null);
        }}
        title={removing ? `Stop pricing ${removing.tomame_category}?` : ""}
        consequence={
          removing
            ? `Removing this mapping does not send ${removing.tomame_category} to a different group. It sends it nowhere. Every product in it will come back unpriced, as "needs review", for a human to price by hand.`
            : ""
        }
        confirmLabel="Remove mapping"
        onConfirm={() => {
          if (removing) void removeMapping(removing);
        }}
        busy={busy}
      />
    </>
  );
}
