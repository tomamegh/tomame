"use client";

import Link from "next/link";
import type { ColumnDef, Row, Table as TTable } from "@tanstack/react-table";
import {
  ArrowUpIcon,
  ArrowDownIcon,
  ChevronsUpDownIcon,
  MoreHorizontalIcon,
  CreditCardIcon,
  SmartphoneIcon,
  BuildingIcon,
  HelpCircleIcon,
  RefreshCwIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { TransactionStatusBadge } from "../transaction-status-badge";
import type { Transaction, TransactionStatus } from "../../types";

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

// ── Channel badge ─────────────────────────────────────────────────────────────

const CHANNEL_CONFIG: Record<
  string,
  { label: string; icon: React.ElementType; className: string }
> = {
  card: {
    label: "Card",
    icon: CreditCardIcon,
    className: "bg-blue-50 text-blue-700",
  },
  mobile_money: {
    label: "Mobile Money",
    icon: SmartphoneIcon,
    className: "bg-emerald-50 text-emerald-700",
  },
  bank: {
    label: "Bank",
    icon: BuildingIcon,
    className: "bg-violet-50 text-violet-700",
  },
  bank_transfer: {
    label: "Bank Transfer",
    icon: BuildingIcon,
    className: "bg-violet-50 text-violet-700",
  },
};

function ChannelBadge({ channel }: { channel: string | null }) {
  if (!channel) {
    return <span className="text-xs text-stone-400">—</span>;
  }
  const cfg = CHANNEL_CONFIG[channel] ?? {
    label: channel,
    icon: HelpCircleIcon,
    className: "bg-stone-100 text-stone-600",
  };
  const Icon = cfg.icon;
  return (
    <span
      className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${cfg.className}`}
    >
      <Icon className="size-3" />
      {cfg.label}
    </span>
  );
}

// ── Table meta type ───────────────────────────────────────────────────────────

export interface TransactionsTableMeta {
  onSync: (id: string) => void;
  syncingId: string | null;
}

// ── Column definitions ────────────────────────────────────────────────────────

export const columns: ColumnDef<Transaction>[] = [
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
    cell: ({ row }: { row: Row<Transaction> }) => (
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

  // ── Transaction ID ───────────────────────────────────────────────────────────
  {
    accessorKey: "id",
    header: "Txn ID",
    cell: ({ row }: { row: Row<Transaction> }) => (
      <span className="font-mono text-xs text-stone-500">
        #{row.original.id.slice(0, 8)}
      </span>
    ),
    enableGlobalFilter: false,
    enableHiding: true,
  },

  // ── Reference ────────────────────────────────────────────────────────────────
  {
    accessorKey: "reference",
    header: "Reference",
    cell: ({ row }: { row: Row<Transaction> }) => (
      <span className="font-mono text-xs text-stone-700 bg-stone-100 px-1.5 py-0.5 rounded">
        {row.original.reference}
      </span>
    ),
    enableGlobalFilter: true,
    enableHiding: false,
    enableSorting: false,
  },

  // ── Status ───────────────────────────────────────────────────────────────────
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }: { row: Row<Transaction> }) => (
      <TransactionStatusBadge status={row.original.status as TransactionStatus} />
    ),
    filterFn: (row, id, value: string) =>
      !value || row.getValue(id) === value,
    enableGlobalFilter: false,
    enableHiding: true,
  },

  // ── Channel ───────────────────────────────────────────────────────────────────
  {
    accessorKey: "channel",
    header: "Channel",
    cell: ({ row }: { row: Row<Transaction> }) => (
      <ChannelBadge channel={row.original.channel} />
    ),
    filterFn: (row, id, value: string) =>
      !value || row.getValue(id) === value,
    enableGlobalFilter: false,
    enableHiding: true,
    enableSorting: false,
  },

  // ── Amount ───────────────────────────────────────────────────────────────────
  {
    id: "amount_ghs",
    accessorFn: (row: Transaction) => row.amount_ghs,
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

  // ── Currency ─────────────────────────────────────────────────────────────────
  {
    accessorKey: "currency",
    header: "Currency",
    cell: ({ row }: { row: Row<Transaction> }) => (
      <span className="text-sm text-stone-500 uppercase">
        {row.original.currency}
      </span>
    ),
    enableGlobalFilter: false,
    enableHiding: true,
    enableSorting: false,
  },

  // ── Date ─────────────────────────────────────────────────────────────────────
  {
    accessorKey: "created_at",
    header: ({ column }) => (
      <SortableHeader column={column}>Date</SortableHeader>
    ),
    cell: ({ row }: { row: Row<Transaction> }) => (
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
    cell: ({ row, table }: { row: Row<Transaction>; table: TTable<Transaction> }) => {
      const txn = row.original;
      const meta = table.options.meta as TransactionsTableMeta | undefined;
      const isSyncing = meta?.syncingId === txn.id;
      return (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="size-8">
              <MoreHorizontalIcon className="size-4" />
              <span className="sr-only">Open menu</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuItem asChild>
              <Link href={`/admin/transactions/${txn.id}`}>View details</Link>
            </DropdownMenuItem>
            {txn.status === "pending" && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => meta?.onSync(txn.id)}
                  disabled={isSyncing}
                  className="gap-1.5"
                >
                  <RefreshCwIcon className={`size-3.5 ${isSyncing ? "animate-spin" : ""}`} />
                  {isSyncing ? "Syncing…" : "Sync with Paystack"}
                </DropdownMenuItem>
              </>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => navigator.clipboard.writeText(txn.reference)}
            >
              Copy reference
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => navigator.clipboard.writeText(txn.id)}
            >
              Copy transaction ID
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
