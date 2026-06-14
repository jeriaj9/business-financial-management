'use client';

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/components/AuthProvider";
import { usePaginatedExpenses } from "@/lib/hooks";
import { PageLoader } from "@/components/PageLoader";
import { Plus, Search, Filter, DollarSign, TrendingDown, Receipt, Calendar, MoreHorizontal, Pencil, Trash2, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { SelectField } from "@/components/ui/select-field";
import { DataTable, ColumnDef } from "@/components/ui/data-table";
import { AppDialog } from "@/components/ui/app-dialog";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export default function ExpensesPage() {
  const { profile } = useAuth();
  const [searchTerm, setSearchTerm] = useState("");
  const [page, setPage] = useState(0);
  const { data: paginatedData, isLoading: isExpensesLoading, mutate: mutateExpenses } = usePaginatedExpenses(profile?.company_id, page, 20);

  const [expenses, setExpenses] = useState<any[]>([]);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [editingExpenseId, setEditingExpenseId] = useState<string | null>(null);
  const [viewDetailsExpense, setViewDetailsExpense] = useState<any>(null);
  const [formData, setFormData] = useState({ date: new Date().toISOString().split('T')[0], category: "", description: "", amount: "", reference: "" });

  useEffect(() => {
    if (paginatedData?.data) {
      setExpenses(paginatedData.data.map((e: any) => ({
        id: e.id,
        date: e.expense_date,
        category: e.category,
        description: e.description || "",
        amount: Number(e.amount),
        reference: e.reference || ""
      })));
    }
  }, [paginatedData]);

  const handleEditClick = (expense: any) => {
    setEditingExpenseId(expense.id);
    setFormData({
      date: expense.date,
      category: expense.category,
      description: expense.description,
      amount: expense.amount.toString(),
      reference: expense.reference
    });
    setIsAddOpen(true);
  };

  const handleDeleteExpense = async (id: string) => {
    if (!confirm("Are you sure you want to delete this expense?")) return;
    const { error } = await supabase.from('expenses').delete().eq('id', id);
    if (!error) mutateExpenses();
    else alert(`Error deleting expense: ${error.message}`);
  };

  const handleAddExpense = async () => {
    if (editingExpenseId) {
      const { error } = await supabase.from('expenses').update({
        expense_date: formData.date,
        category: formData.category,
        description: formData.description,
        amount: Number(formData.amount),
        vendor: formData.reference
      }).eq('id', editingExpenseId);

      if (!error) mutateExpenses();
    } else {
      const { error } = await supabase.from('expenses').insert([{
        expense_date: formData.date,
        category: formData.category,
        description: formData.description,
        amount: Number(formData.amount),
        vendor: formData.reference,
        company_id: profile?.company_id
      }]);

      if (!error) mutateExpenses();
    }

    setIsAddOpen(false);
    setEditingExpenseId(null);
    setFormData({ date: new Date().toISOString().split('T')[0], category: "", description: "", amount: "", reference: "" });
  };

  const totalMonthly = expenses.reduce((sum, e) => sum + e.amount, 0);

  const expenseColumns: ColumnDef<any>[] = [
    {
      header: "Date",
      cell: (item) => (
        <span className="flex items-center">
          <Calendar className="h-3 w-3 mr-2" />
          {item.date}
        </span>
      )
    },
    {
      header: "Category",
      cell: (item) => (
        <span className="inline-flex items-center rounded-md bg-secondary px-2 py-1 text-xs font-medium text-secondary-foreground ring-1 ring-inset ring-secondary-foreground/10">
          {item.category}
        </span>
      )
    },
    {
      header: "Description",
      accessorKey: "description",
      className: "font-medium"
    },
    {
      header: "Reference",
      accessorKey: "reference"
    },
    {
      header: "Amount (DOP)",
      className: "text-right font-medium text-destructive",
      cell: (item) => `- $${item.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}`
    },
    {
      header: "",
      className: "w-[50px]",
      cell: (item) => (
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="ghost" size="icon" className="h-8 w-8" />}>
            <MoreHorizontal className="h-4 w-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuGroup>
              <DropdownMenuItem onClick={() => setViewDetailsExpense(item)}>
                <Eye className="mr-2 h-4 w-4" />
                View Details
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleEditClick(item)}>
                <Pencil className="mr-2 h-4 w-4" />
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleDeleteExpense(item.id)} className="text-destructive">
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      )
    }
  ];

  if (isExpensesLoading && page === 0) return <PageLoader />;

  return (
    <div className="flex flex-col gap-6 h-full">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Operating Expenses</h1>
          <p className="text-muted-foreground mt-1">Track overhead, marketing, and operational costs.</p>
        </div>

        <Button onClick={() => setIsAddOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Log Expense
        </Button>
        <AppDialog
          open={isAddOpen}
          onOpenChange={(open) => {
            setIsAddOpen(open);
            if (!open) {
              setEditingExpenseId(null);
              setFormData({ date: new Date().toISOString().split('T')[0], category: "", description: "", amount: "", reference: "" });
            }
          }}
          title={editingExpenseId ? "Edit Expense" : "Log New Expense"}
          description="Record an operational cost that affects your overall net profit."
          footer={
            <>
              <Button variant="outline" onClick={() => setIsAddOpen(false)}>Cancel</Button>
              <Button onClick={handleAddExpense}>{editingExpenseId ? "Save Changes" : "Save Expense"}</Button>
            </>
          }
        >
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <FormField id="date" type="date" label="Date" value={formData.date} onChange={e => setFormData({ ...formData, date: e.target.value })} />
                <SelectField
                  id="category"
                  label="Category"
                  value={formData.category}
                  onValueChange={v => setFormData({ ...formData, category: v || "" })}
                  placeholder="Select type"
                  options={[
                    { value: "Rent", label: "Rent" },
                    { value: "Utilities", label: "Utilities" },
                    { value: "Marketing", label: "Marketing" },
                    { value: "Payroll", label: "Payroll" },
                    { value: "Logistics", label: "Logistics" },
                    { value: "Other", label: "Other" },
                  ]}
                />
              </div>
              <FormField id="desc" label="Description" value={formData.description} onChange={e => setFormData({ ...formData, description: e.target.value })} placeholder="e.g. Facebook Ads" />
              <div className="grid grid-cols-2 gap-4">
                <FormField id="amount" type="number" label="Amount (DOP)" value={formData.amount} onChange={e => setFormData({ ...formData, amount: e.target.value })} placeholder="0.00" />
                <FormField id="ref" label="Reference / Receipt #" value={formData.reference} onChange={e => setFormData({ ...formData, reference: e.target.value })} placeholder="INV-1234" />
              </div>
            </div>
        </AppDialog>

        {/* View Details Modal */}
        <AppDialog
          open={!!viewDetailsExpense}
          onOpenChange={(open) => !open && setViewDetailsExpense(null)}
          title="Expense Details"
          description={viewDetailsExpense ? `Reference: ${viewDetailsExpense.reference || "N/A"}` : ""}
        >
            {viewDetailsExpense && (
                <div className="space-y-6 py-4">
                  <div className="flex justify-between items-center border-b pb-4">
                    <span className="text-muted-foreground">Amount</span>
                    <span className="text-3xl font-bold text-destructive">
                      ${viewDetailsExpense.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-y-4 text-sm">
                    <div>
                      <p className="text-muted-foreground mb-1">Date</p>
                      <p className="font-medium flex items-center">
                        <Calendar className="h-3 w-3 mr-2" />
                        {viewDetailsExpense.date}
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground mb-1">Category</p>
                      <span className="inline-flex items-center rounded-md bg-secondary px-2 py-1 text-xs font-medium text-secondary-foreground ring-1 ring-inset ring-secondary-foreground/10">
                        {viewDetailsExpense.category}
                      </span>
                    </div>
                    <div className="col-span-2">
                      <p className="text-muted-foreground mb-1">Description</p>
                      <p className="font-medium">{viewDetailsExpense.description}</p>
                    </div>
                  </div>
                </div>
            )}
        </AppDialog>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Expenses (This Month)</CardTitle>
            <TrendingDown className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">DOP {totalMonthly.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground mt-1">+12% from last month</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Largest Category</CardTitle>
            <Receipt className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">Rent</div>
            <p className="text-xs text-muted-foreground mt-1">Accounts for 65% of expenses</p>
          </CardContent>
        </Card>
      </div>

      <DataTable
        data={expenses.filter(e => e.description.toLowerCase().includes(searchTerm.toLowerCase()))}
        columns={expenseColumns}
        isLoading={isExpensesLoading}
        searchPlaceholder="Search expenses..."
        searchValue={searchTerm}
        onSearchChange={setSearchTerm}
        filterAction={
          <Button variant="outline" size="sm">
            <Filter className="h-4 w-4 mr-2" />
            Filter
          </Button>
        }
        page={page}
        onPageChange={setPage}
        hasMore={!!paginatedData?.data && paginatedData.data.length >= 20}
      />
    </div>
  );
}
