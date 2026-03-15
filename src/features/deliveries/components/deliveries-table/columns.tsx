"use client";

import type { ColumnDef, Row } from "@tanstack/react-table";
import Link from "next/link";
import {
  ArrowUpIcon,
  ArrowDownIcon,
  ChevronsUpDownIcon,
  MoreHorizontalIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DeliveryStatusBadge } from "../status-badge";
import type { Delivery, DeliveryStatus } from "../../types";

// ── Sortable header ───────────────────────────────────────────────────────────

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

// ── Column definitions ────────────────────────────────────────────────────────

export const columns: ColumnDef<Delivery>[] = [
  // ── Select ──────────────────────────────────────────────────────────────────
  {
    id: "select",
    header: ({ table }) => (
      <input
        type="checkbox"
        checked={table.getIsAllPageRowsSelected()}
        ref={(el) => {
          if (el) el.indeterminate = table.getIsSomePageRowsSelected();
        }}
        onChange={table.getToggleAllPageRowsSelectedHandler()}
        aria-label="Select all"
        className="size-4 rounded border-stone-300 cursor-pointer accent-stone-700"
      />
    ),
    cell: ({ row }: { row: Row<Delivery> }) => (
      <input
        type="checkbox"
        checked={row.getIsSelected()}
        disabled={!row.getCanSelect()}
        onChange={row.getToggleSelectedHandler()}
        aria-label="Select row"
        className="size-4 rounded border-stone-300 cursor-pointer accent-stone-700"
      />
    ),
    enableSorting: false,
    enableHiding: false,
    size: 44,
  },

  // ── Order ID ─────────────────────────────────────────────────────────────────
  {
    accessorKey: "id",
    header: "Order ID",
    cell: ({ row }: { row: Row<Delivery> }) => (
      <span className="font-mono text-xs text-stone-500">
        #{row.original.id.slice(0, 8)}
      </span>
    ),
    enableGlobalFilter: false,
    enableHiding: true,
  },

  // ── Product ──────────────────────────────────────────────────────────────────
  {
    accessorKey: "productName",
    header: ({ column }) => (
      <SortableHeader column={column}>Product</SortableHeader>
    ),
    cell: ({ row }: { row: Row<Delivery> }) => (
      <div className="max-w-55">
        <Link
          href={`/admin/orders/${row.original.id}`}
          className="font-medium text-stone-800 hover:text-rose-600 hover:underline line-clamp-2 text-sm leading-snug block"
        >
          {row.original.product_name}
        </Link>
      </div>
    ),
    enableGlobalFilter: true,
    enableHiding: false,
    enableSorting: true,
  },

  // ── Status ───────────────────────────────────────────────────────────────────
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }: { row: Row<Delivery> }) => (
      <DeliveryStatusBadge status={row.original.status as DeliveryStatus} />
    ),
    filterFn: (row, id, value: string) =>
      !value || row.getValue(id) === value,
    enableGlobalFilter: false,
    enableHiding: true,
  },

  // ── Ships From ───────────────────────────────────────────────────────────────
  {
    accessorKey: "originCountry",
    header: "Ships From",
    cell: ({ row }: { row: Row<Delivery> }) => {
      const flags: Record<string, string> = {
        USA: "🇺🇸",
        UK: "🇬🇧",
        CHINA: "🇨🇳",
      };
      return (
        <span className="text-sm text-stone-600">
          {flags[row.original.origin_country] ?? ""} {row.original.origin_country}
        </span>
      );
    },
    filterFn: (row, id, value: string) =>
      !value || row.getValue(id) === value,
    enableGlobalFilter: false,
    enableHiding: true,
  },

  // ── Carrier ──────────────────────────────────────────────────────────────────
  {
    accessorKey: "carrier",
    header: "Carrier",
    cell: ({ row }: { row: Row<Delivery> }) => (
      <span className="text-sm text-stone-600">
        {row.original.carrier ?? (
          <span className="text-stone-300">—</span>
        )}
      </span>
    ),
    enableGlobalFilter: true,
    enableHiding: true,
    enableSorting: false,
  },

  // ── Tracking Number ──────────────────────────────────────────────────────────
  {
    accessorKey: "trackingNumber",
    header: "Tracking #",
    cell: ({ row }: { row: Row<Delivery> }) =>
      row.original.tracking_number ? (
        <span className="font-mono text-xs text-stone-600 bg-stone-100 px-1.5 py-0.5 rounded">
          {row.original.tracking_number}
        </span>
      ) : (
        <span className="text-stone-300 text-sm">—</span>
      ),
    enableGlobalFilter: true,
    enableHiding: true,
    enableSorting: false,
  },

  // ── Est. Delivery ─────────────────────────────────────────────────────────────
  {
    accessorKey: "estimatedDeliveryDate",
    header: "Est. Delivery",
    cell: ({ row }: { row: Row<Delivery> }) =>
      row.original.estimated_delivery_date ? (
        <span className="text-sm text-stone-600 whitespace-nowrap">
          {new Date(row.original.estimated_delivery_date).toLocaleDateString(
            "en-GB",
            { day: "2-digit", month: "short", year: "numeric" },
          )}
        </span>
      ) : (
        <span className="text-stone-300 text-sm">—</span>
      ),
    enableSorting: true,
    enableGlobalFilter: false,
    enableHiding: true,
  },

  // ── Amount ───────────────────────────────────────────────────────────────────
  {
    id: "totalGhs",
    accessorFn: (row: Delivery) => row.pricing?.total_ghs ?? 0,
    header: ({ column }) => (
      <SortableHeader column={column}>Amount</SortableHeader>
    ),
    cell: ({ getValue }) => {
      const v = getValue() as number;
      return (
        <span className="font-medium text-sm text-stone-800">
          {new Intl.NumberFormat("en-GH", {
            style: "currency",
            currency: "GHS",
            minimumFractionDigits: 2,
          }).format(v)}
        </span>
      );
    },
    enableSorting: true,
    enableGlobalFilter: false,
    enableHiding: true,
  },

  // ── Date ─────────────────────────────────────────────────────────────────────
  {
    accessorKey: "createdAt",
    header: ({ column }) => (
      <SortableHeader column={column}>Date</SortableHeader>
    ),
    cell: ({ row }: { row: Row<Delivery> }) => (
      <span className="text-sm text-stone-500 whitespace-nowrap">
        {new Date(row.original.created_at).toLocaleDateString("en-GB", {
          day: "2-digit",
          month: "short",
          year: "numeric",
        })}
      </span>
    ),
    enableSorting: true,
    enableGlobalFilter: false,
    enableHiding: true,
  },

  // ── Actions ──────────────────────────────────────────────────────────────────
  {
    id: "actions",
    cell: ({ row }: { row: Row<Delivery> }) => {
      const delivery = row.original;
      return (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="size-8">
              <MoreHorizontalIcon className="size-4" />
              <span className="sr-only">Open menu</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuItem asChild>
              <Link href={`/admin/orders/${delivery.id}`}>View order</Link>
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => navigator.clipboard.writeText(delivery.id)}
            >
              Copy order ID
            </DropdownMenuItem>
            {delivery.tracking_number && (
              <DropdownMenuItem
                onClick={() =>
                  navigator.clipboard.writeText(delivery.tracking_number!)
                }
              >
                Copy tracking #
              </DropdownMenuItem>
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
