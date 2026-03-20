"use client";

import { useState } from "react";
import {
  type ColumnFiltersState,
  type SortingState,
  type VisibilityState,
  type PaginationState,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  getPaginationRowModel,
  useReactTable,
  flexRender,
} from "@tanstack/react-table";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronsLeftIcon,
  ChevronsRightIcon,
} from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { useAdminNotifications } from "../../hooks/useNotifications";
import { columns } from "./columns";
import { Toolbar } from "./toolbar";

export function AdminNotificationsTable() {
  const { data, isLoading, isFetching, refetch } = useAdminNotifications();

  const [sorting, setSorting] = useState<SortingState>([{ id: "created_at", desc: true }]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [globalFilter, setGlobalFilter] = useState("");
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({ sent_at: false });
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 15 });

  const notifications = data?.notifications ?? [];

  const table = useReactTable({
    data: notifications,
    columns,
    state: { sorting, columnFilters, globalFilter, columnVisibility, pagination },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onGlobalFilterChange: setGlobalFilter,
    onColumnVisibilityChange: setColumnVisibility,
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    globalFilterFn: "includesString",
  });

  const { pageIndex } = table.getState().pagination;
  const pageCount = table.getPageCount();
  const filteredCount = table.getFilteredRowModel().rows.length;

  return (
    <Card className="bg-white">
      <CardHeader>
        <Toolbar
          table={table}
          globalFilter={globalFilter}
          onGlobalFilterChange={setGlobalFilter}
          onRefresh={() => refetch()}
          isRefreshing={isFetching}
        />
      </CardHeader>

      <CardContent>
        <div className="rounded-xl border border-stone-200/60 overflow-hidden bg-white">
          <Table>
            <TableHeader>
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id} className="bg-stone-50/80 hover:bg-stone-50/80">
                  {headerGroup.headers.map((header) => (
                    <TableHead
                      key={header.id}
                      style={{ width: header.column.columnDef.size !== 150 ? header.column.columnDef.size : undefined }}
                    >
                      {header.isPlaceholder
                        ? null
                        : flexRender(header.column.columnDef.header, header.getContext())}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={columns.length} className="h-32">
                    <div className="flex items-center justify-center gap-2 text-stone-400 text-sm">
                      <Spinner className="size-4" />
                      <span>Loading…</span>
                    </div>
                  </TableCell>
                </TableRow>
              ) : table.getRowModel().rows.length ? (
                table.getRowModel().rows.map((row) => (
                  <TableRow key={row.id}>
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id}>
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={columns.length} className="h-32 text-center text-stone-400 text-sm">
                    No notifications found
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>

      <CardFooter className="flex items-center justify-between gap-3 flex-wrap text-sm text-stone-500">
        <p className="shrink-0">
          {filteredCount} of {notifications.length} notification{notifications.length !== 1 ? "s" : ""}
        </p>

        <div className="flex items-center gap-2">
          <span className="shrink-0">Rows per page</span>
          <Select
            value={String(table.getState().pagination.pageSize)}
            onValueChange={(v) => { table.setPageSize(Number(v)); table.setPageIndex(0); }}
          >
            <SelectTrigger className="w-20 h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent position="popper">
              {[15, 30, 50, 100].map((size) => (
                <SelectItem key={size} value={String(size)}>{size}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-1">
          <span className="mr-2 tabular-nums">Page {pageIndex + 1} of {pageCount || 1}</span>
          <Button variant="outline" size="icon" className="size-8" onClick={() => table.setPageIndex(0)} disabled={!table.getCanPreviousPage()}>
            <ChevronsLeftIcon className="size-4" />
          </Button>
          <Button variant="outline" size="icon" className="size-8" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()}>
            <ChevronLeftIcon className="size-4" />
          </Button>
          <Button variant="outline" size="icon" className="size-8" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}>
            <ChevronRightIcon className="size-4" />
          </Button>
          <Button variant="outline" size="icon" className="size-8" onClick={() => table.setPageIndex(pageCount - 1)} disabled={!table.getCanNextPage()}>
            <ChevronsRightIcon className="size-4" />
          </Button>
        </div>
      </CardFooter>
    </Card>
  );
}
