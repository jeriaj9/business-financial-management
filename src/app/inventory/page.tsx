'use client';

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/components/AuthProvider";
import { useMaterials, useProducts, useInventoryTransactions } from "@/lib/hooks";
import { PageLoader } from "@/components/PageLoader";
import { ArrowDownRight, ArrowUpRight, Box, Boxes, PackageSearch } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DataTable, ColumnDef } from "@/components/ui/data-table";

export default function InventoryPage() {
  const [metrics, setMetrics] = useState({
    lowStockCount: 0,
    materialsValue: 0,
    productsValue: 0
  });
  const [lowStockItems, setLowStockItems] = useState<any[]>([]);
  const [productInventory, setProductInventory] = useState<any[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const { profile } = useAuth();
  const { data: materialsData, isLoading: isMaterialsLoading } = useMaterials(profile?.company_id);
  const { data: productsData, isLoading: isProductsLoading } = useProducts(profile?.company_id);
  const { data: txsData, isLoading: isTxsLoading } = useInventoryTransactions(profile?.company_id);
  
  const isLoading = isMaterialsLoading || isProductsLoading || isTxsLoading;

  useEffect(() => {
    try {
      // Process materials
      let mValue = 0;
      let lowItems: any[] = [];
      if (materialsData) {
        materialsData.forEach((m: any) => {
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

      // Process products
      let pValue = 0;
      if (productsData) {
        productsData.forEach((p: any) => {
          pValue += Number(p.total_cost || 0) * Number(p.current_stock || 0);
        });
        setProductInventory(productsData);
      }
      
      setMetrics({
        lowStockCount: lowItems.length,
        materialsValue: mValue,
        productsValue: pValue
      });
      setLowStockItems(lowItems);

      // Process transactions
      if (txsData) {
        const allItems = [...(materialsData || []), ...(productsData || [])];
        const mappedTxs = txsData.map((tx: any) => {
          const matchedItem = allItems.find((i: any) => i.id === tx.item_id);
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
    } catch (e: any) {
      console.error("loadData error:", e);
    }
  }, [materialsData, productsData, txsData]);

  const productColumns: ColumnDef<any>[] = [
    {
      header: "Product",
      cell: (item) => (
        <>
          <div className="font-medium">{item.name}</div>
          <div className="text-xs text-muted-foreground">{item.sku}</div>
        </>
      )
    },
    {
      header: "Stock",
      className: "text-right font-medium",
      cell: (item) => (
        <>
          {Number(item.current_stock || 0)} <span className="text-muted-foreground font-normal text-xs ml-1">units</span>
        </>
      )
    },
    {
      header: "Value (COGS)",
      className: "text-right font-medium text-emerald-600",
      cell: (item) => {
        const value = Number(item.current_stock || 0) * Number(item.total_cost || 0);
        return `$${value.toLocaleString(undefined, {minimumFractionDigits: 2})}`;
      }
    }
  ];

  const transactionColumns: ColumnDef<any>[] = [
    {
      header: "Item",
      cell: (item) => (
        <>
          <div className="font-medium">{item.item}</div>
          <div className="text-xs text-muted-foreground">{item.date} • {item.reference}</div>
        </>
      )
    },
    {
      header: "Type",
      cell: (item) => {
        if (item.type === 'IN') return <span className="text-xs font-semibold text-emerald-600 bg-emerald-500/10 px-2 py-1 rounded-full flex w-fit items-center"><ArrowDownRight className="h-3 w-3 mr-1"/> Purchase IN</span>;
        if (item.type === 'OUT') return <span className="text-xs font-semibold text-sky-600 bg-sky-500/10 px-2 py-1 rounded-full flex w-fit items-center"><ArrowUpRight className="h-3 w-3 mr-1"/> Sale OUT</span>;
        if (item.type === 'PRODUCTION_USAGE') return <span className="text-xs font-semibold text-amber-600 bg-amber-500/10 px-2 py-1 rounded-full flex w-fit items-center"><Boxes className="h-3 w-3 mr-1"/> Production</span>;
        return item.type;
      }
    },
    {
      header: "Qty",
      className: "text-right font-medium",
      cell: (item) => (
        <span className={item.qty > 0 ? "text-emerald-600" : "text-destructive"}>
          {item.qty > 0 ? "+" : ""}{item.qty}
        </span>
      )
    }
  ];

  if (isLoading) return <PageLoader />;

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
            <DataTable
              data={productInventory}
              columns={productColumns}
              hideToolbar={true}
              emptyMessage={<div className="py-4 text-center text-muted-foreground">No products registered.</div>}
            />
          </CardContent>
        </Card>

        {/* Right Side: Recent Transactions */}
        <Card className="flex flex-col h-full">
          <CardHeader>
            <CardTitle>Recent Transactions</CardTitle>
            <CardDescription>Latest stock movements across the platform.</CardDescription>
          </CardHeader>
          <CardContent className="flex-1 p-0 overflow-auto">
            <DataTable
              data={transactions}
              columns={transactionColumns}
              hideToolbar={true}
              emptyMessage={<div className="py-4 text-center text-muted-foreground">No recent transactions.</div>}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
