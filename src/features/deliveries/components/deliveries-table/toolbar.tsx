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
import type { Delivery } from "../../types";
import TableGlobalFilter from "@/components/ui/table-global-filter";
import TableFilter from "@/components/ui/table-filter-select";

const COLUMN_LABELS: Record<string, string> = {
  id: "Order ID",
  product_name: "Product",
  status: "Status",
  origin_country: "Ships From",
  carrier: "Carrier",
  tracking_number: "Tracking #",
  tracking_url: "Track Link",
  estimated_delivery_date: "Est. Delivery",
  totalGhs: "Amount",
  created_at: "Date",
};

const STATUS_OPTIONS = [
  { value: "processing", label: "Processing" },
  { value: "in_transit", label: "In Transit" },
  { value: "delivered", label: "Delivered" },
  { value: "completed", label: "Completed" },
];

const COUNTRY_OPTIONS = [
  { value: "USA", label: "🇺🇸 USA" },
  { value: "UK", label: "🇬🇧 UK" },
  { value: "CHINA", label: "🇨🇳 China" },
];

interface ToolbarProps {
  table: Table<Delivery>;
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

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {/* Search */}
      <div className="relative flex-1 min-w-45 max-w-xs">
        <TableGlobalFilter
          placeholder="Search product or tracking..."
          value={globalFilter}
          onChange={(e) => onGlobalFilterChange(e.target.value)}
        />
      </div>

      <TableFilter
        items={STATUS_OPTIONS}
        placeholder="Status"
        column={table.getColumn("status")!}
      />

      <TableFilter
        items={COUNTRY_OPTIONS}
        placeholder="Country"
        column={table.getColumn("origin_country")!}
      />

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
