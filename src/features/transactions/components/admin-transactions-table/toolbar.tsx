"use client";

import type { Table } from "@tanstack/react-table";
import { SearchIcon, SlidersHorizontalIcon, XIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Transaction } from "../../types";

const COLUMN_LABELS: Record<string, string> = {
  id: "Txn ID",
  reference: "Reference",
  status: "Status",
  amountGhs: "Amount",
  currency: "Currency",
  createdAt: "Date",
};

const STATUS_OPTIONS = [
  { value: "pending", label: "Pending" },
  { value: "success", label: "Success" },
  { value: "failed", label: "Failed" },
];

interface ToolbarProps {
  table: Table<Transaction>;
  globalFilter: string;
  onGlobalFilterChange: (value: string) => void;
}

export function Toolbar({
  table,
  globalFilter,
  onGlobalFilterChange,
}: ToolbarProps) {
  const statusFilter =
    (table.getColumn("status")?.getFilterValue() as string) ?? "";

  const isFiltered =
    table.getState().columnFilters.length > 0 || globalFilter.length > 0;
  const selectedCount = table.getFilteredSelectedRowModel().rows.length;

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {/* Search */}
      <div className="relative flex-1 min-w-45 max-w-xs">
        <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-stone-400 pointer-events-none" />
        <Input
          placeholder="Search reference..."
          value={globalFilter}
          onChange={(e) => onGlobalFilterChange(e.target.value)}
          className="pl-9 h-9"
        />
      </div>

      {/* Status filter */}
      <Select
        value={statusFilter}
        onValueChange={(v) =>
          table.getColumn("status")?.setFilterValue(v || undefined)
        }
      >
        <SelectTrigger className="w-36 h-9">
          <SelectValue placeholder="All Statuses" />
        </SelectTrigger>
        <SelectContent position="popper">
          {STATUS_OPTIONS.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

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
