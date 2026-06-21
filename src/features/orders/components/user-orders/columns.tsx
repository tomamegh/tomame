"use client";

import type { ColumnDef, Row, Table as TTable } from "@tanstack/react-table";
import Link from "next/link";
import {
  ArrowUpIcon,
  ArrowDownIcon,
  ChevronsUpDownIcon,
  ExternalLinkIcon,
  MoreHorizontalIcon,
  CopyIcon,
  PackageIcon,
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
import Image from "next/image";
import { cn, getBrandConfig } from "@/lib/utils";

// ── Table meta type ───────────────────────────────────────────────────────────

export interface OrdersTableMeta {
  updateStatus: (id: string, status: string) => void;
}


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

export const columns: ColumnDef<Order>[] = [

  {
    accessorKey: "product_name",
    header: ({ column }) => (
      <SortableHeader column={column}>Product</SortableHeader>
    ),
    cell: ({ row }: { row: Row<Order> }) => (
      <div className="relative flex items-center gap-3">
        {row.original.product_image_url ? (
          <div className="relative size-14 sm:size-16 md:size-20 shrink-0">
            <Image
              src={row.original.product_image_url}
              alt={row.original.product_name}
              fill
              className="object-contain"
            />
          </div>
        ) : (
          <div className="size-14 sm:size-16 md:size-20 rounded-lg border border-stone-200 bg-stone-50 flex items-center justify-center p-1.5">
            <PackageIcon className="size-7 text-stone-300" />
          </div>
        )}
        <div className="w-full relative space-y-2 max-w-86 md:max-w-90">
          <p
            // href={`/admin/orders/${row.original.id}`}
            className="block font-medium text-stone-800 hover:text-sky-600 overflow-hidden text-ellipsis line-clamp-2"
            // className="w-full font-medium text-stone-800 hover:text-sky-600 line-clamp-2"
          >
            {row.original.product_name}
          </p>
          <span
            className={cn(
              "block w-fit rounded-lg px-2",
              getBrandConfig(row.original.extraction_metadata?.platform || "").pill,
            )}
          >
            {row.original.extraction_metadata?.platform || "store"}
          </span>
        </div>
      </div>
    ),
    enableGlobalFilter: true,
    enableHiding: false,
    enableSorting: true,
  },

  {
    accessorKey: "created_at",
    header: ({ column }) => (
      <SortableHeader column={column}>Date</SortableHeader>
    ),
    cell: ({ row }: { row: Row<Order> }) => (
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

  {
    id: "totalGhs",
    accessorFn: (row: Order) => row.pricing?.total_ghs ?? 0,
    header: ({ column }) => (
      <SortableHeader column={column}>Total</SortableHeader>
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

  {
    id: "actions",
    cell: ({ row }: { row: Row<Order>; table: TTable<Order> }) => {
      const order = row.original;

      return (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="icon" className="size-8">
              <MoreHorizontalIcon className="size-4" />
              <span className="sr-only">Open menu</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuLabel>Actions</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="gap-2"
              onClick={() => navigator.clipboard.writeText(order.id)}
            >
              Copy ID
              <CopyIcon className="stroke-neutral-500" />
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link
                href={`/admin/orders/${order.id}`}
                className="inline-flex items-center gap-2 w-full"
              >
                View details
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => navigator.clipboard.writeText(order.id)}
            >
              <Link
                href={row.original.product_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2"
              >
                View Source
                <ExternalLinkIcon className="stroke-neutral-500" />
              </Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      );
    },
    enableSorting: false,
    enableHiding: false,
    size: 52,
  },
];
