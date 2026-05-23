'use client';

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { Plus, Search, Filter, DollarSign, TrendingDown, Receipt, Calendar } from "lucide-react";
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

export default function ExpensesPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [expenses, setExpenses] = useState<any[]>([]);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [formData, setFormData] = useState({ date: new Date().toISOString().split('T')[0], category: "", description: "", amount: "", reference: "" });

  useEffect(() => {
    loadExpenses();
  }, []);

  async function loadExpenses() {
    const { data } = await supabase.from('expenses').select('*').order('expense_date', { ascending: false });
    if (data) {
      setExpenses(data.map(e => ({
        id: e.id,
        date: e.expense_date,
        category: e.category,
        description: e.description || "",
        amount: Number(e.amount),
        reference: e.vendor || ""
      })));
    }
  }

  const handleAddExpense = async () => {
    const { error } = await supabase.from('expenses').insert([{
      expense_date: formData.date,
      category: formData.category,
      description: formData.description,
      amount: Number(formData.amount),
      vendor: formData.reference
    }]);

    if (!error) {
      loadExpenses();
    }
    setIsAddOpen(false);
    setFormData({ date: new Date().toISOString().split('T')[0], category: "", description: "", amount: "", reference: "" });
  };

  const totalMonthly = expenses.reduce((sum, e) => sum + e.amount, 0);

  return (
    <div className="flex flex-col gap-6 h-full">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Operating Expenses</h1>
          <p className="text-muted-foreground mt-1">Track overhead, marketing, and operational costs.</p>
        </div>
        
        <Button onClick={() => setIsAddOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Log Expense
        </Button>
        <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Log New Expense</DialogTitle>
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
              <Button onClick={handleAddExpense}>Save Expense</Button>
            </DialogFooter>
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
          <Table>
            <TableHeader className="bg-muted/50">
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Reference</TableHead>
                <TableHead className="text-right">Amount (DOP)</TableHead>
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
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
