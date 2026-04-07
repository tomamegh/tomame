"use client";

import { useState, useMemo } from "react";
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
import { TomameCategory } from "@/config/categories/tomame_category";
import {
  usePricingGroups,
  useCategoryMappings,
} from "../../hooks/usePricingGroups";
import type { CategoryMappingsTableMeta } from "../../types";
import { columns, type CategoryRow } from "./columns";
import { Toolbar } from "./toolbar";

const ALL_CATEGORIES = Object.values(TomameCategory).sort();

export function CategoryMappingsDataTable() {
  const {
    data: groups,
    isLoading: groupsLoading,
    isFetching: groupsFetching,
    refetch: refetchGroups,
  } = usePricingGroups();
  const {
    data: mappings,
    isLoading: mappingsLoading,
    isFetching: mappingsFetching,
    refetch: refetchMappings,
  } = useCategoryMappings();

  const isLoading = groupsLoading || mappingsLoading;
  const isFetching = groupsFetching || mappingsFetching;

  const [sorting, setSorting] = useState<SortingState>([
    { id: "category", desc: false },
  ]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [globalFilter, setGlobalFilter] = useState("");
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 15,
  });

  // Build CategoryRow[] from all categories + existing mappings
  const data: CategoryRow[] = useMemo(() => {
    const mappingsByCategory = new Map(
      (mappings ?? []).map((m) => [m.tomame_category, m]),
    );

    return ALL_CATEGORIES.map((cat) => {
      const mapping = mappingsByCategory.get(cat);
      return {
        category: cat,
        mappingId: mapping?.id ?? null,
        pricingGroupId: mapping?.pricing_group_id ?? null,
        pricingGroupName: mapping?.pricing_groups?.name ?? null,
        pricingGroupSlug: mapping?.pricing_groups?.slug ?? null,
        updatedAt: mapping?.updated_at ?? null,
      };
    });
  }, [mappings]);

  const mappedCount = data.filter((r) => r.pricingGroupId !== null).length;

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
      groups: groups ?? [],
    } satisfies CategoryMappingsTableMeta,
  });

  const { pageIndex } = table.getState().pagination;
  const pageCount = table.getPageCount();
  const filteredCount = table.getFilteredRowModel().rows.length;

  function handleRefresh() {
    refetchGroups();
    refetchMappings();
  }

  return (
    <>
      <div className="px-6 pb-4">
        <Toolbar
          table={table}
          globalFilter={globalFilter}
          onGlobalFilterChange={setGlobalFilter}
          onRefresh={handleRefresh}
          isRefreshing={isFetching}
          mappedCount={mappedCount}
          totalCount={ALL_CATEGORIES.length}
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
                  <span>Loading categories...</span>
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
                No categories found.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      <CardFooter className="flex items-center justify-between gap-3 flex-wrap text-sm text-stone-500">
        <p className="shrink-0">
          {filteredCount} of {ALL_CATEGORIES.length} categor
          {ALL_CATEGORIES.length !== 1 ? "ies" : "y"}
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
              {[10, 15, 25, 50].map((size) => (
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
