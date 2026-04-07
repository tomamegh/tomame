"use client";

import type { Table } from "@tanstack/react-table";
import { XIcon, RefreshCwIcon, PlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import TableGlobalFilter from "@/components/ui/table-global-filter";
import TableFilter from "@/components/ui/table-filter-select";
import type { PricingGroup } from "../../types";

const STATUS_OPTIONS = [
  { label: "All", value: "all" },
  { label: "Active", value: "active" },
  { label: "Inactive", value: "inactive" },
];

interface ToolbarProps {
  table: Table<PricingGroup>;
  globalFilter: string;
  onGlobalFilterChange: (value: string) => void;
  onRefresh: () => void;
  isRefreshing: boolean;
  onAdd: () => void;
}

export function Toolbar({
  table,
  globalFilter,
  onGlobalFilterChange,
  onRefresh,
  isRefreshing,
  onAdd,
}: ToolbarProps) {
  const isFiltered =
    table.getState().columnFilters.length > 0 || globalFilter.length > 0;

  const statusColumn = table.getColumn("status");

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <div className="relative flex-1 min-w-45 max-w-xs">
        <TableGlobalFilter
          placeholder="Search groups..."
          value={globalFilter}
          onChange={(e) => onGlobalFilterChange(e.target.value)}
        />
      </div>

      {statusColumn && (
        <TableFilter
          placeholder="Status"
          items={STATUS_OPTIONS}
          column={statusColumn}
        />
      )}

      {isFiltered && (
        <Button
          variant="ghost"
          size="sm"
          className="h-9 px-2.5 text-stone-500 gap-1"
          onClick={() => {
            table.resetColumnFilters();
            onGlobalFilterChange("");
          }}
        >
          <XIcon className="size-3.5" />
          Reset
        </Button>
      )}

      <div className="ml-auto flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          className="h-9 gap-1.5"
          onClick={onRefresh}
          disabled={isRefreshing}
        >
          <RefreshCwIcon
            className={`size-3.5 ${isRefreshing ? "animate-spin" : ""}`}
          />
          Refresh
        </Button>

        <Button size="sm" className="h-9 gap-1.5" onClick={onAdd}>
          <PlusIcon className="size-3.5" />
          Add Group
        </Button>
      </div>
    </div>
  );
}
