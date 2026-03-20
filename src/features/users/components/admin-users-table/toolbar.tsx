"use client";

import type { Table } from "@tanstack/react-table";
import { SlidersHorizontalIcon, XIcon, RefreshCwIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import TableGlobalFilter from "@/components/ui/table-global-filter";
import TableFilter from "@/components/ui/table-filter-select";
import { PlatformUser } from "../../types";

const COLUMN_LABELS: Record<string, string> = {
  id: "User ID",
  email: "Email",
  role: "Role",
  lastSignInAt: "Last Sign In",
  createdAt: "Joined",
};

const ROLES = [
  {
    label: "Admin",
    value: "admin",
  },
  {
    label: "User",
    value: "user",
  },
];

interface ToolbarProps {
  table: Table<PlatformUser>;
  globalFilter: string;
  onGlobalFilterChange: (value: string) => void;
  onRefresh: () => void;
  isRefreshing: boolean;
}

export function Toolbar({
  table,
  globalFilter,
  onGlobalFilterChange,
  onRefresh,
  isRefreshing,
}: ToolbarProps) {
  const isFiltered =
    table.getState().columnFilters.length > 0 || globalFilter.length > 0;
  const selectedCount = table.getFilteredSelectedRowModel().rows.length;

  const roleColumn = table.getColumn("role");

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {/* Search */}
      <div className="relative flex-1 min-w-45 max-w-xs">
        <TableGlobalFilter
          placeholder="Search by email..."
          value={globalFilter}
          onChange={(e) => onGlobalFilterChange(e.target.value)}
        />
      </div>

      {/* Role filter */}
      {roleColumn && (
        <TableFilter
          placeholder="Role"
          items={ROLES}
          column={roleColumn}
        />
      )}

      {/* Reset */}
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
        {selectedCount > 0 && (
          <span className="text-sm text-stone-500 bg-stone-100 px-2.5 py-1 rounded-lg">
            {selectedCount} selected
          </span>
        )}

        {/* Refresh */}
        <Button
          variant="outline"
          size="sm"
          className="h-9 gap-1.5"
          onClick={onRefresh}
          disabled={isRefreshing}
        >
          <RefreshCwIcon className={`size-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
          Refresh
        </Button>

        {/* Column visibility */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-9 gap-1.5">
              <SlidersHorizontalIcon className="size-3.5" />
              Columns
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuLabel>Toggle columns</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {table
              .getAllColumns()
              .filter((col) => col.getCanHide())
              .map((col) => (
                <DropdownMenuCheckboxItem
                  key={col.id}
                  checked={col.getIsVisible()}
                  onCheckedChange={(checked) => col.toggleVisibility(checked)}
                >
                  {COLUMN_LABELS[col.id] ?? col.id}
                </DropdownMenuCheckboxItem>
              ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
