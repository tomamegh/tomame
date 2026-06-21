"use client";

import type { ColumnDef, Row, Table as TTable } from "@tanstack/react-table";
import { ArrowUpIcon, ArrowDownIcon, ChevronsUpDownIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
// import {
//   Select,
//   SelectContent,
//   SelectItem,
//   SelectTrigger,
//   SelectValue,
// } from "@/components/ui/select";
import { toast } from "sonner";
import {
  useUpdateCategoryMapping,
  useRemoveCategoryMapping,
} from "../../hooks/usePricingGroups";
import type { CategoryMappingsTableMeta, } from "../../types";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox";

// ── View model for each row ──────────────────────────────────────────────────

export interface CategoryRow {
  category: string;
  mappingId: string | null;
  pricingGroupId: string | null;
  pricingGroupName: string | null;
  pricingGroupSlug: string | null;
  updatedAt: string | null;
}

// ── Sortable header ──────────────────────────────────────────────────────────

function SortableHeader({
  column,
  children,
}: {
  column: {
    getIsSorted: () => false | "asc" | "desc";
    toggleSorting: (asc: boolean) => void;
  };
  children: React.ReactNode;
}) {
  const sorted = column.getIsSorted();
  return (
    <button
      className="flex items-center gap-1 font-medium hover:text-stone-800 transition-colors"
      onClick={() => column.toggleSorting(sorted === "asc")}
    >
      {children}
      {sorted === "asc" ? (
        <ArrowUpIcon className="size-3" />
      ) : sorted === "desc" ? (
        <ArrowDownIcon className="size-3" />
      ) : (
        <ChevronsUpDownIcon className="size-3 opacity-40" />
      )}
    </button>
  );
}

// ── Inline group selector cell ───────────────────────────────────────────────

function GroupSelectCell({
  row,
  table,
}: {
  row: Row<CategoryRow>;
  table: TTable<CategoryRow>;
}) {
  const meta = table.options.meta as CategoryMappingsTableMeta | undefined;
  const groups = meta?.groups ?? [];
  const activeGroups = groups.filter((g) => g.is_active);
  const updateMutation = useUpdateCategoryMapping();
  const removeMutation = useRemoveCategoryMapping();
  const isBusy = updateMutation.isPending || removeMutation.isPending;
  const { category, pricingGroupId } = row.original;
  const defaultValue = activeGroups.find((g) => g.id === pricingGroupId);

  async function handleChange(groupId: string) {
    if (groupId === "__none__") {
      if (!pricingGroupId) return;
      try {
        await removeMutation.mutateAsync(category);
        toast.success(`Mapping removed for "${category}"`);
      } catch {
        toast.error("Failed to remove mapping");
      }
      return;
    }

    try {
      await updateMutation.mutateAsync({
        category,
        pricing_group_id: groupId,
      });
      toast.success(`"${category}" mapped`);
    } catch {
      toast.error("Failed to update mapping");
    }
  }

  return (
    // <Select
    //   value={pricingGroupId ?? "__none__"}
    //   onValueChange={handleChange}
    //   disabled={isBusy}
    // >
    //   <SelectTrigger size="sm" className="w-48 text-xs">
    //     <SelectValue placeholder="Select group..." />
    //   </SelectTrigger>
    //   <SelectContent>
    //     <SelectItem value="__none__" className="text-xs text-stone-400">
    //       No group
    //     </SelectItem>
    //     {activeGroups.map((g) => (
    //       <SelectItem key={g.id} value={g.id} className="text-xs">
    //         {g.name}
    //       </SelectItem>
    //     ))}
    //   </SelectContent>
    // </Select>

    <Combobox
      items={activeGroups}
      itemToStringLabel={(v: (typeof activeGroups)[number]) => v.name}
      onValueChange={(v) => handleChange(v!.id)}
      disabled={isBusy}
      defaultValue={defaultValue}
    >
      <ComboboxInput placeholder="Select group..." aria-disabled={isBusy} />
      <ComboboxContent>
        <ComboboxEmpty>No items found.</ComboboxEmpty>
        <ComboboxList>
          {(item) => (
            <ComboboxItem key={item.id} value={item}>
              {item.name}
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}

// ── Column definitions ───────────────────────────────────────────────────────

export const columns: ColumnDef<CategoryRow>[] = [
  // ── Category ────────────────────────────────────────────────────────────────
  {
    accessorKey: "category",
    header: ({ column }) => (
      <SortableHeader column={column}>Category</SortableHeader>
    ),
    cell: ({ row }: { row: Row<CategoryRow> }) => (
      <span className="text-sm text-stone-800">{row.original.category}</span>
    ),
    enableGlobalFilter: true,
    enableSorting: true,
  },

  // ── Status ──────────────────────────────────────────────────────────────────
  {
    id: "status",
    accessorFn: (row) => (row.pricingGroupId ? "mapped" : "unmapped"),
    header: "Status",
    cell: ({ row }: { row: Row<CategoryRow> }) =>
      row.original.pricingGroupId ? (
        <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-50 text-[10px]">
          Mapped
        </Badge>
      ) : (
        <Badge
          variant="outline"
          className="text-amber-600 border-amber-200 text-[10px]"
        >
          Unmapped
        </Badge>
      ),
    filterFn: (row, _id, value: string) => {
      if (!value || value === "all") return true;
      const isMapped = !!row.original.pricingGroupId;
      if (value === "mapped") return isMapped;
      if (value === "unmapped") return !isMapped;
      return true;
    },
    enableSorting: false,
    enableGlobalFilter: false,
  },

  // ── Group ───────────────────────────────────────────────────────────────────
  {
    id: "group",
    accessorFn: (row) => row.pricingGroupName,
    header: "Pricing Group",
    cell: ({ row }: { row: Row<CategoryRow> }) => {
      const { pricingGroupName, pricingGroupSlug } = row.original;
      if (!pricingGroupName) {
        return <span className="text-stone-300">—</span>;
      }
      return (
        <div className="flex items-center gap-2">
          <span className="text-sm text-stone-700">{pricingGroupName}</span>
          <Badge variant="secondary" className="text-[10px] font-normal">
            {pricingGroupSlug}
          </Badge>
        </div>
      );
    },
    enableSorting: false,
    enableGlobalFilter: false,
  },

  // ── Actions (inline select) ─────────────────────────────────────────────────
  {
    id: "actions",
    header: "Assign",
    cell: ({ row, table }) => <GroupSelectCell row={row} table={table} />,
    enableSorting: false,
    enableHiding: false,
    size: 200,
  },
];
