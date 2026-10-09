'use client';

import { useMemo, useState } from "react";
import { ArrowRight, TrendingDown, TrendingUp } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { friendlyError } from "@/lib/errors";
import { formatDate, formatMoney, formatNumber, formatPercent, formatPoints } from "@/lib/format";
import { addDays, today } from "@/lib/domain/dates";
import { analyzeCostImpact, type RepricingSuggestion } from "@/lib/domain/costImpact";
import { useDataset } from "@/lib/data/dataset";
import { invalidate } from "@/lib/data/hooks";
import { RowsTable } from "@/components/app/RowsTable";
import { AppDialog } from "@/components/ui/app-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Amount, Callout, EmptyState, ErrorState, LoadingState, PageHeader, Section, StatCard } from "@/components/ui/page";
import { NativeSelect } from "@/components/ui/native-select";
import { useToast } from "@/components/ui/toaster";

export default function CostImpactPage() {
  const asOf = today();
  const [windowDays, setWindowDays] = useState("180");
  const data = useDataset({ salesFrom: addDays(asOf, -Math.max(Number(windowDays), 90)), salesTo: asOf, withHistory: true });
  const toast = useToast();
  const [applying, setApplying] = useState<RepricingSuggestion | null>(null);
  const [newPrice, setNewPrice] = useState("");

  const result = useMemo(() => {
    if (!data.costSettings) return null;
    return analyzeCostImpact({
      asOf,
      materials: data.materials,
      products: data.products,
      costHistory: data.costHistory,
      priceHistory: data.priceHistory,
      sales: data.sales,
      settings: data.costSettings,
      windowDays: Number(windowDays),
    });
  }, [asOf, data.materials, data.products, data.costHistory, data.priceHistory, data.sales, data.costSettings, windowDays]);

  const applyPrice = async () => {
    if (!applying) return;
    const price = Number(newPrice.replace(",", "."));
    if (!(price > 0)) return toast.error("Indica un precio válido.");
    const ratio = applying.retailPrice > 0 ? price / applying.retailPrice : 1;
    const patch: Record<string, number> = { retail_price: Math.round(price * 100) / 100 };
    if (applying.distributorPrice !== null) patch.distributor_price = Math.round(applying.distributorPrice * ratio * 100) / 100;
    const { error } = await supabase.from("products").update(patch).eq("id", applying.productId);
    if (error) return toast.error("No se pudo actualizar el precio", friendlyError(error));
    toast.success("Precio actualizado", applying.distributorPrice !== null ? "El precio de distribuidor se ajustó en la misma proporción." : "El precio de distribuidor automático se ajusta solo.");
    setApplying(null);
    void invalidate("products", "product_price_history");
  };

  if (data.isLoading || !result) return <LoadingState label="Analizando cambios de costo…" />;
  if (data.error) return <ErrorState message={friendlyError(data.error)} onRetry={data.reload} />;
  const currency = data.currency;
  const toReview = result.repricing.filter((r) => r.needsReview);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Impacto de costos"
        description="Cuando sube un insumo, te mostramos qué productos afecta, cuánto margen pierdes al mes con tu mezcla de ventas actual, cuánto llevas perdido y qué precio lo restaura."
        actions={
          <NativeSelect className="w-48" aria-label="Ventana" value={windowDays} onValueChange={setWindowDays} options={[
            { value: "90", label: "Últimos 90 días" },
            { value: "180", label: "Últimos 6 meses" },
            { value: "365", label: "Últimos 12 meses" },
          ]} />
        }
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard label="Efecto mensual de los cambios" value={formatMoney(-result.totals.monthlyImpact, currency, { signed: true })} tone={result.totals.monthlyImpact > 0 ? "negative" : result.totals.monthlyImpact < 0 ? "positive" : "neutral"} hint="Sobre el margen, con tu volumen de ventas actual" />
        <StatCard label="Margen perdido desde los cambios" value={formatMoney(-result.totals.impactSinceChanges, currency, { signed: true })} tone={result.totals.impactSinceChanges > 0 ? "negative" : "neutral"} hint="Unidades vendidas después de cada cambio × aumento de costo" />
        <StatCard label="Productos para revisar precio" value={result.totals.productsToReview} tone={result.totals.productsToReview > 0 ? "warning" : "positive"} hint="Margen más de 2 puntos por debajo del que tenían al fijar el precio" />
      </div>

      <Section title="Precios a revisar" description="Compara el costo de hoy con el costo que tenía cada producto cuando fijaste su precio por última vez.">
        {result.repricing.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aún no hay productos con receta y precio.</p>
        ) : (
          <>
            {toReview.length === 0 && <Callout tone="success" className="mb-4">Tus precios siguen cubriendo el margen con el que los fijaste.</Callout>}
            <RowsTable
              rows={result.repricing}
              rowKey={(r) => r.productId}
              rowClassName={(r) => (r.needsReview ? "bg-amber-500/5" : undefined)}
              columns={[
                { key: "p", header: "Producto", cell: (r) => <div><p className="font-medium">{r.productName}</p><p className="text-xs text-muted-foreground">Precio fijado {r.lastPriceChangeAt ? formatDate(r.lastPriceChangeAt) : "—"}</p></div> },
                { key: "cost", header: "Costo entonces → hoy", align: "right", cell: (r) => (
                  <span className="whitespace-nowrap">{formatMoney(r.fullCostThen, currency)} <ArrowRight className="inline h-3 w-3" /> <Amount value={r.fullCostNow - r.fullCostThen} invert>{formatMoney(r.fullCostNow, currency)}</Amount></span>
                ) },
                { key: "price", header: "Precio actual", align: "right", cell: (r) => formatMoney(r.retailPrice, currency) },
                { key: "margin", header: "Margen entonces → hoy", align: "right", sortValue: (r) => r.marginDropPts, cell: (r) => (
                  <span className="whitespace-nowrap">{formatPercent(r.marginThen)} → {formatPercent(r.marginNow)} <span className={r.marginDropPts > 0.05 ? "text-red-400" : "text-muted-foreground"}>({formatPoints(-r.marginDropPts)})</span></span>
                ) },
                { key: "gap", header: "Pierdes al mes", align: "right", sortValue: (r) => r.monthlyGap, cell: (r) => (r.monthlyGap > 0.5 ? <span className="text-red-400">{formatMoney(r.monthlyGap, currency)}</span> : "—") },
                { key: "suggest", header: "Precio que restaura el margen", align: "right", cell: (r) => (
                  <div className="text-right">
                    <p className="font-medium tabular-nums">{formatMoney(r.keepMarginRetail, currency)}</p>
                    <p className="text-xs text-muted-foreground">mismo monto: {formatMoney(r.keepAmountRetail, currency)}</p>
                  </div>
                ) },
                { key: "a", header: "", align: "right", cell: (r) => data.canEdit && r.needsReview && (
                  <Button size="sm" variant="outline" onClick={() => { setApplying(r); setNewPrice(String(r.keepMarginRetail)); }}>Ajustar</Button>
                ) },
              ]}
            />
          </>
        )}
      </Section>

      <Section title="Cambios de costo recientes">
        {result.changes.length === 0 ? (
          <EmptyState title="Sin cambios de costo en este período" description="Cada compra a un precio distinto o cada edición del costo de una materia prima aparecerá aquí con su efecto en tus productos." />
        ) : (
          <div className="grid gap-4">
            {result.changes.map((c) => (
              <div key={`${c.materialId}-${c.effectiveAt}`} className="rounded-xl border p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <span className={`mt-0.5 flex h-8 w-8 items-center justify-center rounded-lg ${c.changePct > 0 ? "bg-red-500/10 text-red-400" : "bg-emerald-500/10 text-emerald-400"}`}>
                      {c.changePct > 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
                    </span>
                    <div>
                      <p className="font-medium">{c.materialName} {c.changePct > 0 ? "subió" : "bajó"} {formatPercent(Math.abs(c.changePct), 1)}</p>
                      <p className="text-sm text-muted-foreground">
                        {formatMoney(c.previousCost, currency, { decimals: c.previousCost < 1 ? 4 : 2 })} → {formatMoney(c.newCost, currency, { decimals: c.newCost < 1 ? 4 : 2 })} por {c.unit} · {formatDate(c.effectiveAt)} · {c.source === "purchase" ? "por una compra" : "edición manual"}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground">Efecto mensual</p>
                    <p className="text-lg font-semibold"><Amount value={-c.monthlyImpact}>{formatMoney(-c.monthlyImpact, currency, { signed: true })}</Amount></p>
                  </div>
                </div>
                {c.affected.length === 0 ? (
                  <p className="mt-3 text-sm text-muted-foreground">No se usa en ninguna receta.</p>
                ) : (
                  <div className="mt-3">
                    <RowsTable dense rows={c.affected} rowKey={(a) => a.productId} columns={[
                      { key: "p", header: "Producto afectado", cell: (a) => a.productName },
                      { key: "d", header: "Costo por unidad", align: "right", cell: (a) => <Amount value={a.variableCostDelta} invert>{formatMoney(a.variableCostDelta, currency, { signed: true })}</Amount> },
                      { key: "u", header: "Unidades/mes", align: "right", cell: (a) => formatNumber(a.monthlyUnits, 1) },
                      { key: "m", header: "Efecto mensual", align: "right", cell: (a) => <Amount value={-a.monthlyImpact}>{formatMoney(-a.monthlyImpact, currency, { signed: true })}</Amount> },
                      { key: "s", header: "Desde el cambio", align: "right", cell: (a) => <Amount value={-a.impactSinceChange}>{formatMoney(-a.impactSinceChange, currency, { signed: true })}</Amount> },
                      { key: "adj", header: "Precio", cell: (a) => (a.priceAdjustedSince ? <Badge tone="success">Ajustado</Badge> : a.variableCostDelta > 0 ? <Badge tone="warning">Sin ajustar</Badge> : <Badge>—</Badge>) },
                    ]} />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Section>

      <AppDialog open={!!applying} onOpenChange={(o) => !o && setApplying(null)} title={`Ajustar precio · ${applying?.productName ?? ""}`}
        footer={<><Button variant="outline" onClick={() => setApplying(null)}>Cancelar</Button><Button onClick={applyPrice}>Aplicar nuevo precio</Button></>}>
        {applying && (
          <div className="grid gap-4">
            <p className="text-sm text-muted-foreground">
              Precio actual {formatMoney(applying.retailPrice, currency)}. Para recuperar el margen de {formatPercent(applying.marginThen)}, el precio sugerido es {formatMoney(applying.keepMarginRetail, currency)}; para mantener la misma ganancia por unidad, {formatMoney(applying.keepAmountRetail, currency)}.
            </p>
            <FormField label={`Nuevo precio de lista (${currency})`} inputMode="decimal" value={newPrice} onChange={(e) => setNewPrice(e.target.value)} />
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => setNewPrice(String(applying.keepMarginRetail))}>Mismo margen %</Button>
              <Button size="sm" variant="outline" onClick={() => setNewPrice(String(applying.keepAmountRetail))}>Misma ganancia por unidad</Button>
            </div>
            <Callout tone="info">Antes de subir precios, prueba el efecto en volumen con el Simulador.</Callout>
          </div>
        )}
      </AppDialog>
    </div>
  );
}
