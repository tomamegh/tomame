"use client";

import type { ColumnDef, Row, Table as TTable } from "@tanstack/react-table";
import Link from "next/link";
import {
  ArrowUpIcon,
  ArrowDownIcon,
  ChevronsUpDownIcon,
  ExternalLinkIcon,
  AlertTriangleIcon,
  MoreHorizontalIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { OrderStatusBadge } from "../order-status-badge";
import type { Order, OrderStatus } from "../../types";

// ── Table meta type ───────────────────────────────────────────────────────────

export interface OrdersTableMeta {
  updateStatus: (id: string, status: string) => void;
}

// ── State machine transitions (mirrors server) ────────────────────────────────

const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  pending: ["cancelled"],
  paid: ["processing"],
  processing: ["in_transit"],
  in_transit: ["delivered"],
  delivered: ["completed"],
};

const TRANSITION_LABELS: Record<string, string> = {
  cancelled: "Cancel order",
  processing: "Mark Processing",
  in_transit: "Mark In Transit",
  delivered: "Mark Delivered",
  completed: "Mark Completed",
};

// ── Sortable header ───────────────────────────────────────────────────────────

function SortableHeader({
  column,
  children,
}: {
  column: { getIsSorted: () => false | "asc" | "desc"; toggleSorting: (asc: boolean) => void };
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

export const columns: ColumnDef<Order>[] = [
  // ── Select ──────────────────────────────────────────────────────────────────
  {
    id: "select",
    header: ({ table }: { table: TTable<Order> }) => (
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
    cell: ({ row }: { row: Row<Order> }) => (
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
    cell: ({ row }: { row: Row<Order> }) => (
      <span className="font-mono text-xs text-stone-500">
        #{row.original.id.slice(0, 8)}
      </span>
    ),
    enableGlobalFilter: false,
    enableHiding: true,
  },

  {
    accessorKey: "productName",
    header: ({ column }) => (
      <SortableHeader column={column}>Product</SortableHeader>
    ),
    cell: ({ row }: { row: Row<Order> }) => (
      <div className="space-y-0.5 max-w-65">
        <Link
          href={`/admin/orders/${row.original.id}`}
          className="font-medium text-stone-800 hover:text-rose-600 hover:underline line-clamp-2 text-sm leading-snug block"
        >
          {row.original.productName}
        </Link>
        <a
          href={row.original.productUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs text-stone-400 hover:text-rose-500 transition-colors"
        >
          <ExternalLinkIcon className="size-3" />
          Source
        </a>
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
    cell: ({ row }: { row: Row<Order> }) => (
      <OrderStatusBadge status={row.original.status as OrderStatus} />
    ),
    filterFn: (row, id, value: string[]) => value.includes(row.getValue(id)),
    enableGlobalFilter: false,
    enableHiding: true,
  },

  // ── Origin Country ───────────────────────────────────────────────────────────
  {
    accessorKey: "originCountry",
    header: "Ships From",
    cell: ({ row }: { row: Row<Order> }) => {
      const flags: Record<string, string> = { USA: "🇺🇸", UK: "🇬🇧", CHINA: "🇨🇳" };
      return (
        <span className="text-sm text-stone-600">
          {flags[row.original.originCountry] ?? ""} {row.original.originCountry}
        </span>
      );
    },
    filterFn: (row, id, value: string[]) => value.includes(row.getValue(id)),
    enableGlobalFilter: false,
    enableHiding: true,
  },

  // ── Needs Review ─────────────────────────────────────────────────────────────
  {
    accessorKey: "needsReview",
    header: "Review",
    cell: ({ row }: { row: Row<Order> }) =>
      row.original.needsReview ? (
        <div className="inline-flex items-center gap-1 text-amber-600 text-xs font-medium bg-amber-50 px-2 py-0.5 rounded-full">
          <AlertTriangleIcon className="size-3" />
          Review
        </div>
      ) : (
        <span className="text-stone-300 text-xs">—</span>
      ),
    filterFn: (row, id, value: boolean[]) => value.includes(row.getValue(id)),
    enableGlobalFilter: false,
    enableHiding: true,
  },

  // ── Amount ───────────────────────────────────────────────────────────────────
  {
    id: "totalGhs",
    accessorFn: (row: Order) => row.pricing?.total_ghs ?? 0,
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

  // ── Quantity ─────────────────────────────────────────────────────────────────
  {
    accessorKey: "quantity",
    header: ({ column }) => (
      <SortableHeader column={column}>Qty</SortableHeader>
    ),
    cell: ({ row }: { row: Row<Order> }) => (
      <span className="text-sm text-stone-600">{row.original.quantity}</span>
    ),
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
    cell: ({ row }: { row: Row<Order> }) => (
      <span className="text-sm text-stone-500 whitespace-nowrap">
        {new Date(row.original.createdAt).toLocaleDateString("en-GB", {
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
    cell: ({ row, table }: { row: Row<Order>; table: TTable<Order> }) => {
      const meta = table.options.meta as OrdersTableMeta | undefined;
      const order = row.original;
      const transitions = ALLOWED_TRANSITIONS[order.status] ?? [];

      return (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="size-8">
              <MoreHorizontalIcon className="size-4" />
              <span className="sr-only">Open menu</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            {order.needsReview && !order.reviewedBy && (
              <>
                <DropdownMenuItem asChild className="text-amber-600 focus:text-amber-700 focus:bg-amber-50 font-medium gap-1.5">
                  <Link href={`/admin/orders/${order.id}`}>
                    <AlertTriangleIcon className="size-3.5" />
                    Review order
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
              </>
            )}
            <DropdownMenuItem asChild>
              <Link href={`/admin/orders/${order.id}`}>View details</Link>
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => navigator.clipboard.writeText(order.id)}
            >
              Copy order ID
            </DropdownMenuItem>
            {transitions.length > 0 && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuLabel>Update status</DropdownMenuLabel>
                {transitions.map((status) => (
                  <DropdownMenuItem
                    key={status}
                    onClick={() => meta?.updateStatus(order.id, status)}
                    data-variant={status === "cancelled" ? "destructive" : "default"}
                    className={status === "cancelled" ? "text-destructive focus:text-destructive" : ""}
                  >
                    {TRANSITION_LABELS[status]}
                  </DropdownMenuItem>
                ))}
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
