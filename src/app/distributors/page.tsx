'use client';

import { useState, useEffect } from "react";
import { PageLoader } from "@/components/PageLoader";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/components/AuthProvider";
import { useDistributors } from "@/lib/hooks";
import { Plus, Search, Filter, MoreHorizontal, FileText, Phone, Mail, Eye, DollarSign, TrendingUp, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DataTable, ColumnDef } from "@/components/ui/data-table";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export default function DistributorsPage() {
  const { profile } = useAuth();
  const { data: distributorsData, isLoading: isDistributorsLoading, mutate: mutateDistributors } = useDistributors(profile?.company_id);
  const [searchTerm, setSearchTerm] = useState("");
  const [distributors, setDistributors] = useState<any[]>([]);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [editingDistributorId, setEditingDistributorId] = useState<string | null>(null);
  const [viewDetailsDistributor, setViewDetailsDistributor] = useState<any>(null);
  const [formData, setFormData] = useState({ name: "", contact: "", email: "", phone: "", tier: "Standard" });

  useEffect(() => {
    if (distributorsData) {
      setDistributors(distributorsData.map((d: any) => {
        let totalRevenue = 0;
        let totalProfit = 0;
        const uniqueOrders = new Set();
        
        // Group sales history by invoice
        const invoiceMap: Record<string, any> = {};

        if (d.sales) {
          d.sales.forEach((s: any) => {
            totalRevenue += Number(s.total_revenue || 0);
            totalProfit += Number(s.gross_profit || 0);
            
            const inv = s.invoice_number || s.id;
            uniqueOrders.add(inv);
            
            if (!invoiceMap[inv]) {
              invoiceMap[inv] = {
                invoice: inv,
                date: s.sale_date,
                status: s.payment_status,
                totalRevenue: 0,
                items: 0
              };
            }
            invoiceMap[inv].totalRevenue += Number(s.total_revenue || 0);
            invoiceMap[inv].items += Number(s.quantity || 0);
          });
        }
        
        return {
          id: d.id,
          name: d.name,
          contact: d.contact_name || "",
          email: d.email || "",
          phone: d.phone || "",
          tier: d.pricing_tier || "Standard",
          balance: Number(d.outstanding_balance || 0),
          orders: uniqueOrders.size,
          lifetimeRevenue: totalRevenue,
          lifetimeProfit: totalProfit,
          invoiceHistory: Object.values(invoiceMap).sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime())
        };
      }));
    }
  }, [distributorsData]);

  const handleEditClick = (distributor: any) => {
    setEditingDistributorId(distributor.id);
    setFormData({
      name: distributor.name,
      contact: distributor.contact,
      email: distributor.email,
      phone: distributor.phone,
      tier: distributor.tier
    });
    setIsAddOpen(true);
  };

  const handleDeleteDistributor = async (id: string) => {
    if (!confirm("Are you sure you want to delete this distributor? All associated sales will lose their distributor link.")) return;
    const { error } = await supabase.from('distributors').delete().eq('id', id);
    if (!error) mutateDistributors();
    else alert(`Error deleting distributor: ${error.message}`);
  };

  const handleAddDistributor = async () => {
    if (editingDistributorId) {
      const { error } = await supabase.from('distributors').update({
        name: formData.name,
        contact_name: formData.contact,
        email: formData.email,
        phone: formData.phone,
        pricing_tier: formData.tier
      }).eq('id', editingDistributorId);
      if (!error) mutateDistributors();
    } else {
      const { error } = await supabase.from('distributors').insert([{
        name: formData.name,
        contact_name: formData.contact,
        email: formData.email,
        phone: formData.phone,
        pricing_tier: formData.tier,
        outstanding_balance: 0,
        company_id: profile?.company_id
      }]);
      if (!error) mutateDistributors();
    }
    
    setIsAddOpen(false);
    setEditingDistributorId(null);
    setFormData({ name: "", contact: "", email: "", phone: "", tier: "Standard" });
  };

  const totalOutstanding = distributors.reduce((sum, d) => sum + d.balance, 0);

  const distributorColumns: ColumnDef<any>[] = [
    {
      header: "Distributor",
      className: "font-medium",
      cell: (item) => (
        <>
          {item.name}
          <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
            <span className="flex items-center"><Mail className="h-3 w-3 mr-1"/>{item.email}</span>
            <span className="flex items-center"><Phone className="h-3 w-3 mr-1"/>{item.phone}</span>
          </div>
        </>
      )
    },
    {
      header: "Contact",
      accessorKey: "contact"
    },
    {
      header: "Pricing Tier",
      cell: (item) => (
        <span className="inline-flex items-center rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
          {item.tier}
        </span>
      )
    },
    {
      header: "Orders",
      accessorKey: "orders",
      className: "text-right font-medium"
    },
    {
      header: "Balance",
      className: "text-right",
      cell: (item) => (
        item.balance > 0 ? (
          <span className="text-destructive font-medium">DOP {item.balance.toLocaleString()}</span>
        ) : (
          <span className="text-muted-foreground">Settled</span>
        )
      )
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
              <DropdownMenuLabel>Actions</DropdownMenuLabel>
              <DropdownMenuItem onClick={() => setViewDetailsDistributor(item)}>
                <Eye className="mr-2 h-4 w-4" />
                View Insights
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleEditClick(item)}>
                <Pencil className="mr-2 h-4 w-4" />
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleDeleteDistributor(item.id)} className="text-destructive">
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      )
    }
  ];

  const invoiceHistoryColumns: ColumnDef<any>[] = [
    {
      header: "Date",
      accessorKey: "date",
      className: "text-muted-foreground"
    },
    {
      header: "Invoice",
      accessorKey: "invoice",
      className: "font-mono text-xs"
    },
    {
      header: "Items Sold",
      accessorKey: "items",
      className: "text-right font-medium"
    },
    {
      header: "Revenue",
      className: "text-right font-medium text-emerald-600",
      cell: (item) => `$${item.totalRevenue.toLocaleString(undefined, {minimumFractionDigits: 2})}`
    },
    {
      header: "Status",
      className: "text-right",
      cell: (item) => (
        item.status === 'Paid' ? (
          <span className="inline-flex items-center rounded-full bg-emerald-500/10 px-2 py-1 text-xs font-medium text-emerald-600 ring-1 ring-inset ring-emerald-500/20">
            Paid
          </span>
        ) : (
          <span className="inline-flex items-center rounded-full bg-amber-500/10 px-2 py-1 text-xs font-medium text-amber-500 ring-1 ring-inset ring-amber-500/20">
            Pending
          </span>
        )
      )
    }
  ];

  if (isDistributorsLoading) return <PageLoader />;

  return (
    <div className="flex flex-col gap-6 h-full">
      <div className="flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Distributors</h1>
          <p className="text-muted-foreground mt-1">Manage wholesale clients, pricing tiers, and account balances.</p>
        </div>
        
        <Button onClick={() => setIsAddOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Add Distributor
        </Button>
        <Dialog open={isAddOpen} onOpenChange={(open) => {
          setIsAddOpen(open);
          if (!open) {
            setEditingDistributorId(null);
            setFormData({ name: "", contact: "", email: "", phone: "", tier: "Standard" });
          }
        }}>
          <DialogContent className="w-[95vw] sm:max-w-md max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingDistributorId ? "Edit Distributor Profile" : "New Distributor Profile"}</DialogTitle>
              <DialogDescription>Create a new wholesale account for specific pricing rules.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="name">Business Name</Label>
                <Input id="name" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} placeholder="e.g. Acme Corp" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="contact">Contact Person</Label>
                  <Input id="contact" value={formData.contact} onChange={e => setFormData({...formData, contact: e.target.value})} placeholder="John Doe" />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="phone">Phone</Label>
                  <Input id="phone" value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} placeholder="(809) 555-0000" />
                </div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="email">Email Address</Label>
                <Input id="email" type="email" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} placeholder="john@example.com" />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="tier">Pricing Tier</Label>
                <Select value={formData.tier} onValueChange={v => setFormData({...formData, tier: v || "Standard"})}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select tier" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Standard">Standard (20% Margin)</SelectItem>
                    <SelectItem value="Gold">Gold (30% Margin)</SelectItem>
                    <SelectItem value="Platinum">Platinum (40% Margin)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsAddOpen(false)}>Cancel</Button>
              <Button onClick={handleAddDistributor}>{editingDistributorId ? "Save Changes" : "Create Profile"}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        
        {/* View Details Modal */}
        <Dialog open={!!viewDetailsDistributor} onOpenChange={(open) => !open && setViewDetailsDistributor(null)}>
          <DialogContent className="w-[95vw] sm:max-w-4xl max-h-[90vh] overflow-y-auto max-h-[90vh] flex flex-col">
            {viewDetailsDistributor && (
              <>
                <DialogHeader className="shrink-0">
                  <DialogTitle className="text-2xl">{viewDetailsDistributor.name}</DialogTitle>
                  <DialogDescription>
                    Financial Insights and Purchase History
                  </DialogDescription>
                </DialogHeader>
                
                <div className="grid gap-4 md:grid-cols-3 shrink-0 py-4">
                  <Card className="bg-primary/5">
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                      <CardTitle className="text-sm font-medium">Lifetime Value</CardTitle>
                      <DollarSign className="h-4 w-4 text-emerald-600" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold text-emerald-600">
                        ${viewDetailsDistributor.lifetimeRevenue.toLocaleString(undefined, {minimumFractionDigits: 2})}
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                      <CardTitle className="text-sm font-medium">Lifetime Profit</CardTitle>
                      <TrendingUp className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">
                        ${viewDetailsDistributor.lifetimeProfit.toLocaleString(undefined, {minimumFractionDigits: 2})}
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                      <CardTitle className="text-sm font-medium">Total Orders</CardTitle>
                      <FileText className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">{viewDetailsDistributor.orders}</div>
                    </CardContent>
                  </Card>
                </div>
                
                <DataTable
                  data={viewDetailsDistributor.invoiceHistory}
                  columns={invoiceHistoryColumns}
                  hideToolbar={true}
                  emptyMessage={<div className="py-8 text-center text-muted-foreground">No purchase history found for this distributor.</div>}
                />
              </>
            )}
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-4 md:grid-cols-3 shrink-0">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Distributors</CardTitle>
            <Plus className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{distributors.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Outstanding Balances</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">DOP {totalOutstanding.toLocaleString()}</div>
          </CardContent>
        </Card>
      </div>

      <DataTable
        data={distributors.filter(d => d.name.toLowerCase().includes(searchTerm.toLowerCase()))}
        columns={distributorColumns}
        searchPlaceholder="Search distributors..."
        searchValue={searchTerm}
        onSearchChange={setSearchTerm}
        filterAction={
          <Button variant="outline" size="sm">
            <Filter className="h-4 w-4 mr-2" />
            Filter
          </Button>
        }
      />
    </div>
  );
}
