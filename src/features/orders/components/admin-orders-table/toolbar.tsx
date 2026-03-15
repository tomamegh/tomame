"use client";

import type { Column, Table } from "@tanstack/react-table";
import {
  SearchIcon,
  SlidersHorizontalIcon,
  XIcon,
  AlertTriangleIcon,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Order, OrderStatus } from "../../types";

const COLUMN_LABELS: Record<string, string> = {
  id: "Order ID",
  productName: "Product",
  status: "Status",
  originCountry: "Country",
  needsReview: "Review",
  totalGhs: "Amount",
  quantity: "Qty",
  createdAt: "Date",
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

function FacetedFilter<T>({
  column,
  title,
  options,
}: {
  column: Column<T, unknown>;
  title: string;
  options: { value: string; label: string }[];
}) {
  const filterValue = (column.getFilterValue() as string[]) ?? [];
  const counts = column.getFacetedUniqueValues();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="h-9 gap-1.5">
          {title}
          {filterValue.length > 0 && (
            <span className="ml-0.5 bg-stone-800 text-white rounded-full px-1.5 py-0.5 text-[10px] leading-none">
              {filterValue.length}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-44">
        <DropdownMenuLabel>{title}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {options.map((option) => (
          <DropdownMenuCheckboxItem
            key={option.value}
            checked={filterValue.includes(option.value)}
            onCheckedChange={(checked) =>
              column.setFilterValue(
                checked
                  ? [...filterValue, option.value]
                  : filterValue.filter((v) => v !== option.value),
              )
            }
          >
            {option.label}
            <span className="ml-auto text-stone-400 text-xs tabular-nums">
              {counts.get(option.value) ?? 0}
            </span>
          </DropdownMenuCheckboxItem>
        ))}
        {filterValue.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="justify-center text-muted-foreground text-xs"
              onClick={() => column.setFilterValue(undefined)}
            >
              Clear filter
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ── Toolbar ───────────────────────────────────────────────────────────────────

interface ToolbarProps {
  table: Table<Order>;
  globalFilter: string;
  onGlobalFilterChange: (value: string) => void;
}

export function Toolbar({ table, globalFilter, onGlobalFilterChange }: ToolbarProps) {
  const isFiltered =
    table.getState().columnFilters.length > 0 || globalFilter.length > 0;
  const selectedCount = table.getFilteredSelectedRowModel().rows.length;

  const statusColumn = table.getColumn("status");
  const countryColumn = table.getColumn("originCountry");
  const reviewColumn = table.getColumn("needsReview");
  const reviewActive = (reviewColumn?.getFilterValue() as boolean[] | undefined)?.includes(true);

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {/* Search */}
      <div className="relative flex-1 min-w-45 max-w-xs">
        <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-stone-400 pointer-events-none" />
        <Input
          placeholder="Search orders..."
          value={globalFilter}
          onChange={(e) => onGlobalFilterChange(e.target.value)}
          className="pl-9 h-9"
        />
      </div>

      {/* Status faceted filter */}
      {statusColumn && (
        <FacetedFilter
          column={statusColumn}
          title="Status"
          options={STATUS_OPTIONS}
        />
      )}

      {/* Country faceted filter */}
      {countryColumn && (
        <FacetedFilter
          column={countryColumn}
          title="Country"
          options={COUNTRY_OPTIONS}
        />
      )}

      {/* Needs review toggle */}
      {reviewColumn && (
        <Button
          variant={reviewActive ? "default" : "outline"}
          size="sm"
          className="h-9 gap-1.5"
          onClick={() =>
            reviewColumn.setFilterValue(reviewActive ? undefined : [true])
          }
        >
          <AlertTriangleIcon className="size-3.5" />
          Needs Review
        </Button>
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
