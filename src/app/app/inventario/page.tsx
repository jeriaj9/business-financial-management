'use client';

import { useMemo, useState } from "react";
import { ClipboardCheck } from "lucide-react";
import { friendlyError } from "@/lib/errors";
import { formatDate, formatMoney, formatNumber, parseInput } from "@/lib/format";
import { invalidate, rpc, useCompany, useInventoryTransactions, useMaterials, useProducts } from "@/lib/data/hooks";
import { RowsTable } from "@/components/app/RowsTable";
import { AppDialog } from "@/components/ui/app-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Callout, ErrorState, LoadingState, PageHeader, StatCard } from "@/components/ui/page";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/toaster";
import { es } from "@/i18n/es";

/* eslint-disable @typescript-eslint/no-explicit-any */
const IN_TYPES = new Set(["OPENING", "PURCHASE", "PRODUCTION_OUTPUT", "SALE_VOID", "ADJUSTMENT_IN", "IN"]);

interface Target {
  type: "MATERIAL" | "PRODUCT";
  id: string;
  name: string;
  unit: string;
  current: number;
}

export default function InventoryPage() {
  const { companyId, canEdit, currency } = useCompany();
  const materials = useMaterials(companyId);
  const products = useProducts(companyId);
  const transactions = useInventoryTransactions(companyId, 400);
  const toast = useToast();
  const [adjusting, setAdjusting] = useState<Target | null>(null);
  const [counted, setCounted] = useState("");
  const [reason, setReason] = useState("");
  const [search, setSearch] = useState("");

  const names = useMemo(() => {
    const map = new Map<string, { name: string; unit: string }>();
    for (const m of materials.data ?? []) map.set(m.id, { name: m.name, unit: m.unit });
    for (const p of products.data ?? []) map.set(p.id, { name: p.name, unit: "u" });
    return map;
  }, [materials.data, products.data]);

  const adjust = async () => {
    if (!adjusting) return;
    const qty = parseInput(counted);
    if (qty === null || qty < 0) return toast.error("Indica la cantidad contada.");
    try {
      await rpc("adjust_inventory", { p_item_type: adjusting.type, p_item_id: adjusting.id, p_counted_quantity: qty, p_reason: reason || "Conteo físico" });
      toast.success("Inventario ajustado");
      setAdjusting(null);
      void invalidate("materials", "products", "inventory_transactions");
    } catch (err) {
      toast.error("No se pudo ajustar", friendlyError(err));
    }
  };

  if (materials.isLoading || products.isLoading) return <LoadingState />;
  if (materials.error || products.error) return <ErrorState message={friendlyError(materials.error ?? products.error)} />;

  const productRows = (products.data ?? []).filter((p) => p.name.toLowerCase().includes(search.toLowerCase()));
  const materialRows = (materials.data ?? []).filter((m) => m.name.toLowerCase().includes(search.toLowerCase()));
  const productValue = (products.data ?? []).reduce((s, p) => s + Math.max(p.currentStock, 0) * (p.avgUnitCost ?? p.variableUnitCost), 0);
  const materialValue = (materials.data ?? []).reduce((s, m) => s + Math.max(m.currentStock, 0) * m.avgCost, 0);
  const low = (materials.data ?? []).filter((m) => m.isActive && m.currentStock <= m.reorderPoint);
  const negative = [...(materials.data ?? []).filter((m) => m.currentStock < 0), ...(products.data ?? []).filter((p) => p.currentStock < 0)];

  const openAdjust = (t: Target) => {
    setAdjusting(t);
    setCounted(String(t.current));
    setReason("");
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Inventario" description="Existencias calculadas a partir de compras, producción, ventas y ajustes. Para corregir diferencias, registra un conteo físico." />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Producto terminado" value={formatMoney(productValue, currency)} hint="Valorizado a costo real promedio" />
        <StatCard label="Materias primas" value={formatMoney(materialValue, currency)} hint="Valorizado a costo promedio" />
        <StatCard label="Inventario total" value={formatMoney(productValue + materialValue, currency)} tone="brand" />
        <StatCard label="Bajo punto de reorden" value={low.length} tone={low.length > 0 ? "warning" : "neutral"} hint={low.slice(0, 3).map((m) => m.name).join(", ")} />
      </div>

      {negative.length > 0 && <Callout tone="danger" title="Existencias negativas">{negative.map((n) => n.name).join(", ")}. Registra un conteo físico para corregirlas.</Callout>}

      <Input type="search" className="max-w-sm" placeholder="Buscar artículo…" value={search} onChange={(e) => setSearch(e.target.value)} />

      <Tabs defaultValue="productos">
        <TabsList>
          <TabsTrigger value="productos">Producto terminado</TabsTrigger>
          <TabsTrigger value="materiales">Materias primas</TabsTrigger>
          <TabsTrigger value="movimientos">Movimientos</TabsTrigger>
        </TabsList>

        <TabsContent value="productos" className="mt-4">
          <RowsTable
            rows={productRows}
            rowKey={(p) => p.id}
            initialSort={{ key: "value", dir: "desc" }}
            columns={[
              { key: "name", header: "Producto", sortValue: (p) => p.name, cell: (p) => <div><p className="font-medium">{p.name}</p><p className="text-xs text-muted-foreground">{p.sku ?? ""}</p></div> },
              { key: "stock", header: "Existencia", align: "right", sortValue: (p) => p.currentStock, cell: (p) => <span className={p.currentStock < 0 ? "text-red-400" : undefined}>{formatNumber(p.currentStock)}</span> },
              { key: "cost", header: "Costo unitario", align: "right", cell: (p) => <span>{formatMoney(p.avgUnitCost ?? p.variableUnitCost, currency)}{p.avgUnitCost === null && <span className="ml-1 text-xs text-muted-foreground">(receta)</span>}</span> },
              { key: "value", header: "Valor", align: "right", sortValue: (p) => Math.max(p.currentStock, 0) * (p.avgUnitCost ?? p.variableUnitCost), cell: (p) => formatMoney(Math.max(p.currentStock, 0) * (p.avgUnitCost ?? p.variableUnitCost), currency) },
              { key: "adjust", header: "", align: "right", cell: (p) => canEdit && <Button size="sm" variant="ghost" onClick={() => openAdjust({ type: "PRODUCT", id: p.id, name: p.name, unit: "unidades", current: p.currentStock })}><ClipboardCheck className="h-4 w-4" /> Contar</Button> },
            ]}
          />
        </TabsContent>

        <TabsContent value="materiales" className="mt-4">
          <RowsTable
            rows={materialRows}
            rowKey={(m) => m.id}
            initialSort={{ key: "name", dir: "asc" }}
            columns={[
              { key: "name", header: "Materia prima", sortValue: (m) => m.name, cell: (m) => <span className="font-medium">{m.name}</span> },
              { key: "stock", header: "Existencia", align: "right", sortValue: (m) => m.currentStock, cell: (m) => `${formatNumber(m.currentStock)} ${m.unit}` },
              { key: "reorder", header: "Reorden", align: "right", cell: (m) => `${formatNumber(m.reorderPoint)} ${m.unit}` },
              { key: "status", header: "Estado", cell: (m) => (m.currentStock < 0 ? <Badge tone="danger">Negativo</Badge> : m.currentStock <= m.reorderPoint ? <Badge tone="warning">Reponer</Badge> : <Badge tone="success">OK</Badge>) },
              { key: "value", header: "Valor", align: "right", sortValue: (m) => m.currentStock * m.avgCost, cell: (m) => formatMoney(Math.max(m.currentStock, 0) * m.avgCost, currency) },
              { key: "adjust", header: "", align: "right", cell: (m) => canEdit && <Button size="sm" variant="ghost" onClick={() => openAdjust({ type: "MATERIAL", id: m.id, name: m.name, unit: m.unit, current: m.currentStock })}><ClipboardCheck className="h-4 w-4" /> Contar</Button> },
            ]}
          />
        </TabsContent>

        <TabsContent value="movimientos" className="mt-4">
          <RowsTable
            dense
            rows={(transactions.data ?? []).filter((t: any) => (names.get(t.item_id)?.name ?? "").toLowerCase().includes(search.toLowerCase()))}
            rowKey={(t: any) => t.id}
            empty="Sin movimientos."
            columns={[
              { key: "date", header: "Fecha", cell: (t: any) => formatDate(t.created_at, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) },
              { key: "item", header: "Artículo", cell: (t: any) => names.get(t.item_id)?.name ?? "Artículo eliminado" },
              { key: "type", header: "Movimiento", cell: (t: any) => <Badge tone={IN_TYPES.has(t.transaction_type) ? "success" : "neutral"}>{es.transactionTypes[t.transaction_type] ?? t.transaction_type}</Badge> },
              { key: "qty", header: "Cantidad", align: "right", cell: (t: any) => `${IN_TYPES.has(t.transaction_type) ? "+" : "−"}${formatNumber(Number(t.quantity))} ${names.get(t.item_id)?.unit ?? ""}` },
              { key: "notes", header: "Detalle", className: "whitespace-normal min-w-48", cell: (t: any) => <span className="text-xs text-muted-foreground">{t.notes}</span> },
            ]}
          />
        </TabsContent>
      </Tabs>

      <AppDialog open={!!adjusting} onOpenChange={(o) => !o && setAdjusting(null)} title={`Conteo físico · ${adjusting?.name ?? ""}`} description={adjusting ? `El sistema registra ${formatNumber(adjusting.current)} ${adjusting.unit}.` : undefined}
        footer={<><Button variant="outline" onClick={() => setAdjusting(null)}>Cancelar</Button><Button onClick={adjust}>Registrar ajuste</Button></>}>
        <div className="grid gap-4">
          <FormField label={`Cantidad contada (${adjusting?.unit ?? ""})`} inputMode="decimal" value={counted} onChange={(e) => setCounted(e.target.value)} />
          {adjusting && parseInput(counted) !== null && parseInput(counted) !== adjusting.current && (
            <p className="text-sm text-muted-foreground">Diferencia: {formatNumber(parseInput(counted)! - adjusting.current)} {adjusting.unit}</p>
          )}
          <FormField label="Motivo" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Conteo mensual, merma, rotura…" />
        </div>
      </AppDialog>
    </div>
  );
}
