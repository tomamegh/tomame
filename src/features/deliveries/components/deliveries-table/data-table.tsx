"use client";

import { useState } from "react";
import {
  type ColumnFiltersState,
  type SortingState,
  type VisibilityState,
  type RowSelectionState,
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
import { useAdminDeliveries } from "../../hooks/useDeliveries";
import { columns } from "./columns";
import { Toolbar } from "./toolbar";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";

export function AdminDeliveriesTable() {
  const { data, isLoading, isFetching, refetch } = useAdminDeliveries();

  const [sorting, setSorting] = useState<SortingState>([
    { id: "createdAt", desc: true },
  ]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [globalFilter, setGlobalFilter] = useState("");
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({
    id: false,
  });
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 10,
  });

  const deliveries = data?.deliveries ?? [];

  const table = useReactTable({
    data: deliveries,
    columns,
    state: {
      sorting,
      columnFilters,
      globalFilter,
      rowSelection,
      columnVisibility,
      pagination,
    },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onGlobalFilterChange: setGlobalFilter,
    onRowSelectionChange: setRowSelection,
    onColumnVisibilityChange: setColumnVisibility,
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    enableRowSelection: true,
    globalFilterFn: "includesString",
  });

  const { pageIndex } = table.getState().pagination;
  const pageCount = table.getPageCount();
  const filteredCount = table.getFilteredRowModel().rows.length;

  return (
    <Card>
      <CardHeader>
        <Toolbar
          table={table}
          globalFilter={globalFilter}
          onGlobalFilterChange={setGlobalFilter}
          onRefresh={() => refetch()}
          isRefreshing={isFetching}
        />
      </CardHeader>

      {/* Table */}
      <CardContent className="rounded-xl border border-stone-200/60 overflow-hidden bg-white">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow
                key={headerGroup.id}
                className="bg-stone-50/80 hover:bg-stone-50/80"
              >
                {headerGroup.headers.map((header) => (
                  <TableHead
                    key={header.id}
                    style={{
                      width:
                        header.column.columnDef.size !== 150
                          ? header.column.columnDef.size
                          : undefined,
                    }}
                  >
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext(),
                        )}
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
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() && "selected"}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext(),
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="h-32 text-center text-stone-400 text-sm"
                >
                  No deliveries found
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>

      {/* Pagination bar */}
      <CardFooter className="flex items-center justify-between gap-3 flex-wrap text-sm text-stone-500">
        <p className="shrink-0">
          {table.getFilteredSelectedRowModel().rows.length > 0 && (
            <span className="font-medium text-stone-700 mr-1.5">
              {table.getFilteredSelectedRowModel().rows.length} selected ·
            </span>
          )}
          {filteredCount} of {deliveries.length} shipment
          {deliveries.length !== 1 ? "s" : ""}
        </p>

        <div className="flex items-center gap-2">
          <span className="shrink-0">Rows per page</span>
          <Select
            defaultValue="10"
            value={String(table.getState().pagination.pageSize)}
            onValueChange={(v) => {
              table.setPageSize(Number(v));
              table.setPageIndex(0);
            }}
          >
            <SelectTrigger className="w-20 h-8 text-sm">
              <SelectValue placeholder="Page Size" />
            </SelectTrigger>
            <SelectContent>
              {[10, 20, 50, 100].map((size) => (
                <SelectItem key={size} value={String(size)}>
                  {size}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-1">
          <span className="mr-2 tabular-nums">
            Page {pageIndex + 1} of {pageCount || 1}
          </span>
          <Button
            variant="outline"
            size="icon"
            className="size-8"
            onClick={() => table.setPageIndex(0)}
            disabled={!table.getCanPreviousPage()}
          >
            <ChevronsLeftIcon className="size-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="size-8"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
          >
            <ChevronLeftIcon className="size-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="size-8"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
          >
            <ChevronRightIcon className="size-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="size-8"
            onClick={() => table.setPageIndex(pageCount - 1)}
            disabled={!table.getCanNextPage()}
          >
            <ChevronsRightIcon className="size-4" />
          </Button>
        </div>
      </CardFooter>
    </Card>
  );
}
