'use client';

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/components/AuthProvider";
import { PageLoader } from "@/components/PageLoader";
import { Plus, Search, Filter, DollarSign, TrendingDown, Receipt, Calendar, MoreHorizontal, Pencil, Trash2, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  const [expenses, setExpenses] = useState<any[]>([]);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [editingExpenseId, setEditingExpenseId] = useState<string | null>(null);
  const [viewDetailsExpense, setViewDetailsExpense] = useState<any>(null);
  const [formData, setFormData] = useState({ date: new Date().toISOString().split('T')[0], category: "", description: "", amount: "", reference: "" });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadExpenses();
  }, []);

  async function loadExpenses() {
    const { data } = await supabase.from('expenses').select('*').order('expense_date', { ascending: false }).limit(200);
    if (data) {
      setExpenses(data.map(e => ({
        id: e.id,
        date: e.expense_date,
        category: e.category,
        description: e.description || "",
        amount: Number(e.amount),
        reference: e.reference || ""
      })));
    }
    setIsLoading(false);
  }

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
    if (!error) loadExpenses();
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
      
      if (!error) loadExpenses();
    } else {
      const { error } = await supabase.from('expenses').insert([{
        expense_date: formData.date,
        category: formData.category,
        description: formData.description,
        amount: Number(formData.amount),
        vendor: formData.reference,
        company_id: profile?.company_id
      }]);

      if (!error) loadExpenses();
    }

    setIsAddOpen(false);
    setEditingExpenseId(null);
    setFormData({ date: new Date().toISOString().split('T')[0], category: "", description: "", amount: "", reference: "" });
  };

  const totalMonthly = expenses.reduce((sum, e) => sum + e.amount, 0);

  if (isLoading) return <PageLoader />;

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
        <Dialog open={isAddOpen} onOpenChange={(open) => {
          setIsAddOpen(open);
          if (!open) {
            setEditingExpenseId(null);
            setFormData({ date: new Date().toISOString().split('T')[0], category: "", description: "", amount: "", reference: "" });
          }
        }}>
          <DialogContent className="w-[95vw] sm:max-w-md max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingExpenseId ? "Edit Expense" : "Log New Expense"}</DialogTitle>
              <DialogDescription>Record an operational cost that affects your overall net profit.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="date">Date</Label>
                  <Input id="date" type="date" value={formData.date} onChange={e => setFormData({...formData, date: e.target.value})} />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="category">Category</Label>
                  <Select value={formData.category} onValueChange={v => setFormData({...formData, category: v || ""})}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Rent">Rent</SelectItem>
                      <SelectItem value="Utilities">Utilities</SelectItem>
                      <SelectItem value="Marketing">Marketing</SelectItem>
                      <SelectItem value="Payroll">Payroll</SelectItem>
                      <SelectItem value="Logistics">Logistics</SelectItem>
                      <SelectItem value="Other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="desc">Description</Label>
                <Input id="desc" value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} placeholder="e.g. Facebook Ads" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="amount">Amount (DOP)</Label>
                  <Input id="amount" type="number" value={formData.amount} onChange={e => setFormData({...formData, amount: e.target.value})} placeholder="0.00" />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="ref">Reference / Receipt #</Label>
                  <Input id="ref" value={formData.reference} onChange={e => setFormData({...formData, reference: e.target.value})} placeholder="INV-1234" />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsAddOpen(false)}>Cancel</Button>
              <Button onClick={handleAddExpense}>{editingExpenseId ? "Save Changes" : "Save Expense"}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* View Details Modal */}
        <Dialog open={!!viewDetailsExpense} onOpenChange={(open) => !open && setViewDetailsExpense(null)}>
          <DialogContent className="w-[95vw] sm:max-w-md max-h-[90vh] overflow-y-auto">
            {viewDetailsExpense && (
              <>
                <DialogHeader>
                  <DialogTitle>Expense Details</DialogTitle>
                  <DialogDescription>Reference: {viewDetailsExpense.reference || "N/A"}</DialogDescription>
                </DialogHeader>
                <div className="space-y-6 py-4">
                  <div className="flex justify-between items-center border-b pb-4">
                    <span className="text-muted-foreground">Amount</span>
                    <span className="text-3xl font-bold text-destructive">
                      ${viewDetailsExpense.amount.toLocaleString(undefined, {minimumFractionDigits: 2})}
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
              </>
            )}
          </DialogContent>
        </Dialog>
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

      <div className="bg-card border rounded-lg flex flex-col overflow-hidden flex-1">
        <div className="p-4 border-b flex items-center justify-between gap-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search expenses..."
              className="pl-9"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <Button variant="outline" size="sm">
            <Filter className="h-4 w-4 mr-2" />
            Filter
          </Button>
        </div>
        
        <div className="relative w-full overflow-auto">
          <Table className="min-w-[800px] lg:min-w-full">
            <TableHeader className="bg-muted/50">
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Reference</TableHead>
                <TableHead className="text-right">Amount (DOP)</TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {expenses.filter(e => e.description.toLowerCase().includes(searchTerm.toLowerCase())).map((expense) => (
                <TableRow key={expense.id}>
                  <TableCell className="text-muted-foreground flex items-center">
                    <Calendar className="h-3 w-3 mr-2"/>
                    {expense.date}
                  </TableCell>
                  <TableCell>
                    <span className="inline-flex items-center rounded-md bg-secondary px-2 py-1 text-xs font-medium text-secondary-foreground ring-1 ring-inset ring-secondary-foreground/10">
                      {expense.category}
                    </span>
                  </TableCell>
                  <TableCell className="font-medium">{expense.description}</TableCell>
                  <TableCell className="text-muted-foreground text-xs">{expense.reference}</TableCell>
                  <TableCell className="text-right font-medium text-destructive">
                    - ${expense.amount.toLocaleString(undefined, {minimumFractionDigits: 2})}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger render={<Button variant="ghost" size="icon" className="h-8 w-8" />}>
                        <MoreHorizontal className="h-4 w-4" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuGroup>
                          <DropdownMenuItem onClick={() => setViewDetailsExpense(expense)}>
                            <Eye className="mr-2 h-4 w-4" />
                            View Details
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleEditClick(expense)}>
                            <Pencil className="mr-2 h-4 w-4" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleDeleteExpense(expense.id)} className="text-destructive">
                            <Trash2 className="mr-2 h-4 w-4" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuGroup>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
