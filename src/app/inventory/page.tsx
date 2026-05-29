'use client';

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { ArrowDownRight, ArrowUpRight, Box, Boxes, PackageSearch } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default function InventoryPage() {
  const [metrics, setMetrics] = useState({
    lowStockCount: 0,
    materialsValue: 0,
    productsValue: 0
  });
  const [lowStockItems, setLowStockItems] = useState<any[]>([]);
  const [productInventory, setProductInventory] = useState<any[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);

  useEffect(() => {
    async function loadData() {
      // Fetch materials
      const { data: materials } = await supabase.from('materials').select('*');
      let mValue = 0;
      let lowItems: any[] = [];
      if (materials) {
        materials.forEach(m => {
          mValue += Number(m.cost_per_unit) * Number(m.current_stock);
          if (Number(m.current_stock) <= Number(m.reorder_point)) {
            lowItems.push({
              name: m.name,
              current: Number(m.current_stock),
              reorder: Number(m.reorder_point),
              unit: m.unit_of_measure,
              type: "Material"
            });
          }
        });
      }

      // Fetch products
      const { data: products } = await supabase.from('products').select('*');
      let pValue = 0;
      if (products) {
        products.forEach(p => {
          pValue += Number(p.total_cost) * Number(p.current_stock);
        });
        setProductInventory(products);
      }
      
      setMetrics({
        lowStockCount: lowItems.length,
        materialsValue: mValue,
        productsValue: pValue
      });
      setLowStockItems(lowItems);

      // Fetch transactions
      const { data: txs } = await supabase.from('inventory_transactions').select('*').order('created_at', { ascending: false }).limit(200);
      if (txs) {
        const allItems = [...(materials || []), ...(products || [])];
        const mappedTxs = txs.map(tx => {
          const matchedItem = allItems.find(i => i.id === tx.item_id);
          return {
            id: tx.id,
            date: new Date(tx.created_at).toLocaleDateString(),
            item: matchedItem ? matchedItem.name : "Unknown Item",
            type: tx.transaction_type,
            qty: Number(tx.quantity),
            reference: tx.reference_id || "System"
          }
        });
        setTransactions(mappedTxs);
      }
    }
    loadData();
  }, []);
  return (
    <div className="flex flex-col gap-6 h-full">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Inventory Intelligence</h1>
          <p className="text-muted-foreground mt-1">Monitor movements across raw materials and finished goods.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline">Export Report</Button>
          <Button>Record Movement</Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Low Stock Alerts</CardTitle>
            <PackageSearch className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">{metrics.lowStockCount} Items</div>
            <p className="text-xs text-muted-foreground mt-1">Require immediate reordering</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Materials Value</CardTitle>
            <Boxes className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">DOP {metrics.materialsValue.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Finished Goods Value</CardTitle>
            <Box className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">DOP {metrics.productsValue.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-3 flex-1">
        {/* Left Side: Alerts & Status */}
        <Card className="flex flex-col h-full border-destructive/20">
          <CardHeader>
            <CardTitle className="text-destructive">Action Required: Low Stock</CardTitle>
            <CardDescription>These items have fallen below their reorder points.</CardDescription>
          </CardHeader>
          <CardContent className="flex-1 overflow-auto">
            <div className="space-y-4">
              {lowStockItems.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">All stock levels are healthy.</p>
              )}
              {lowStockItems.map((item, i) => (
                <div key={i} className="flex items-center justify-between border-b pb-3 last:border-0">
                  <div>
                    <p className="font-medium">{item.name}</p>
                    <p className="text-xs text-muted-foreground">{item.type}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-destructive">{item.current} {item.unit} left</p>
                    <p className="text-xs text-muted-foreground">Reorder at {item.reorder}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Middle Side: Product Stock */}
        <Card className="flex flex-col h-full">
          <CardHeader>
            <CardTitle>Finished Goods Inventory</CardTitle>
            <CardDescription>Current stock levels of all products ready for sale.</CardDescription>
          </CardHeader>
          <CardContent className="flex-1 p-0 overflow-auto">
            <Table className="min-w-[800px] lg:min-w-full">
              <TableHeader className="bg-muted/50 sticky top-0 z-10">
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead className="text-right">Stock</TableHead>
                  <TableHead className="text-right">Value (COGS)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {productInventory.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center py-4 text-muted-foreground">No products registered.</TableCell>
                  </TableRow>
                )}
                {productInventory.map((p) => {
                  const stock = Number(p.current_stock || 0);
                  const cost = Number(p.total_cost || 0);
                  const value = stock * cost;
                  return (
                    <TableRow key={p.id}>
                      <TableCell>
                        <div className="font-medium">{p.name}</div>
                        <div className="text-xs text-muted-foreground">{p.sku}</div>
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {stock} <span className="text-muted-foreground font-normal text-xs ml-1">units</span>
                      </TableCell>
                      <TableCell className="text-right font-medium text-emerald-600">
                        ${value.toLocaleString(undefined, {minimumFractionDigits: 2})}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Right Side: Recent Transactions */}
        <Card className="flex flex-col h-full">
          <CardHeader>
            <CardTitle>Recent Transactions</CardTitle>
            <CardDescription>Latest stock movements across the platform.</CardDescription>
          </CardHeader>
          <CardContent className="flex-1 p-0 overflow-auto">
            <Table className="min-w-[800px] lg:min-w-full">
              <TableHeader className="bg-muted/50 sticky top-0">
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {transactions.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center py-4 text-muted-foreground">No recent transactions.</TableCell>
                  </TableRow>
                )}
                {transactions.map((tx) => (
                  <TableRow key={tx.id}>
                    <TableCell>
                      <div className="font-medium">{tx.item}</div>
                      <div className="text-xs text-muted-foreground">{tx.date} • {tx.reference}</div>
                    </TableCell>
                    <TableCell>
                      {tx.type === 'IN' && <span className="text-xs font-semibold text-emerald-600 bg-emerald-500/10 px-2 py-1 rounded-full flex w-fit items-center"><ArrowDownRight className="h-3 w-3 mr-1"/> Purchase IN</span>}
                      {tx.type === 'OUT' && <span className="text-xs font-semibold text-sky-600 bg-sky-500/10 px-2 py-1 rounded-full flex w-fit items-center"><ArrowUpRight className="h-3 w-3 mr-1"/> Sale OUT</span>}
                      {tx.type === 'PRODUCTION_USAGE' && <span className="text-xs font-semibold text-amber-600 bg-amber-500/10 px-2 py-1 rounded-full flex w-fit items-center"><Boxes className="h-3 w-3 mr-1"/> Production</span>}
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      <span className={tx.qty > 0 ? "text-emerald-600" : "text-destructive"}>
                        {tx.qty > 0 ? "+" : ""}{tx.qty}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
