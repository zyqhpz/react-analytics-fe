import {
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type PaginationState,
  type SortingState,
} from "@tanstack/react-table";
import { useEffect, useMemo, useState, type ReactNode } from "react";

import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { type QueryRow } from "@/types/query";

type DataTableClasses = {
  container?: string;
  tableWrapper?: string;
  table?: string;
  header?: string;
  headerRow?: string;
  headerCell?: string;
  headerButton?: string;
  row?: string;
  cell?: string;
  paginationContainer?: string;
  paginationText?: string;
  paginationPrevious?: string;
  paginationCurrent?: string;
  paginationNext?: string;
  emptyState?: string;
};

export type ResolvedDataTableModel = {
  columns: string[];
  rows: QueryRow[];
};

type DataTableProps = {
  data: QueryRow[];
  columns?: string[];
  emptyMessage?: ReactNode;
  formatValue?: (value: unknown) => ReactNode;
  pageSize?: number;
  paginationThreshold?: number;
  classes?: DataTableClasses;
  onResolvedModelChange?: (model: ResolvedDataTableModel) => void;
};

const defaultFormatValue = (value: unknown) => {
  if (value === null || value === undefined || value === "") return "";
  return String(value);
};

const getDefaultColumns = (data: QueryRow[]) =>
  Array.from(new Set(data.flatMap((row) => Object.keys(row))));

export function DataTable({
  data,
  columns,
  emptyMessage = "No data available.",
  formatValue = defaultFormatValue,
  pageSize = 50,
  paginationThreshold = 50,
  classes,
  onResolvedModelChange,
}: DataTableProps) {
  const resolvedColumns = useMemo(
    () => (columns?.length ? columns : getDefaultColumns(data)),
    [columns, data],
  );
  const [sorting, setSorting] = useState<SortingState>([]);
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize,
  });
  const shouldPaginate = data.length > paginationThreshold;

  useEffect(() => {
    setPagination((prev) => ({
      ...prev,
      pageIndex: 0,
      pageSize,
    }));
  }, [data, pageSize]);

  const tableColumns = useMemo<ColumnDef<QueryRow>[]>(
    () =>
      resolvedColumns.map((column) => ({
        accessorFn: (row) => row[column],
        id: column,
        header: ({ column: tableColumn }) => {
          const sortState = tableColumn.getIsSorted();
          const sortLabel =
            sortState === "asc" ? " ▲" : sortState === "desc" ? " ▼" : "";

          return (
            <button
              type="button"
              className={
                classes?.headerButton ??
                "cursor-pointer select-none text-left font-medium transition hover:text-foreground"
              }
              onClick={tableColumn.getToggleSortingHandler()}
            >
              {column}
              {sortLabel}
            </button>
          );
        },
        cell: ({ row }) => formatValue(row.original[column]),
      })),
    [formatValue, resolvedColumns],
  );

  const table = useReactTable({
    data,
    columns: tableColumns,
    state: {
      sorting,
      pagination,
    },
    onSortingChange: setSorting,
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });

  useEffect(() => {
    const sortedRows = table
      .getSortedRowModel()
      .rows.map((row) => row.original);

    onResolvedModelChange?.({
      columns: resolvedColumns,
      rows: sortedRows,
    });
  }, [data, onResolvedModelChange, resolvedColumns, sorting, table]);

  if (!data.length) {
    return <div className={classes?.emptyState}>{emptyMessage}</div>;
  }

  return (
    <div className={classes?.container}>
      <div className={classes?.tableWrapper}>
        <Table className={classes?.table}>
          <TableHeader className={classes?.header}>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id} className={classes?.headerRow}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id} className={classes?.headerCell}>
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
            {table.getRowModel().rows.map((row) => (
              <TableRow key={row.id} className={classes?.row}>
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id} className={classes?.cell}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {shouldPaginate ? (
        <div className={classes?.paginationContainer}>
          <div className={classes?.paginationText}>
            Showing {pagination.pageIndex * pagination.pageSize + 1}-
            {Math.min(
              (pagination.pageIndex + 1) * pagination.pageSize,
              data.length,
            )}{" "}
            of {data.length}
          </div>
          <Pagination className="mx-0 ml-auto w-auto justify-end">
            <PaginationContent>
              <PaginationItem>
                <PaginationPrevious
                  onClick={() => table.previousPage()}
                  disabled={!table.getCanPreviousPage()}
                  className={classes?.paginationPrevious}
                />
              </PaginationItem>
              <PaginationItem>
                <PaginationLink
                  isActive
                  disabled
                  className={classes?.paginationCurrent}
                >
                  {pagination.pageIndex + 1} / {table.getPageCount()}
                </PaginationLink>
              </PaginationItem>
              <PaginationItem>
                <PaginationNext
                  onClick={() => table.nextPage()}
                  disabled={!table.getCanNextPage()}
                  className={classes?.paginationNext}
                />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        </div>
      ) : null}
    </div>
  );
}
