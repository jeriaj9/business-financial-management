import * as React from "react"
import { Search } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { cn } from "@/lib/utils"

export interface ColumnDef<T> {
  header: React.ReactNode
  accessorKey?: keyof T | string
  cell?: (item: T, index: number) => React.ReactNode
  className?: string
}

export interface DataTableProps<T> {
  data: T[]
  columns: ColumnDef<T>[]
  isLoading?: boolean
  emptyMessage?: React.ReactNode
  
  // Toolbar Configuration
  hideToolbar?: boolean
  searchPlaceholder?: string
  searchValue?: string
  onSearchChange?: (value: string) => void
  filterAction?: React.ReactNode
  
  // Pagination Configuration
  page?: number
  onPageChange?: (page: number) => void
  hasMore?: boolean
  
  className?: string
}

export function DataTable<T>({
  data,
  columns,
  isLoading,
  emptyMessage = "No results found.",
  hideToolbar = false,
  searchPlaceholder = "Search...",
  searchValue,
  onSearchChange,
  filterAction,
  page,
  onPageChange,
  hasMore,
  className,
}: DataTableProps<T>) {
  return (
    <div className={cn("bg-card border rounded-lg flex flex-col overflow-hidden flex-1 min-h-0", className)}>
      {!hideToolbar && (
        <div className="p-4 border-b flex items-center justify-between gap-4 shrink-0">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder={searchPlaceholder}
              className="pl-9"
              value={searchValue ?? ""}
              onChange={(e) => onSearchChange?.(e.target.value)}
            />
          </div>
          {filterAction}
        </div>
      )}

      {isLoading ? (
        <div className="p-8 text-center text-muted-foreground flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mr-2"></div>
          Loading...
        </div>
      ) : (
        <div className="relative w-full overflow-auto flex-1">
          <Table className="min-w-[800px] lg:min-w-full">
            <TableHeader className="bg-muted/50 sticky top-0 z-10">
              <TableRow>
                {columns.map((column, index) => (
                  <TableHead key={index} className={column.className}>
                    {column.header}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={columns.length} className="h-24 text-center text-muted-foreground">
                    {emptyMessage}
                  </TableCell>
                </TableRow>
              ) : (
                data.map((item, rowIndex) => (
                  <TableRow key={rowIndex}>
                    {columns.map((column, colIndex) => {
                      const cellContent = column.cell 
                        ? column.cell(item, rowIndex) 
                        : column.accessorKey 
                          ? (item as any)[column.accessorKey] 
                          : null;
                          
                      return (
                        <TableCell key={colIndex} className={column.className}>
                          {cellContent}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}

      {page !== undefined && onPageChange !== undefined && !isLoading && (
        <div className="p-4 border-t flex items-center justify-between shrink-0">
          <div className="text-sm text-muted-foreground">
            Showing page {page + 1}
          </div>
          <div className="flex items-center gap-2">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => onPageChange(Math.max(0, page - 1))} 
              disabled={page === 0}
            >
              Previous
            </Button>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => onPageChange(page + 1)} 
              disabled={!hasMore}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
