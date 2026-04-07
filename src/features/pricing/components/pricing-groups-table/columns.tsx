"use client";

import type { ColumnDef, Row, Table as TTable } from "@tanstack/react-table";
import {
  ArrowUpIcon,
  ArrowDownIcon,
  ChevronsUpDownIcon,
  MoreHorizontalIcon,
  WeightIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { PricingGroup, PricingGroupsTableMeta } from "../../types";

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

// ── Column definitions ───────────────────────────────────────────────────────

export const columns: ColumnDef<PricingGroup>[] = [
  // ── Name ────────────────────────────────────────────────────────────────────
  {
    accessorKey: "name",
    header: ({ column }) => (
      <SortableHeader column={column}>Name</SortableHeader>
    ),
    cell: ({ row }: { row: Row<PricingGroup> }) => (
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-stone-800">
          {row.original.name}
        </span>
        <Badge variant="secondary" className="text-[10px] font-normal">
          {row.original.slug}
        </Badge>
      </div>
    ),
    enableGlobalFilter: true,
    enableSorting: true,
  },

  // ── Rate ────────────────────────────────────────────────────────────────────
  {
    id: "rate",
    accessorFn: (row) => row.flat_rate_ghs,
    header: "Rate",
    cell: ({ row }: { row: Row<PricingGroup> }) => {
      const group = row.original;
      if (group.flat_rate_expression) {
        return (
          <div className="flex items-center gap-1.5">
            <WeightIcon className="size-3 text-stone-400" />
            <code className="text-xs bg-stone-100 px-1.5 py-0.5 rounded font-mono text-stone-600">
              {group.flat_rate_expression}
            </code>
          </div>
        );
      }
      return (
        <span className="text-sm text-stone-700 tabular-nums">
          GHS {group.flat_rate_ghs?.toFixed(2) ?? "—"}
        </span>
      );
    },
    enableSorting: false,
    enableGlobalFilter: false,
  },

  // ── Value Fee ───────────────────────────────────────────────────────────────
  {
    id: "value_fee",
    accessorFn: (row) => row.value_percentage,
    header: "Value Fee",
    cell: ({ row }: { row: Row<PricingGroup> }) => {
      const group = row.original;
      const basePct = (group.value_percentage * 100).toFixed(1);

      if (
        group.value_percentage_high != null &&
        group.value_threshold_usd != null
      ) {
        const highPct = (group.value_percentage_high * 100).toFixed(1);
        return (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="text-sm text-stone-700 tabular-nums cursor-help border-b border-dashed border-stone-300">
                  {basePct}%
                </span>
              </TooltipTrigger>
              <TooltipContent>
                <p className="text-xs">
                  {highPct}% over ${group.value_threshold_usd}
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        );
      }

      return (
        <span className="text-sm text-stone-700 tabular-nums">{basePct}%</span>
      );
    },
    enableSorting: false,
    enableGlobalFilter: false,
  },

  // ── Weight ──────────────────────────────────────────────────────────────────
  {
    id: "weight",
    accessorFn: (row) => row.default_weight_lbs,
    header: "Weight",
    cell: ({ row }: { row: Row<PricingGroup> }) => {
      const group = row.original;
      if (group.requires_weight) {
        return (
          <Badge
            variant="outline"
            className="text-[10px] text-amber-600 border-amber-200"
          >
            Required
          </Badge>
        );
      }
      if (group.default_weight_lbs != null) {
        return (
          <span className="text-sm text-stone-500 tabular-nums">
            {group.default_weight_lbs} lbs
          </span>
        );
      }
      return <span className="text-stone-300">—</span>;
    },
    enableSorting: false,
    enableGlobalFilter: false,
  },

  // ── Categories ──────────────────────────────────────────────────────────────
  {
    accessorKey: "category_count",
    header: "Categories",
    cell: ({ row }: { row: Row<PricingGroup> }) => (
      <span className="text-sm text-stone-500 tabular-nums">
        {row.original.category_count}
        <span className="text-stone-400 ml-1">
          {row.original.category_count === 1 ? "category" : "categories"}
        </span>
      </span>
    ),
    enableSorting: false,
    enableGlobalFilter: false,
  },

  // ── Status ──────────────────────────────────────────────────────────────────
  {
    accessorKey: "is_active",
    id: "status",
    header: "Status",
    cell: ({ row }: { row: Row<PricingGroup> }) =>
      row.original.is_active ? (
        <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-50 text-[10px]">
          Active
        </Badge>
      ) : (
        <Badge
          variant="secondary"
          className="text-stone-400 text-[10px]"
        >
          Inactive
        </Badge>
      ),
    filterFn: (row, _id, value: string) => {
      if (!value || value === "all") return true;
      if (value === "active") return row.original.is_active;
      if (value === "inactive") return !row.original.is_active;
      return true;
    },
    enableSorting: false,
    enableGlobalFilter: false,
  },

  // ── Actions ─────────────────────────────────────────────────────────────────
  {
    id: "actions",
    cell: ({
      row,
      table,
    }: {
      row: Row<PricingGroup>;
      table: TTable<PricingGroup>;
    }) => {
      const meta = table.options.meta as PricingGroupsTableMeta | undefined;
      const group = row.original;
      return (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="size-8">
              <MoreHorizontalIcon className="size-4" />
              <span className="sr-only">Open menu</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuLabel>Actions</DropdownMenuLabel>
            <DropdownMenuItem onClick={() => meta?.onEdit(group)}>
              Edit group
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => navigator.clipboard.writeText(group.id)}
            >
              Copy ID
            </DropdownMenuItem>
            {group.is_active && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-red-600 focus:text-red-600"
                  onClick={() => meta?.onDelete(group)}
                >
                  Deactivate
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      );
    },
    enableSorting: false,
    enableHiding: false,
    size: 52,
  },
];
