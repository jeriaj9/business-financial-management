'use client';

import * as React from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { cn } from "@/lib/utils";

export interface RowsColumn<T> {
  key: string;
  header: React.ReactNode;
  cell: (row: T) => React.ReactNode;
  align?: "left" | "right" | "center";
  className?: string;
  sortValue?: (row: T) => number | string;
  footer?: React.ReactNode;
}

export interface RowsTableProps<T> {
  rows: T[];
  columns: RowsColumn<T>[];
  rowKey: (row: T) => string;
  empty?: React.ReactNode;
  rowClassName?: (row: T) => string | undefined;
  onRowClick?: (row: T) => void;
  initialSort?: { key: string; dir: "asc" | "desc" };
  className?: string;
  dense?: boolean;
}

/** Plain, responsive table with optional sorting and totals footer. */
export function RowsTable<T>({ rows, columns, rowKey, empty = "No hay datos para mostrar.", rowClassName, onRowClick, initialSort, className, dense }: RowsTableProps<T>) {
  const [sort, setSort] = React.useState(initialSort ?? null);

  const sorted = React.useMemo(() => {
    if (!sort) return rows;
    const column = columns.find((c) => c.key === sort.key);
    if (!column?.sortValue) return rows;
    const factor = sort.dir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const va = column.sortValue!(a);
      const vb = column.sortValue!(b);
      if (typeof va === "number" && typeof vb === "number") return (va - vb) * factor;
      return String(va).localeCompare(String(vb), "es") * factor;
    });
  }, [rows, columns, sort]);

  const hasFooter = columns.some((c) => c.footer !== undefined);
  const align = (a?: string) => (a === "right" ? "text-right" : a === "center" ? "text-center" : "text-left");

  return (
    <div className={cn("relative w-full overflow-x-auto rounded-xl border", className)}>
      <table className="w-full caption-bottom text-sm">
        <thead className="bg-muted/40">
          <tr className="border-b">
            {columns.map((c) => {
              const active = sort?.key === c.key;
              return (
                <th key={c.key} scope="col" className={cn("whitespace-nowrap px-3 font-medium text-muted-foreground", dense ? "h-8" : "h-10", align(c.align), c.className)}>
                  {c.sortValue ? (
                    <button
                      type="button"
                      className={cn("inline-flex items-center gap-1 hover:text-foreground", active && "text-foreground")}
                      onClick={() => setSort({ key: c.key, dir: active && sort?.dir === "desc" ? "asc" : "desc" })}
                    >
                      {c.header}
                      {active && (sort?.dir === "desc" ? <ArrowDown className="h-3 w-3" /> : <ArrowUp className="h-3 w-3" />)}
                    </button>
                  ) : (
                    c.header
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {sorted.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="px-3 py-10 text-center text-muted-foreground">
                {empty}
              </td>
            </tr>
          ) : (
            sorted.map((row) => (
              <tr
                key={rowKey(row)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={cn("border-b last:border-0 transition-colors hover:bg-muted/30", onRowClick && "cursor-pointer", rowClassName?.(row))}
              >
                {columns.map((c) => (
                  <td key={c.key} className={cn("px-3 align-middle", dense ? "py-1.5" : "py-2.5", align(c.align), c.align === "right" && "tabular-nums", c.className)}>
                    {c.cell(row)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
        {hasFooter && sorted.length > 0 && (
          <tfoot className="border-t bg-muted/30 font-medium">
            <tr>
              {columns.map((c) => (
                <td key={c.key} className={cn("px-3 py-2.5", align(c.align), c.align === "right" && "tabular-nums")}>
                  {c.footer}
                </td>
              ))}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}
