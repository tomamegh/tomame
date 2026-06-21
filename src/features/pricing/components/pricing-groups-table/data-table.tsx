"use client";

import { useState } from "react";
import {
  type ColumnFiltersState,
  type SortingState,
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
import { CardFooter } from "@/components/ui/card";
import { usePricingGroups } from "../../hooks/usePricingGroups";
import type { PricingGroup, PricingGroupsTableMeta } from "../../types";
import { columns } from "./columns";
import { Toolbar } from "./toolbar";

interface PricingGroupsDataTableProps {
  onAdd: () => void;
  onEdit: (group: PricingGroup) => void;
  onDelete: (group: PricingGroup) => void;
}

export function PricingGroupsDataTable({
  onAdd,
  onEdit,
  onDelete,
}: PricingGroupsDataTableProps) {
  const { data: groups, isLoading, isFetching, refetch } = usePricingGroups();

  const [sorting, setSorting] = useState<SortingState>([
    { id: "name", desc: false },
  ]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [globalFilter, setGlobalFilter] = useState("");
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 10,
  });

  const data = groups ?? [];

  const table = useReactTable({
    data,
    columns,
    state: {
      sorting,
      columnFilters,
      globalFilter,
      pagination,
    },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onGlobalFilterChange: setGlobalFilter,
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    globalFilterFn: "includesString",
    meta: {
      onEdit,
      onDelete,
    } satisfies PricingGroupsTableMeta,
  });

  const { pageIndex } = table.getState().pagination;
  const pageCount = table.getPageCount();
  const filteredCount = table.getFilteredRowModel().rows.length;

  return (
    <>
      <div className="px-6 pb-4">
        <Toolbar
          table={table}
          globalFilter={globalFilter}
          onGlobalFilterChange={setGlobalFilter}
          onRefresh={() => refetch()}
          isRefreshing={isFetching}
          onAdd={onAdd}
        />
      </div>

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
                  <span>Loading pricing groups...</span>
                </div>
              </TableCell>
            </TableRow>
          ) : table.getRowModel().rows.length ? (
            table.getRowModel().rows.map((row) => (
              <TableRow key={row.id} className="hover:bg-stone-50">
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
                No pricing groups configured.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      <CardFooter className="flex items-center justify-between gap-3 flex-wrap text-sm text-stone-500">
        <p className="shrink-0">
          {filteredCount} of {data.length} group
          {data.length !== 1 ? "s" : ""}
        </p>

        <div className="flex items-center gap-2">
          <span className="shrink-0">Rows per page</span>
          <Select
            value={String(table.getState().pagination.pageSize)}
            onValueChange={(v) => {
              table.setPageSize(Number(v));
              table.setPageIndex(0);
            }}
          >
            <SelectTrigger className="w-20 h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[5, 10, 20].map((size) => (
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
    </>
  );
}
