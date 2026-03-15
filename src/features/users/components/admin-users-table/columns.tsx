"use client";

import type { ColumnDef, Row, Table as TTable } from "@tanstack/react-table";
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
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { UserRoleBadge } from "../user-role-badge";
import type { AdminUser } from "../../types";

// ── Table meta ────────────────────────────────────────────────────────────────

export interface UsersTableMeta {
  resetPassword: (userId: string) => void;
}

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

export const columns: ColumnDef<AdminUser>[] = [
  // ── Select ──────────────────────────────────────────────────────────────────
  {
    id: "select",
    header: ({ table }: { table: TTable<AdminUser> }) => (
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
    cell: ({ row }: { row: Row<AdminUser> }) => (
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

  // ── User ID ──────────────────────────────────────────────────────────────────
  {
    accessorKey: "id",
    header: "User ID",
    cell: ({ row }: { row: Row<AdminUser> }) => (
      <span className="font-mono text-xs text-stone-500">
        #{row.original.id.slice(0, 8)}
      </span>
    ),
    enableGlobalFilter: false,
    enableHiding: true,
  },

  // ── Email ────────────────────────────────────────────────────────────────────
  {
    accessorKey: "email",
    header: ({ column }) => (
      <SortableHeader column={column}>Email</SortableHeader>
    ),
    cell: ({ row }: { row: Row<AdminUser> }) => (
      <Link
        href={`/admin/users/${row.original.id}`}
        className="text-sm text-stone-800 hover:text-rose-600 hover:underline font-medium"
      >
        {row.original.email}
      </Link>
    ),
    enableGlobalFilter: true,
    enableSorting: true,
    enableHiding: false,
  },

  // ── Role ─────────────────────────────────────────────────────────────────────
  {
    accessorKey: "role",
    header: "Role",
    cell: ({ row }: { row: Row<AdminUser> }) => (
      <UserRoleBadge role={row.original.role} />
    ),
    filterFn: (row, id, value: string) => !value || value === "all" || row.getValue(id) === value,
    enableGlobalFilter: false,
    enableHiding: true,
  },

  // ── Last Sign In ─────────────────────────────────────────────────────────────
  {
    accessorKey: "lastSignInAt",
    header: ({ column }) => (
      <SortableHeader column={column}>Last Sign In</SortableHeader>
    ),
    cell: ({ row }: { row: Row<AdminUser> }) =>
      row.original.lastSignInAt ? (
        <span className="text-sm text-stone-500 whitespace-nowrap">
          {new Date(row.original.lastSignInAt).toLocaleDateString("en-GB", {
            day: "2-digit",
            month: "short",
            year: "numeric",
          })}
        </span>
      ) : (
        <span className="text-stone-300 text-sm">—</span>
      ),
    enableSorting: true,
    enableGlobalFilter: false,
    enableHiding: true,
  },

  // ── Joined ───────────────────────────────────────────────────────────────────
  {
    accessorKey: "createdAt",
    header: ({ column }) => (
      <SortableHeader column={column}>Joined</SortableHeader>
    ),
    cell: ({ row }: { row: Row<AdminUser> }) => (
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
    cell: ({ row, table }: { row: Row<AdminUser>; table: TTable<AdminUser> }) => {
      const meta = table.options.meta as UsersTableMeta | undefined;
      const user = row.original;
      return (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="size-8">
              <MoreHorizontalIcon className="size-4" />
              <span className="sr-only">Open menu</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuLabel>Actions</DropdownMenuLabel>
            <DropdownMenuItem asChild>
              <Link href={`/admin/users/${user.id}`}>View details</Link>
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => navigator.clipboard.writeText(user.id)}
            >
              Copy user ID
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => meta?.resetPassword(user.id)}
            >
              Reset password
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
