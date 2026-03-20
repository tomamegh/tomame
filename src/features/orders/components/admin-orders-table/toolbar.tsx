"use client";

import type { Table } from "@tanstack/react-table";
import { SlidersHorizontalIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Order, OrderStatus } from "../../types";
import TableFilter from "@/components/ui/table-filter-select";
import TableGlobalFilter from "@/components/ui/table-global-filter";

const COLUMN_LABELS: Record<string, string> = {
  id: "Order ID",
  product_name: "Product",
  status: "Status",
  origin_country: "Country",
  needs_review: "Review",
  totalGhs: "Amount",
  quantity: "Qty",
  created_at: "Date",
};

const STATUS_OPTIONS: { value: OrderStatus; label: string }[] = [
  { value: "pending", label: "Pending" },
  { value: "paid", label: "Paid" },
  { value: "processing", label: "Processing" },
  { value: "in_transit", label: "In Transit" },
  { value: "delivered", label: "Delivered" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
];

const COUNTRY_OPTIONS = [
  { value: "USA", label: "🇺🇸 USA" },
  { value: "UK", label: "🇬🇧 UK" },
  { value: "CHINA", label: "🇨🇳 China" },
];

interface ToolbarProps {
  table: Table<Order>;
  globalFilter: string;
  onGlobalFilterChange: (value: string) => void;
}

export function Toolbar({
  table,
  globalFilter,
  onGlobalFilterChange,
}: ToolbarProps) {
  const isFiltered =
    table.getState().columnFilters.length > 0 || globalFilter.length > 0;
  const selectedCount = table.getFilteredSelectedRowModel().rows.length;

  const statusColumn = table.getColumn("status");
  const countryColumn = table.getColumn("origin_country");

  const statusColumnCount =
    statusColumn?.getFacetedUniqueValues() || new Map<string, number>();

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {/* Search */}

        <div className="relative flex-1 min-w-45 max-w-xs">
        <TableGlobalFilter
          placeholder="Search orders..."
          value={globalFilter}
          onChange={(e) => onGlobalFilterChange(e.target.value)}
        />
        </div>
        {statusColumn && (
          <TableFilter
            column={statusColumn}
            placeholder="Status"
            items={STATUS_OPTIONS}
            renderItem={(item) => {
              return (
                <div className="flex items-center gap-1 justify-between">
                  <span className="text-sm">{item.label}</span>
                  <span className="text-sm text-neutral-400">
                    ({statusColumnCount.get(item.value) ?? 0})
                  </span>
                </div>
              );
            }}
          />
        )}

      {countryColumn && (
        <TableFilter
          placeholder="Country"
          column={countryColumn}
          items={COUNTRY_OPTIONS}
        />
      )}

      {/* Reset */}
      {isFiltered && (
        <Button
          variant="secondary"
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
        {/* Selected count */}
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
