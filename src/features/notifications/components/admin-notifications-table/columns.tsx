"use client";

import type { ColumnDef, Row } from "@tanstack/react-table";
import {
  ArrowUpIcon,
  ArrowDownIcon,
  ChevronsUpDownIcon,
  MoreHorizontalIcon,
  MailIcon,
  MessageCircleIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { NotificationWithUser } from "../../types";

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

// ── Status badge ──────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  pending: { label: "Pending", className: "bg-amber-50 text-amber-700 border-amber-200" },
  sent: { label: "Sent", className: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  failed: { label: "Failed", className: "bg-rose-50 text-rose-700 border-rose-200" },
};

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? { label: status, className: "bg-stone-100 text-stone-600 border-stone-200" };
  return (
    <span className={`inline-flex text-xs font-medium px-2 py-0.5 rounded-full border ${cfg.className}`}>
      {cfg.label}
    </span>
  );
}

// ── Channel badge ─────────────────────────────────────────────────────────────

function ChannelBadge({ channel }: { channel: string }) {
  const isEmail = channel === "email";
  const Icon = isEmail ? MailIcon : MessageCircleIcon;
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full border ${
      isEmail ? "bg-blue-50 text-blue-700 border-blue-200" : "bg-green-50 text-green-700 border-green-200"
    }`}>
      <Icon className="size-3" />
      {isEmail ? "Email" : "WhatsApp"}
    </span>
  );
}

// ── Column definitions ────────────────────────────────────────────────────────

export const columns: ColumnDef<NotificationWithUser>[] = [
  // ── Recipient ────────────────────────────────────────────────────────────────
  {
    id: "recipient",
    accessorFn: (row) =>
      row.user
        ? `${row.user.first_name ?? ""} ${row.user.last_name ?? ""}`.trim() || row.user.email
        : row.user_id,
    header: "Recipient",
    cell: ({ row }: { row: Row<NotificationWithUser> }) => {
      const u = row.original.user;
      if (!u) {
        return <span className="font-mono text-xs text-stone-400">{row.original.user_id.slice(0, 8)}…</span>;
      }
      const name = `${u.first_name ?? ""} ${u.last_name ?? ""}`.trim();
      return (
        <div className="min-w-0">
          {name && <p className="text-sm font-medium text-stone-800 truncate">{name}</p>}
          <p className="text-xs text-stone-400 truncate">{u.email}</p>
        </div>
      );
    },
    enableGlobalFilter: true,
    enableHiding: false,
    enableSorting: false,
  },

  // ── Event ─────────────────────────────────────────────────────────────────────
  {
    accessorKey: "event",
    header: "Event",
    cell: ({ row }: { row: Row<NotificationWithUser> }) => (
      <span className="text-sm text-stone-700 capitalize">
        {row.original.event.replace(/_/g, " ")}
      </span>
    ),
    filterFn: (row, id, value: string) => !value || row.getValue(id) === value,
    enableGlobalFilter: true,
    enableHiding: true,
    enableSorting: false,
  },

  // ── Channel ───────────────────────────────────────────────────────────────────
  {
    accessorKey: "channel",
    header: "Channel",
    cell: ({ row }: { row: Row<NotificationWithUser> }) => (
      <ChannelBadge channel={row.original.channel} />
    ),
    filterFn: (row, id, value: string) => !value || row.getValue(id) === value,
    enableGlobalFilter: false,
    enableHiding: true,
    enableSorting: false,
  },

  // ── Status ────────────────────────────────────────────────────────────────────
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }: { row: Row<NotificationWithUser> }) => (
      <StatusBadge status={row.original.status} />
    ),
    filterFn: (row, id, value: string) => !value || row.getValue(id) === value,
    enableGlobalFilter: false,
    enableHiding: true,
  },

  // ── Created at ────────────────────────────────────────────────────────────────
  {
    accessorKey: "created_at",
    header: ({ column }) => <SortableHeader column={column}>Created</SortableHeader>,
    cell: ({ row }: { row: Row<NotificationWithUser> }) => (
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

  // ── Sent at ───────────────────────────────────────────────────────────────────
  {
    accessorKey: "sent_at",
    header: "Sent",
    cell: ({ row }: { row: Row<NotificationWithUser> }) =>
      row.original.sent_at ? (
        <span className="text-sm text-stone-500 whitespace-nowrap">
          {new Date(row.original.sent_at).toLocaleDateString("en-GB", {
            day: "2-digit",
            month: "short",
            year: "numeric",
          })}
        </span>
      ) : (
        <span className="text-stone-300">—</span>
      ),
    enableSorting: false,
    enableGlobalFilter: false,
    enableHiding: true,
  },

  // ── Actions ───────────────────────────────────────────────────────────────────
  {
    id: "actions",
    cell: ({ row }: { row: Row<NotificationWithUser> }) => {
      const n = row.original;
      return (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="size-8">
              <MoreHorizontalIcon className="size-4" />
              <span className="sr-only">Open menu</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuItem onClick={() => navigator.clipboard.writeText(n.id)}>
              Copy notification ID
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => navigator.clipboard.writeText(n.user_id)}>
              Copy user ID
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
