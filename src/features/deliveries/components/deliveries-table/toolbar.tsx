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
import type { Delivery } from "../../types";

const COLUMN_LABELS: Record<string, string> = {
  id: "Order ID",
  productName: "Product",
  status: "Status",
  originCountry: "Ships From",
  carrier: "Carrier",
  trackingNumber: "Tracking #",
  estimatedDeliveryDate: "Est. Delivery",
  totalGhs: "Amount",
  createdAt: "Date",
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
}

export function Toolbar({
  table,
  globalFilter,
  onGlobalFilterChange,
}: ToolbarProps) {
  const statusFilter =
    (table.getColumn("status")?.getFilterValue() as string) ?? "";
  const countryFilter =
    (table.getColumn("originCountry")?.getFilterValue() as string) ?? "";

  const isFiltered =
    table.getState().columnFilters.length > 0 || globalFilter.length > 0;
  const selectedCount = table.getFilteredSelectedRowModel().rows.length;

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {/* Search */}
      <div className="relative flex-1 min-w-45 max-w-xs">
        <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-stone-400 pointer-events-none" />
        <Input
          placeholder="Search product or tracking..."
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
        <SelectTrigger className="w-40 h-9">
          <SelectValue placeholder="All Statuses" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="All">All Statuses</SelectItem>
          {STATUS_OPTIONS.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Country filter */}
      <Select
        value={countryFilter}
        onValueChange={(v) =>
          table.getColumn("originCountry")?.setFilterValue(v || undefined)
        }
      >
        <SelectTrigger className="w-36 h-9">
          <SelectValue placeholder="All Countries" />
        </SelectTrigger>
        <SelectContent position="popper">
          <SelectItem value="all">All Countries</SelectItem>
          {COUNTRY_OPTIONS.map((opt) => (
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
