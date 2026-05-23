'use client';

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { Plus, Search, Filter, DollarSign, TrendingUp, ShoppingBag, Store } from "lucide-react";
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
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function SalesPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [sales, setSales] = useState<any[]>([]);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [formData, setFormData] = useState({ date: new Date().toISOString().split('T')[0], channel: "B2C", customer: "", revenue: "", cogs: "", status: "Paid" });

  useEffect(() => {
    loadSales();
  }, []);

  async function loadSales() {
    const { data } = await supabase.from('sales').select('*').order('sale_date', { ascending: false });
    if (data) {
      setSales(data.map(s => ({
        id: s.id,
        date: s.sale_date,
        channel: s.channel,
        customer: s.customer_name || "",
        items: Number(s.quantity),
        revenue: Number(s.total_revenue),
        cogs: Number(s.cogs),
        status: s.payment_status
      })));
    }
  }

  const handleAddSale = async () => {
    const { error } = await supabase.from('sales').insert([{
      sale_date: formData.date,
      channel: formData.channel,
      customer_name: formData.customer,
      quantity: 1, // Simplified
      total_revenue: Number(formData.revenue),
      cogs: Number(formData.cogs),
      gross_profit: Number(formData.revenue) - Number(formData.cogs),
      unit_price: Number(formData.revenue),
      payment_status: formData.status
    }]);

    if (!error) {
      loadSales();
    }

    setIsAddOpen(false);
    setFormData({ date: new Date().toISOString().split('T')[0], channel: "B2C", customer: "", revenue: "", cogs: "", status: "Paid" });
  };

  const totalRevenue = sales.reduce((sum, s) => sum + s.revenue, 0);
  const totalCogs = sales.reduce((sum, s) => sum + s.cogs, 0);
  const grossProfit = totalRevenue - totalCogs;
  const margin = totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0;

  return (
    <div className="flex flex-col gap-6 h-full">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Sales & Revenue</h1>
          <p className="text-muted-foreground mt-1">Register new sales and monitor profit margins.</p>
        </div>
        
        <Button onClick={() => setIsAddOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Register Sale
        </Button>
        <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Register New Sale</DialogTitle>
              <DialogDescription>Log a direct customer sale or a wholesale order.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="date">Date</Label>
                  <Input id="date" type="date" value={formData.date} onChange={e => setFormData({...formData, date: e.target.value})} />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="channel">Sales Channel</Label>
                  <Select value={formData.channel} onValueChange={v => setFormData({...formData, channel: v || "B2C"})}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select channel" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="B2C">B2C (Direct to Consumer)</SelectItem>
                      <SelectItem value="B2B">B2B (Distributor/Wholesale)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="customer">{formData.channel === 'B2B' ? 'Distributor Name' : 'Customer Name'}</Label>
                <Input id="customer" value={formData.customer} onChange={e => setFormData({...formData, customer: e.target.value})} placeholder={formData.channel === 'B2B' ? 'e.g. Acme Corp' : 'e.g. Jane Doe'} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="revenue">Total Revenue (DOP)</Label>
                  <Input id="revenue" type="number" value={formData.revenue} onChange={e => setFormData({...formData, revenue: e.target.value})} placeholder="0.00" />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="cogs">Total COGS (DOP)</Label>
                  <Input id="cogs" type="number" value={formData.cogs} onChange={e => setFormData({...formData, cogs: e.target.value})} placeholder="0.00" />
                  <p className="text-xs text-muted-foreground">Cost of Goods Sold</p>
                </div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="status">Payment Status</Label>
                <Select value={formData.status} onValueChange={v => setFormData({...formData, status: v || "Paid"})}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Paid">Paid</SelectItem>
                    <SelectItem value="Pending">Pending / Invoiced</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsAddOpen(false)}>Cancel</Button>
              <Button onClick={handleAddSale}>Register Sale</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-600">DOP {totalRevenue.toLocaleString()}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">COGS</CardTitle>
            <ShoppingBag className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">DOP {totalCogs.toLocaleString()}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Gross Profit</CardTitle>
            <TrendingUp className="h-4 w-4 text-emerald-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">DOP {grossProfit.toLocaleString()}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Avg. Gross Margin</CardTitle>
            <Store className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{margin.toFixed(1)}%</div>
          </CardContent>
        </Card>
      </div>

      <div className="bg-card border rounded-lg flex flex-col overflow-hidden flex-1">
        <div className="p-4 border-b flex items-center justify-between gap-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search sales..."
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
                <TableHead>Channel</TableHead>
                <TableHead>Customer / Partner</TableHead>
                <TableHead className="text-right">Revenue (DOP)</TableHead>
                <TableHead className="text-right">Profit</TableHead>
                <TableHead className="text-right">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sales.filter(s => s.customer.toLowerCase().includes(searchTerm.toLowerCase())).map((sale) => {
                const profit = sale.revenue - sale.cogs;
                return (
                  <TableRow key={sale.id}>
                    <TableCell className="text-muted-foreground">
                      {sale.date}
                    </TableCell>
                    <TableCell>
                      {sale.channel === 'B2B' ? (
                        <span className="inline-flex items-center rounded-md bg-primary/10 px-2 py-1 text-xs font-medium text-primary ring-1 ring-inset ring-primary/20">
                          B2B Wholesale
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-md bg-secondary px-2 py-1 text-xs font-medium text-secondary-foreground ring-1 ring-inset ring-secondary-foreground/10">
                          B2C Direct
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="font-medium">{sale.customer}</TableCell>
                    <TableCell className="text-right font-medium">
                      ${sale.revenue.toLocaleString(undefined, {minimumFractionDigits: 2})}
                    </TableCell>
                    <TableCell className="text-right font-medium text-emerald-600">
                      ${profit.toLocaleString(undefined, {minimumFractionDigits: 2})}
                    </TableCell>
                    <TableCell className="text-right">
                      {sale.status === 'Paid' ? (
                        <span className="text-emerald-600 font-medium text-sm">Paid</span>
                      ) : (
                        <span className="text-amber-500 font-medium text-sm">Pending</span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
