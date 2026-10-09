'use client';

import { useMemo, useState } from "react";
import { Factory, Plus } from "lucide-react";
import { friendlyError } from "@/lib/errors";
import { formatDate, formatMoney, formatNumber, formatPercent, parseInput } from "@/lib/format";
import { dayNumber, today } from "@/lib/domain/dates";
import { standardConsumption, summarizeProduction, type CompletedOrder } from "@/lib/domain/production";
import { invalidate, rpc, useCompany, useMaterials, useProductionOrders, useProducts } from "@/lib/data/hooks";
import { PeriodPicker, periodFor, type Period } from "@/components/app/PeriodPicker";
import { RowsTable } from "@/components/app/RowsTable";
import { AppDialog } from "@/components/ui/app-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectField } from "@/components/ui/native-select";
import { Amount, Callout, EmptyState, ErrorState, LoadingState, PageHeader, Section, StatCard } from "@/components/ui/page";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TextareaField } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toaster";
import { es } from "@/i18n/es";

/* eslint-disable @typescript-eslint/no-explicit-any */
export default function ProductionPage() {
  const { companyId, canEdit, currency, settings } = useCompany();
  const orders = useProductionOrders(companyId);
  const products = useProducts(companyId);
  const materials = useMaterials(companyId);
  const toast = useToast();

  const [statusFilter, setStatusFilter] = useState("planned");
  const [period, setPeriod] = useState<Period>(periodFor("last_90"));

  // New order
  const [creating, setCreating] = useState(false);
  const [productId, setProductId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [plannedDate, setPlannedDate] = useState(today());
  const [notes, setNotes] = useState("");

  // Completion
  const [completing, setCompleting] = useState<any | null>(null);
  const [produced, setProduced] = useState("");
  const [hours, setHours] = useState("");
  const [actuals, setActuals] = useState<Record<string, string>>({});
  const [completedDate, setCompletedDate] = useState(today());
  const [saving, setSaving] = useState(false);

  const productById = useMemo(() => new Map((products.data ?? []).map((p) => [p.id, p])), [products.data]);
  const materialById = useMemo(() => new Map((materials.data ?? []).map((m) => [m.id, m])), [materials.data]);

  const requirement = (pid: string, qty: number) => {
    const p = productById.get(pid);
    if (!p) return [];
    return standardConsumption(p.recipe, p.batchSize, qty).map((c) => {
      const m = materialById.get(c.materialId);
      return { ...c, name: m?.name ?? "Materia prima", unit: m?.unit ?? "", stock: m?.currentStock ?? 0, cost: m?.avgCost ?? 0 };
    });
  };

  const createOrder = async () => {
    const qty = parseInput(quantity);
    if (!productId || !qty || qty <= 0) return toast.error("Selecciona un producto y una cantidad.");
    setSaving(true);
    try {
      await rpc("create_production_order", { p_product_id: productId, p_planned_quantity: qty, p_planned_date: plannedDate, p_notes: notes || null });
      toast.success("Orden de producción creada");
      setCreating(false);
      void invalidate("production_orders");
    } catch (err) {
      toast.error("No se pudo crear la orden", friendlyError(err));
    } finally {
      setSaving(false);
    }
  };

  const startComplete = (order: any) => {
    const p = productById.get(order.product_id);
    setCompleting(order);
    setProduced(String(order.planned_quantity));
    setHours(p ? String(Math.round(((p.productionTimeHours / p.batchSize) * Number(order.planned_quantity)) * 100) / 100) : "0");
    setActuals(Object.fromEntries(requirement(order.product_id, Number(order.planned_quantity)).map((r) => [r.materialId, String(Math.round(r.quantity * 1000) / 1000)])));
    setCompletedDate(today());
  };

  const completeOrder = async () => {
    if (!completing) return;
    const qty = parseInput(produced);
    if (!qty || qty <= 0) return toast.error("Indica la cantidad producida.");
    setSaving(true);
    try {
      await rpc("complete_production_order", {
        p_order_id: completing.id,
        p_produced_quantity: qty,
        p_labor_hours: parseInput(hours),
        p_consumptions: Object.entries(actuals).map(([material_id, v]) => ({ material_id, actual_quantity: parseInput(v) ?? 0 })),
        p_completed_date: completedDate,
      });
      toast.success("Producción registrada", "Se descontaron las materias primas y se sumó el producto terminado.");
      setCompleting(null);
      void invalidate("production_orders", "products", "materials", "inventory_transactions");
    } catch (err) {
      toast.error("No se pudo completar", friendlyError(err));
    } finally {
      setSaving(false);
    }
  };

  const laborHint = (order: any) => {
    const product = productById.get(order.product_id);
    const qty = parseInput(produced) ?? 0;
    if (!settings || !product) return undefined;
    if (settings.laborMode === "piece") return `Pago por pieza: ${formatMoney(qty * product.laborCostPerPiece, currency)} (${formatMoney(product.laborCostPerPiece, currency)} × ${formatNumber(qty)})`;
    const cost = (parseInput(hours) ?? 0) * settings.laborCostPerHour;
    return settings.laborMode === "hourly" ? `Costo: ${formatMoney(cost, currency)}` : `Referencia: ${formatMoney(cost, currency)} (salario fijo)`;
  };

  const cancelOrder = async (order: any) => {
    if (!window.confirm(`¿Cancelar la orden ${order.number}?`)) return;
    try {
      await rpc("cancel_production_order", { p_order_id: order.id });
      void invalidate("production_orders");
    } catch (err) {
      toast.error("No se pudo cancelar", friendlyError(err));
    }
  };

  const analysis = useMemo(() => {
    const completed: CompletedOrder[] = (orders.data ?? [])
      .filter((o: any) => o.status === "completed" && o.completed_date && dayNumber(o.completed_date) >= dayNumber(period.from) && dayNumber(o.completed_date) <= dayNumber(period.to))
      .map((o: any) => ({
        id: o.id,
        number: o.number,
        productId: o.product_id,
        productName: o.products?.name ?? "Producto",
        completedDate: o.completed_date,
        plannedQuantity: Number(o.planned_quantity),
        producedQuantity: Number(o.produced_quantity),
        laborHours: Number(o.labor_hours ?? 0),
        standardLaborHours: Number(o.standard_labor_hours ?? 0),
        laborCost: Number(o.labor_cost ?? 0),
        standardLaborCost: Number(o.standard_labor_cost ?? 0),
        laborInUnitCost: Boolean(o.labor_in_unit_cost),
        standardUnitCost: Number(o.standard_unit_cost ?? 0),
        actualUnitCost: Number(o.actual_unit_cost ?? 0),
        consumptions: (o.production_consumptions ?? []).map((c: any) => ({
          materialId: c.material_id,
          materialName: c.materials?.name ?? "Materia prima",
          unit: c.materials?.unit_of_measure ?? "",
          standardQuantity: Number(c.standard_quantity),
          actualQuantity: Number(c.actual_quantity),
          standardPrice: Number(c.standard_price),
          unitCost: Number(c.unit_cost),
        })),
      }));
    return summarizeProduction(completed);
  }, [orders.data, period]);

  if (orders.isLoading || products.isLoading || materials.isLoading) return <LoadingState />;
  if (orders.error) return <ErrorState message={friendlyError(orders.error)} onRetry={() => orders.mutate()} />;

  const rows = (orders.data ?? []).filter((o: any) => !statusFilter || o.status === statusFilter);
  const newReq = productId && parseInput(quantity) ? requirement(productId, parseInput(quantity)!) : [];
  const shortages = newReq.filter((r) => r.quantity > r.stock);
  const selectedProduct = productById.get(productId);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Producción"
        description="Planifica lotes, registra lo que realmente consumiste y descubre dónde el costo real se separa de la receta."
        actions={canEdit && <Button onClick={() => { setProductId(""); setQuantity(""); setPlannedDate(today()); setNotes(""); setCreating(true); }}><Plus className="h-4 w-4" /> Nueva orden</Button>}
      />

      <Tabs defaultValue="ordenes">
        <TabsList>
          <TabsTrigger value="ordenes">Órdenes</TabsTrigger>
          <TabsTrigger value="analisis">Costo real vs. receta</TabsTrigger>
        </TabsList>

        <TabsContent value="ordenes" className="mt-4 grid gap-4">
          <NativeSelect className="w-48" aria-label="Estado" value={statusFilter} onValueChange={setStatusFilter} options={[{ value: "", label: "Todas" }, ...Object.entries(es.productionStatus).map(([value, label]) => ({ value, label }))]} />
          {(orders.data ?? []).length === 0 ? (
            <EmptyState icon={<Factory />} title="Sin órdenes de producción" description="Cuando produces un lote, regístralo aquí: se descuentan las materias primas y se suma el producto terminado con su costo real." />
          ) : (
            <RowsTable
              rows={rows}
              rowKey={(o: any) => o.id}
              empty="No hay órdenes con este estado."
              columns={[
                { key: "number", header: "Orden", cell: (o: any) => <span className="font-medium">{o.number}</span> },
                { key: "product", header: "Producto", cell: (o: any) => o.products?.name },
                { key: "date", header: "Fecha", sortValue: (o: any) => o.completed_date ?? o.planned_date, cell: (o: any) => formatDate(o.completed_date ?? o.planned_date) },
                { key: "qty", header: "Cantidad", align: "right", cell: (o: any) => o.status === "completed" ? `${formatNumber(Number(o.produced_quantity))} de ${formatNumber(Number(o.planned_quantity))}` : formatNumber(Number(o.planned_quantity)) },
                { key: "cost", header: "Costo unitario real", align: "right", cell: (o: any) => {
                  if (o.status !== "completed") return "—";
                  const diff = Number(o.standard_unit_cost) > 0 ? (Number(o.actual_unit_cost) - Number(o.standard_unit_cost)) / Number(o.standard_unit_cost) : 0;
                  return <span>{formatMoney(Number(o.actual_unit_cost), currency)} <Amount value={diff} invert className="text-xs">({formatPercent(diff, 1, { signed: true })})</Amount></span>;
                } },
                { key: "status", header: "Estado", cell: (o: any) => <Badge tone={o.status === "completed" ? "success" : o.status === "planned" ? "info" : "neutral"}>{es.productionStatus[o.status]}</Badge> },
                { key: "actions", header: "", align: "right", cell: (o: any) => canEdit && o.status === "planned" && (
                  <div className="flex justify-end gap-1">
                    <Button size="sm" variant="ghost" onClick={() => cancelOrder(o)}>Cancelar</Button>
                    <Button size="sm" onClick={() => startComplete(o)}>Completar</Button>
                  </div>
                ) },
              ]}
            />
          )}
        </TabsContent>

        <TabsContent value="analisis" className="mt-4 grid gap-4">
          <PeriodPicker value={period} onChange={setPeriod} />
          {analysis.orders.length === 0 ? (
            <EmptyState title="Sin producción completada en este período" description="Completa órdenes de producción para ver dónde se va tu costo real." />
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <StatCard label="Unidades producidas" value={formatNumber(analysis.totals.producedQuantity)} />
                <StatCard label="Desviación total" value={formatMoney(analysis.totals.totalVariance, currency, { signed: true })} tone={analysis.totals.totalVariance > 0 ? "negative" : "positive"} hint="Costo real menos costo de receta" />
                <StatCard label="Por consumo (merma/sobreuso)" value={formatMoney(analysis.totals.usageVariance, currency, { signed: true })} tone={analysis.totals.usageVariance > 0 ? "negative" : "positive"} />
                <StatCard label="Por precio de insumos" value={formatMoney(analysis.totals.priceVariance, currency, { signed: true })} tone={analysis.totals.priceVariance > 0 ? "negative" : "positive"} hint="Costo promedio vs. costo de reposición" />
              </div>

              {analysis.products.filter((p) => p.worstMaterial).slice(0, 3).map((p) => (
                <Callout key={p.productId} tone="warning" title={`${p.productName}: ${p.worstMaterial!.materialName} se usa ${formatPercent(p.worstMaterial!.usageVariancePct, 1)} por encima de la receta`}>
                  Eso suma {formatMoney(p.worstMaterial!.usageVarianceCost, currency)} en el período. Revisa la receta o el proceso (merma, derrames, mediciones).
                </Callout>
              ))}

              <Section title="Por producto">
                <RowsTable
                  rows={analysis.products}
                  rowKey={(p) => p.productId}
                  columns={[
                    { key: "p", header: "Producto", cell: (p) => <span className="font-medium">{p.productName}</span> },
                    { key: "o", header: "Órdenes", align: "right", cell: (p) => p.orders },
                    { key: "q", header: "Producido", align: "right", cell: (p) => formatNumber(p.producedQuantity) },
                    { key: "y", header: "Rendimiento", align: "right", cell: (p) => <Amount value={p.averageYieldPct - 1}>{formatPercent(p.averageYieldPct, 0)}</Amount> },
                    { key: "s", header: "Costo receta", align: "right", cell: (p) => formatMoney(p.averageStandardUnitCost, currency) },
                    { key: "a", header: "Costo real", align: "right", cell: (p) => formatMoney(p.averageActualUnitCost, currency) },
                    { key: "v", header: "Desviación", align: "right", sortValue: (p) => p.totalVariance, cell: (p) => <Amount value={p.totalVariance} invert>{formatMoney(p.totalVariance, currency, { signed: true })}</Amount> },
                  ]}
                />
              </Section>

              <Section title="Detalle por orden">
                <div className="grid gap-3">
                  {analysis.orders.map((o) => (
                    <details key={o.orderId} className="rounded-lg border p-3">
                      <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2 text-sm">
                        <span><span className="font-medium">{o.number}</span> · {o.productName} · {formatDate(o.completedDate)}</span>
                        <span className="flex gap-3 text-xs">
                          <span>Rendimiento {formatPercent(o.yieldPct, 0)}</span>
                          <Amount value={o.totalVariance} invert>{formatMoney(o.totalVariance, currency, { signed: true })}</Amount>
                        </span>
                      </summary>
                      <div className="mt-3">
                        <RowsTable dense rows={o.materials} rowKey={(m) => m.materialId} columns={[
                          { key: "m", header: "Materia prima", cell: (m) => m.materialName },
                          { key: "s", header: "Receta", align: "right", cell: (m) => `${formatNumber(m.standardQuantity)} ${m.unit}` },
                          { key: "a", header: "Real", align: "right", cell: (m) => `${formatNumber(m.actualQuantity)} ${m.unit}` },
                          { key: "p", header: "Diferencia", align: "right", cell: (m) => <Amount value={m.usageVariancePct} invert>{formatPercent(m.usageVariancePct, 1, { signed: true })}</Amount> },
                          { key: "c", header: "Impacto", align: "right", cell: (m) => <Amount value={m.usageVarianceCost} invert>{formatMoney(m.usageVarianceCost, currency, { signed: true })}</Amount> },
                        ]} />
                        <p className="mt-2 text-xs text-muted-foreground">Mano de obra: {formatMoney(o.laborVariance, currency, { signed: true })} de diferencia frente al estándar{o.laborInUnitCost ? "" : " (informativo: se pagó con salario fijo, no forma parte del costo unitario)"}.</p>
                      </div>
                    </details>
                  ))}
                </div>
              </Section>
            </>
          )}
        </TabsContent>
      </Tabs>

      {/* New order */}
      <AppDialog open={creating} onOpenChange={setCreating} title="Nueva orden de producción" maxWidthClass="sm:max-w-xl"
        footer={<><Button variant="outline" onClick={() => setCreating(false)}>Cancelar</Button><Button onClick={createOrder} disabled={saving}>Crear orden</Button></>}>
        <div className="grid gap-4">
          <NativeSelectField label="Producto" placeholder="Selecciona…" value={productId} onValueChange={(v) => { setProductId(v); const p = productById.get(v); if (p) setQuantity(String(p.batchSize)); }}
            options={(products.data ?? []).filter((p) => p.isActive && p.recipe.length > 0).map((p) => ({ value: p.id, label: p.name }))} />
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Cantidad a producir" inputMode="decimal" value={quantity} onChange={(e) => setQuantity(e.target.value)} description={selectedProduct ? `Lote estándar: ${formatNumber(selectedProduct.batchSize)} unidades` : undefined} />
            <FormField label="Fecha planificada" type="date" value={plannedDate} onChange={(e) => setPlannedDate(e.target.value)} />
          </div>
          {newReq.length > 0 && (
            <RowsTable dense rows={newReq} rowKey={(r) => r.materialId} columns={[
              { key: "m", header: "Necesitas", cell: (r) => r.name },
              { key: "q", header: "Cantidad", align: "right", cell: (r) => `${formatNumber(r.quantity)} ${r.unit}` },
              { key: "s", header: "Existencia", align: "right", cell: (r) => <span className={r.quantity > r.stock ? "text-red-400" : undefined}>{formatNumber(r.stock)} {r.unit}</span> },
            ]} />
          )}
          {shortages.length > 0 && <Callout tone="warning">Faltan materias primas: {shortages.map((s) => s.name).join(", ")}. Puedes crear la orden igual y registrar la compra antes de completarla.</Callout>}
          <TextareaField label="Notas" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
      </AppDialog>

      {/* Complete order */}
      <AppDialog open={!!completing} onOpenChange={(o) => !o && setCompleting(null)} title={completing ? `Completar ${completing.number} · ${completing.products?.name}` : ""}
        description="Registra lo que realmente produjiste y consumiste. Las cantidades vienen precargadas con la receta."
        maxWidthClass="sm:max-w-2xl"
        footer={<><Button variant="outline" onClick={() => setCompleting(null)}>Cancelar</Button><Button onClick={completeOrder} disabled={saving}>{saving ? "Registrando…" : "Registrar producción"}</Button></>}>
        {completing && (
          <div className="grid gap-4">
            <div className="grid grid-cols-3 gap-4">
              <FormField label="Unidades producidas" inputMode="decimal" value={produced} onChange={(e) => {
                setProduced(e.target.value);
                const qty = parseInput(e.target.value);
                if (qty && qty > 0) setActuals(Object.fromEntries(requirement(completing.product_id, qty).map((r) => [r.materialId, String(Math.round(r.quantity * 1000) / 1000)])));
              }} description={`Planificado: ${formatNumber(Number(completing.planned_quantity))}`} />
              <FormField
                label={settings?.laborMode === "piece" ? "Horas (referencia)" : "Horas de trabajo"}
                inputMode="decimal"
                value={hours}
                onChange={(e) => setHours(e.target.value)}
                description={laborHint(completing)}
              />
              <FormField label="Fecha" type="date" value={completedDate} onChange={(e) => setCompletedDate(e.target.value)} />
            </div>
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">Materia prima</th>
                    <th className="px-3 py-2 text-right font-medium">Según receta</th>
                    <th className="px-3 py-2 text-right font-medium">Consumo real</th>
                    <th className="px-3 py-2 text-right font-medium">Existencia</th>
                  </tr>
                </thead>
                <tbody>
                  {requirement(completing.product_id, parseInput(produced) ?? 0).map((r) => {
                    const actual = parseInput(actuals[r.materialId] ?? "") ?? 0;
                    const diff = r.quantity > 0 ? (actual - r.quantity) / r.quantity : 0;
                    return (
                      <tr key={r.materialId} className="border-t">
                        <td className="px-3 py-1.5">{r.name}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">{formatNumber(r.quantity, 3)} {r.unit}</td>
                        <td className="px-3 py-1.5">
                          <div className="flex items-center justify-end gap-2">
                            {Math.abs(diff) >= 0.005 && <Amount value={diff} invert className="text-xs">{formatPercent(diff, 1, { signed: true })}</Amount>}
                            <Input className="w-28 text-right" inputMode="decimal" aria-label={`Consumo real de ${r.name}`} value={actuals[r.materialId] ?? ""} onChange={(e) => setActuals({ ...actuals, [r.materialId]: e.target.value })} />
                          </div>
                        </td>
                        <td className={`px-3 py-1.5 text-right tabular-nums ${actual > r.stock ? "text-red-400" : "text-muted-foreground"}`}>{formatNumber(r.stock)} {r.unit}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </AppDialog>
    </div>
  );
}
