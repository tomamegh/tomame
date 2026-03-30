"use client";

import type { Table } from "@tanstack/react-table";
import { XIcon, SlidersHorizontalIcon, RefreshCwIcon } from "lucide-react";
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
import type { NotificationWithUser } from "../../types";

const COLUMN_LABELS: Record<string, string> = {
  recipient: "Recipient",
  event: "Event",
  channel: "Channel",
  status: "Status",
  created_at: "Created",
  sent_at: "Sent",
};

const STATUS_OPTIONS = [
  { value: "pending", label: "Pending" },
  { value: "sent", label: "Sent" },
  { value: "failed", label: "Failed" },
];

const CHANNEL_OPTIONS = [
  { value: "email", label: "Email" },
  { value: "whatsapp", label: "WhatsApp" },
];

interface ToolbarProps {
  table: Table<NotificationWithUser>;
  globalFilter: string;
  onGlobalFilterChange: (value: string) => void;
  onRefresh: () => void;
  isRefreshing: boolean;
}

export function Toolbar({ table, globalFilter, onGlobalFilterChange, onRefresh, isRefreshing }: ToolbarProps) {
  const isFiltered = table.getState().columnFilters.length > 0 || globalFilter.length > 0;

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <div className="relative flex-1 min-w-45 max-w-xs">
        <TableGlobalFilter
          placeholder="Search recipient or event…"
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
        items={CHANNEL_OPTIONS}
        placeholder="Channel"
        column={table.getColumn("channel")!}
      />

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
