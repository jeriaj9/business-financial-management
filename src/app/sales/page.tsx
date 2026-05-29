'use client';

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/components/AuthProvider";
import { Plus, Search, Filter, DollarSign, TrendingUp, ShoppingBag, Store, Trash2, MoreHorizontal, Eye, Pencil } from "lucide-react";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { calculateCosts, GlobalSettings, Material, Product } from "@/lib/pricing";

export default function SalesPage() {
  const { profile } = useAuth();
  const [searchTerm, setSearchTerm] = useState("");
  // sales will now hold grouped invoices
  const [sales, setSales] = useState<any[]>([]);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [viewDetailsInvoice, setViewDetailsInvoice] = useState<any>(null);
  const [editingInvoiceNumber, setEditingInvoiceNumber] = useState<string | null>(null);
  
  // Data for pricing engine
  const [availableProducts, setAvailableProducts] = useState<Product[]>([]);
  const [availableMaterials, setAvailableMaterials] = useState<Material[]>([]);
  const [availableDistributors, setAvailableDistributors] = useState<any[]>([]);
  const [globalSettings, setGlobalSettings] = useState<GlobalSettings>({
    laborCostPerHour: 100,
    distributorMargin: 0.20,
    promotionalDiscount: 0.20,
    indirectCostReserve: 0.10,
  });

  // Form State
  const [formData, setFormData] = useState({ 
    date: new Date().toISOString().split('T')[0], 
    channel: "B2C", 
    customer: "", 
    distributorId: "",
    status: "Paid" 
  });
  
  // Shopping Cart
  const [cartItems, setCartItems] = useState<{productId: string, quantity: number}[]>([{productId: "", quantity: 1}]);

  useEffect(() => {
    if (profile?.company_id) {
      loadSales();
    }
  }, [profile?.company_id]);

  async function loadSales() {
    // Load Sales with related product data
    const { data: salesData } = await supabase.from('sales').select('*, products(name)').eq('company_id', profile?.company_id).order('created_at', { ascending: false }).limit(200);
    if (salesData) {
      // Group by invoice
      const grouped: Record<string, any> = {};
      salesData.forEach(s => {
        const inv = s.invoice_number || s.id;
        if (!grouped[inv]) {
          grouped[inv] = {
            id: s.id, // Primary key of one row just for react key
            invoice: s.invoice_number || '-',
            date: s.sale_date,
            channel: s.channel,
            customer: s.customer_name || "",
            distributorId: s.distributor_id || "",
            status: s.payment_status,
            items: [], // Line items array
            totalRevenue: 0,
            totalCogs: 0,
            totalItems: 0,
          };
        }
        
        grouped[inv].items.push({
          id: s.id,
          productId: s.product_id,
          productName: s.products?.name || 'Custom Item',
          quantity: Number(s.quantity),
          unitPrice: Number(s.unit_price),
          revenue: Number(s.total_revenue),
          cogs: Number(s.cogs)
        });
        
        grouped[inv].totalRevenue += Number(s.total_revenue);
        grouped[inv].totalCogs += Number(s.cogs);
        grouped[inv].totalItems += Number(s.quantity);
      });
      
      const sortedSales = Object.values(grouped).sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());
      setSales(sortedSales);
    }

    // Load Settings
    const { data: settingsData } = await supabase.from('settings').select('*').eq('company_id', profile?.company_id).limit(1).single();
    if (settingsData) {
      setGlobalSettings({
        laborCostPerHour: Number(settingsData.labor_cost_per_hour),
        distributorMargin: Number(settingsData.distributor_margin),
        promotionalDiscount: Number(settingsData.promotional_discount),
        indirectCostReserve: Number(settingsData.indirect_cost_reserve)
      });
    }

    // Load Distributors
    const { data: distributorsData } = await supabase.from('distributors').select('*').eq('company_id', profile?.company_id).order('name');
    if (distributorsData) {
      setAvailableDistributors(distributorsData);
    }

    // Load Materials
    const { data: materialsData } = await supabase.from('materials').select('*').eq('company_id', profile?.company_id);
    if (materialsData) {
      setAvailableMaterials(materialsData.map((m: any) => ({
        id: m.id,
        name: m.name,
        cost: Number(m.cost_per_unit),
        unit: m.unit_of_measure
      })));
    }

    // Load Products with BOM
    const { data: productsData } = await supabase.from('products').select('*, bom:bom_items(*)').eq('company_id', profile?.company_id).order('name');
    if (productsData) {
      const mappedProducts = productsData.map((p: any) => ({
        id: p.id,
        sku: p.sku || "",
        name: p.name,
        category: p.category || "",
        batchSize: Number(p.batch_size),
        productionTimeHours: Number(p.production_time_hours),
        targetMargin: Number(p.target_margin),
        currentStock: Number(p.current_stock || 0),
        bom: p.bom.map((b: any) => ({
          id: b.id,
          materialId: b.material_id,
          quantity: Number(b.quantity)
        }))
      }));
      setAvailableProducts(mappedProducts);
    }
  }

  const handleEditClick = (sale: any) => {
    setEditingInvoiceNumber(sale.invoice);
    setFormData({
      date: sale.date,
      channel: sale.channel,
      customer: sale.customer,
      distributorId: sale.distributorId || "",
      status: sale.status
    });
    
    // Convert saved items back to cart format
    const newCart = sale.items.map((item: any) => ({
      productId: item.productId,
      quantity: item.quantity
    }));
    setCartItems(newCart.length > 0 ? newCart : [{productId: "", quantity: 1}]);
    
    setIsAddOpen(true);
  };

  const handleDeleteInvoice = async (invoiceNumber: string) => {
    if (!confirm(`Are you sure you want to delete invoice ${invoiceNumber}? This action cannot be undone.`)) return;
    
    const invoiceToDelete = sales.find(s => s.invoice === invoiceNumber);
    if (!invoiceToDelete) return;

    const reversalTransactions = invoiceToDelete.items.filter((i: any) => i.productId).map((item: any) => ({
      company_id: profile?.company_id,
      item_type: 'PRODUCT',
      item_id: item.productId,
      transaction_type: 'IN',
      quantity: item.quantity,
      reference_id: null,
      notes: `Voided Sale ${invoiceNumber}`
    }));

    const { error } = await supabase.rpc('reverse_sale', {
      p_invoice_number: invoiceNumber,
      p_company_id: profile?.company_id,
      p_transactions: reversalTransactions
    });

    if (error) {
      console.error('Error reversing sale:', error);
      alert(`Error deleting invoice: ${error.message}`);
    } else {
      loadSales();
    }
  };

  const handleAddSale = async () => {
    const invoiceNumber = editingInvoiceNumber || `INV-${Date.now()}`;
    
    // If editing, delete old rows first to replace with new cart
    if (editingInvoiceNumber) {
      const invoiceToDelete = sales.find(s => s.invoice === editingInvoiceNumber);
      await supabase.from('sales').delete().eq('invoice_number', editingInvoiceNumber).eq('company_id', profile?.company_id);
      
      // Revert stock for the deleted edit so we can cleanly subtract the new cart
      if (invoiceToDelete) {
        for (const item of invoiceToDelete.items) {
          if (item.productId) {
            const { data: dbProduct } = await supabase.from('products').select('current_stock').eq('id', item.productId).single();
            if (dbProduct) {
              await supabase.from('products').update({ current_stock: Number(dbProduct.current_stock) + item.quantity }).eq('id', item.productId);
              
              // Remove the old transaction log so we don't clutter the history
              await supabase.from('inventory_transactions')
                .delete()
                .eq('item_id', item.productId)
                .eq('company_id', profile?.company_id)
                .like('notes', `%${editingInvoiceNumber}%`);
            }
          }
        }
      }
    }
    
    // Build insert payload for all valid cart items
    const inserts = cartTotals.filter(c => c.productId).map(c => ({
      invoice_number: invoiceNumber,
      sale_date: formData.date,
      channel: formData.channel,
      customer_name: formData.channel === 'B2B' 
        ? availableDistributors.find(d => d.id === formData.distributorId)?.name || formData.customer 
        : formData.customer,
      distributor_id: formData.channel === 'B2B' && formData.distributorId ? formData.distributorId : null,
      product_id: c.productId,
      quantity: c.quantity,
      unit_price: c.unitPrice,
      total_revenue: c.revenue,
      cogs: c.totalCogs,
      gross_profit: c.revenue - c.totalCogs,
      payment_status: formData.status,
      company_id: profile?.company_id
    }));

    if (inserts.length > 0) {
      const inventoryTransactions = cartTotals.filter(c => c.productId).map(c => ({
        company_id: profile?.company_id,
        item_type: 'PRODUCT',
        item_id: c.productId,
        transaction_type: 'OUT',
        quantity: c.quantity,
        reference_id: null,
        notes: `Sale for invoice ${invoiceNumber}`
      }));

      const { error } = await supabase.rpc('process_sale', {
        p_sales: inserts,
        p_transactions: inventoryTransactions
      });

      if (!error) {
        loadSales();
      } else {
        console.error("Sale insert error:", error);
        alert(`Error registering sale: ${error.message}`);
        return;
      }
    }

    setIsAddOpen(false);
    setEditingInvoiceNumber(null);
    setFormData({ date: new Date().toISOString().split('T')[0], channel: "B2C", customer: "", distributorId: "", status: "Paid" });
    setCartItems([{productId: "", quantity: 1}]);
  };

  // Derive cart totals dynamically based on pricing engine
  const cartTotals = cartItems.map(item => {
    const product = availableProducts.find(p => p.id === item.productId);
    const costs = calculateCosts(product, availableMaterials, globalSettings);
    
    // Automatically switch price based on sales channel
    const unitPrice = formData.channel === 'B2B' ? costs.distributorPrice : costs.retailPrice;
    const cogs = costs.totalCost;
    
    return {
      productId: item.productId,
      quantity: item.quantity,
      unitPrice,
      cogs,
      revenue: unitPrice * item.quantity,
      totalCogs: cogs * item.quantity
    };
  });

  const grandTotalRevenue = cartTotals.reduce((sum, item) => sum + item.revenue, 0);
  const grandTotalCogs = cartTotals.reduce((sum, item) => sum + item.totalCogs, 0);

  // Global aggregate stats
  const totalGlobalRevenue = sales.reduce((sum, s) => sum + s.totalRevenue, 0);
  const totalGlobalCogs = sales.reduce((sum, s) => sum + s.totalCogs, 0);
  const globalGrossProfit = totalGlobalRevenue - totalGlobalCogs;
  const globalMargin = totalGlobalRevenue > 0 ? (globalGrossProfit / totalGlobalRevenue) * 100 : 0;

  return (
    <div className="flex flex-col gap-6 h-full">
      <div className="flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Sales & Revenue</h1>
          <p className="text-muted-foreground mt-1">Register new sales and monitor profit margins.</p>
        </div>
        
        <Button onClick={() => setIsAddOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Register Sale
        </Button>

        <Dialog open={isAddOpen} onOpenChange={(open) => {
          setIsAddOpen(open);
          if (!open) {
            setEditingInvoiceNumber(null);
            setFormData({ date: new Date().toISOString().split('T')[0], channel: "B2C", customer: "", distributorId: "", status: "Paid" });
            setCartItems([{productId: "", quantity: 1}]);
          }
        }}>
          <DialogContent className="w-[95vw] sm:max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingInvoiceNumber ? `Edit Sale: ${editingInvoiceNumber}` : "Register New Sale"}</DialogTitle>
              <DialogDescription>Add line items to your invoice. Pricing is auto-calculated based on your BOM.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-6 py-4">
              
              {/* Sale Details */}
              <div className="grid gap-4 bg-muted/50 p-4 rounded-lg border">
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
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="customer">{formData.channel === 'B2B' ? 'Distributor' : 'Customer Name'}</Label>
                    {formData.channel === 'B2B' ? (
                      <Select value={formData.distributorId} onValueChange={v => setFormData({...formData, distributorId: v || ""})}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select a distributor" />
                        </SelectTrigger>
                        <SelectContent>
                          {availableDistributors.map(d => (
                            <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Input id="customer" value={formData.customer} onChange={e => setFormData({...formData, customer: e.target.value})} placeholder="e.g. Jane Doe" />
                    )}
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
              </div>

              {/* Cart Items */}
              <div className="grid gap-4">
                <div className="flex justify-between items-center">
                  <Label className="text-base font-semibold">Products (Line Items)</Label>
                  <Button variant="outline" size="sm" onClick={() => setCartItems([...cartItems, {productId: "", quantity: 1}])}>
                    <Plus className="h-3 w-3 mr-2" />
                    Add Item
                  </Button>
                </div>
                
                <div className="border rounded-lg overflow-hidden">
                  <Table className="min-w-[800px] lg:min-w-full">
                    <TableHeader className="bg-muted/50">
                      <TableRow>
                        <TableHead>Product</TableHead>
                        <TableHead className="w-[100px]">Qty</TableHead>
                        <TableHead className="text-right">Unit Price</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                        <TableHead className="w-[50px]"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {cartItems.map((item, index) => {
                        const calculated = cartTotals[index];
                        return (
                          <TableRow key={index}>
                            <TableCell>
                              <Select value={item.productId} onValueChange={v => {
                                const newItems = [...cartItems];
                                newItems[index].productId = v || "";
                                setCartItems(newItems);
                              }}>
                                <SelectTrigger>
                                  <SelectValue placeholder="Select a product">
                                    {item.productId ? availableProducts.find(p => p.id === item.productId)?.name : "Select a product"}
                                  </SelectValue>
                                </SelectTrigger>
                                <SelectContent>
                                  {availableProducts.map(p => (
                                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </TableCell>
                            <TableCell>
                              <Input type="number" min="1" value={item.quantity} onChange={e => {
                                const newItems = [...cartItems];
                                newItems[index].quantity = parseInt(e.target.value) || 0;
                                setCartItems(newItems);
                              }} />
                            </TableCell>
                            <TableCell className="text-right text-muted-foreground">
                              ${calculated.unitPrice.toFixed(2)}
                            </TableCell>
                            <TableCell className="text-right font-medium">
                              ${calculated.revenue.toFixed(2)}
                            </TableCell>
                            <TableCell>
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => {
                                if (cartItems.length > 1) {
                                  setCartItems(cartItems.filter((_, i) => i !== index));
                                }
                              }}>
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </div>

              {/* Totals Summary */}
              <div className="flex flex-col items-end gap-1 text-sm bg-primary/5 p-4 rounded-lg border border-primary/10">
                <div className="flex justify-between w-64">
                  <span className="text-muted-foreground">Subtotal COGS:</span>
                  <span>${grandTotalCogs.toFixed(2)}</span>
                </div>
                <div className="flex justify-between w-64 font-bold text-lg border-t pt-1 mt-1">
                  <span>Grand Total:</span>
                  <span className="text-emerald-600">${grandTotalRevenue.toFixed(2)}</span>
                </div>
              </div>

            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsAddOpen(false)}>Cancel</Button>
              <Button onClick={handleAddSale} disabled={cartItems.length === 0 || !cartItems[0].productId}>
                {editingInvoiceNumber ? "Save Changes" : "Register Sale"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        
        {/* View Details Modal */}
        <Dialog open={!!viewDetailsInvoice} onOpenChange={(open) => !open && setViewDetailsInvoice(null)}>
          <DialogContent className="w-[95vw] sm:max-w-2xl max-h-[90vh] overflow-y-auto">
            {viewDetailsInvoice && (
              <>
                <DialogHeader>
                  <DialogTitle>Invoice Details</DialogTitle>
                  <DialogDescription>
                    {viewDetailsInvoice.invoice} • {viewDetailsInvoice.date} • {viewDetailsInvoice.customer}
                  </DialogDescription>
                </DialogHeader>
                <div className="border rounded-lg overflow-hidden my-4">
                  <Table className="min-w-[800px] lg:min-w-full">
                    <TableHeader className="bg-muted/50">
                      <TableRow>
                        <TableHead>Product</TableHead>
                        <TableHead className="text-right">Qty</TableHead>
                        <TableHead className="text-right">Unit Price</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {viewDetailsInvoice.items.map((item: any, i: number) => (
                        <TableRow key={i}>
                          <TableCell className="font-medium">{item.productName}</TableCell>
                          <TableCell className="text-right">{item.quantity}</TableCell>
                          <TableCell className="text-right text-muted-foreground">${item.unitPrice.toFixed(2)}</TableCell>
                          <TableCell className="text-right font-medium">${item.revenue.toFixed(2)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                <div className="flex justify-end pt-2 border-t">
                  <div className="text-right">
                    <p className="text-sm text-muted-foreground">Total Revenue</p>
                    <p className="text-xl font-bold text-emerald-600">${viewDetailsInvoice.totalRevenue.toFixed(2)}</p>
                  </div>
                </div>
              </>
            )}
          </DialogContent>
        </Dialog>

      </div>

      <div className="grid gap-4 md:grid-cols-4 shrink-0">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-600">DOP {totalGlobalRevenue.toLocaleString()}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">COGS</CardTitle>
            <ShoppingBag className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">DOP {totalGlobalCogs.toLocaleString()}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Gross Profit</CardTitle>
            <TrendingUp className="h-4 w-4 text-emerald-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">DOP {globalGrossProfit.toLocaleString()}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Avg. Gross Margin</CardTitle>
            <Store className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{globalMargin.toFixed(1)}%</div>
          </CardContent>
        </Card>
      </div>

      <div className="bg-card border rounded-lg flex flex-col overflow-hidden flex-1 min-h-0">
        <div className="p-4 border-b flex items-center justify-between gap-4 shrink-0">
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
        
        <div className="relative w-full overflow-y-auto">
          <Table className="min-w-[800px] lg:min-w-full">
            <TableHeader className="bg-muted/50 sticky top-0 z-10">
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Invoice</TableHead>
                <TableHead>Customer / Partner</TableHead>
                <TableHead className="text-right">Items Sold</TableHead>
                <TableHead className="text-right">Revenue</TableHead>
                <TableHead className="text-right">Status</TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sales.filter(s => s.customer.toLowerCase().includes(searchTerm.toLowerCase())).map((sale) => {
                return (
                  <TableRow key={sale.id}>
                    <TableCell className="text-muted-foreground whitespace-nowrap">
                      {sale.date}
                    </TableCell>
                    <TableCell>
                      <span className="font-mono text-xs bg-muted px-2 py-1 rounded border">
                        {sale.invoice}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">{sale.customer}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {sale.channel === 'B2B' ? 'B2B Wholesale' : 'B2C Direct'}
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {sale.totalItems}
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      ${sale.totalRevenue.toLocaleString(undefined, {minimumFractionDigits: 2})}
                    </TableCell>
                    <TableCell className="text-right">
                      {sale.status === 'Paid' ? (
                        <span className="inline-flex items-center rounded-full bg-emerald-500/10 px-2 py-1 text-xs font-medium text-emerald-600 ring-1 ring-inset ring-emerald-500/20">
                          Paid
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-full bg-amber-500/10 px-2 py-1 text-xs font-medium text-amber-500 ring-1 ring-inset ring-amber-500/20">
                          Pending
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger render={<Button variant="ghost" size="icon" className="h-8 w-8" />}>
                          <MoreHorizontal className="h-4 w-4" />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuGroup>
                            <DropdownMenuItem onClick={() => setViewDetailsInvoice(sale)}>
                              <Eye className="mr-2 h-4 w-4" />
                              View Details
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleEditClick(sale)}>
                              <Pencil className="mr-2 h-4 w-4" />
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleDeleteInvoice(sale.invoice)} className="text-destructive">
                              <Trash2 className="mr-2 h-4 w-4" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuGroup>
                        </DropdownMenuContent>
                      </DropdownMenu>
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
