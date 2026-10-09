'use client';

import { useMemo, useState } from "react";
import { RotateCcw } from "lucide-react";
import { friendlyError } from "@/lib/errors";
import { formatMoney, formatNumber, formatPercent, formatPoints, parseInput } from "@/lib/format";
import { addDays, today } from "@/lib/domain/dates";
import { buildBaseline, emptyScenario, simulate, type Scenario } from "@/lib/domain/simulator";
import { useDataset } from "@/lib/data/dataset";
import { RowsTable } from "@/components/app/RowsTable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Amount, Callout, EmptyState, ErrorState, LoadingState, PageHeader, Section } from "@/components/ui/page";
import { cn } from "@/lib/utils";

/** Percent input stored as a fraction in the scenario. */
function PctInput({ value, onChange, label, className }: { value: number; onChange: (v: number) => void; label: string; className?: string }) {
  const [text, setText] = useState(value ? String(Math.round(value * 1000) / 10) : "");
  return (
    <div className={cn("flex items-center gap-1", className)}>
      <Input
        aria-label={label}
        inputMode="decimal"
        className="w-20 text-right"
        placeholder="0"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          onChange((parseInput(e.target.value) ?? 0) / 100);
        }}
      />
      <span className="text-xs text-muted-foreground">%</span>
    </div>
  );
}

export default function SimulatorPage() {
  const asOf = today();
  const lookbackDays = 90;
  const data = useDataset({ salesFrom: addDays(asOf, -lookbackDays + 1), salesTo: asOf });
  const [scenario, setScenario] = useState<Scenario>(emptyScenario);
  const [version, setVersion] = useState(0); // remounts inputs on reset/presets

  const baseline = useMemo(() => {
    if (!data.costSettings) return null;
    return buildBaseline({
      asOf,
      lookbackDays,
      sales: data.sales,
      products: data.products,
      materials: data.materials,
      channels: data.channels,
      expenses: data.expenses,
      settings: data.costSettings,
    });
  }, [asOf, data.sales, data.products, data.materials, data.channels, data.expenses, data.costSettings]);

  const result = useMemo(() => (baseline ? simulate(baseline, scenario) : null), [baseline, scenario]);

  if (data.isLoading || !baseline || !result) return <LoadingState label="Preparando el modelo de tu negocio…" />;
  if (data.error) return <ErrorState message={friendlyError(data.error)} onRetry={data.reload} />;

  const currency = data.currency;
  const usedMaterials = data.materials.filter((m) => data.products.some((p) => p.recipe.some((r) => r.materialId === m.id)));
  const soldProducts = data.products.filter((p) => baseline.items.some((i) => i.productId === p.id));
  const distributorChannel = data.channels.find((c) => c.kind === "distributor" && c.isActive) ?? data.channels[0];
  const set = (patch: Partial<Scenario>) => setScenario((s) => ({ ...s, ...patch }));
  const reset = (next: Scenario = emptyScenario) => {
    setScenario(next);
    setVersion((v) => v + 1);
  };

  const topMaterial = usedMaterials
    .map((m) => ({ m, weight: soldProducts.reduce((s, p) => s + (p.recipe.find((r) => r.materialId === m.id)?.quantity ?? 0) / (p.batchSize || 1) * m.costPerUnit, 0) }))
    .sort((a, b) => b.weight - a.weight)[0]?.m;

  const { baseline: b, scenario: s, delta } = result;
  const rows = [
    { label: "Ventas", base: b.revenue, next: s.revenue },
    { label: "Costo de producto", base: -b.variableCosts, next: -s.variableCosts },
    { label: "Costo de vender (canales)", base: -b.channelCosts, next: -s.channelCosts },
    { label: "Contribución", base: b.contribution, next: s.contribution, strong: true },
    { label: "Gastos fijos", base: -b.fixedCosts, next: -s.fixedCosts },
    { label: "Resultado operativo", base: b.operatingProfit, next: s.operatingProfit, strong: true },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Simulador"
        description={`Prueba decisiones antes de tomarlas. Parte de tu mes promedio de los últimos ${lookbackDays} días con los costos de hoy.`}
        actions={<Button variant="outline" onClick={() => reset()}><RotateCcw className="h-4 w-4" /> Reiniciar</Button>}
      />

      {baseline.items.length === 0 ? (
        <EmptyState title="Necesitas ventas recientes para simular" description="El simulador parte de lo que vendiste en los últimos 90 días. Registra tus facturas y vuelve." />
      ) : (
        <div className="grid gap-6 xl:grid-cols-[420px_1fr]" key={version}>
          {/* Levers */}
          <div className="order-2 grid content-start gap-4 xl:order-1">
            <Section title="Escenarios rápidos">
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => reset({ ...emptyScenario, globalPricePct: 0.1, globalVolumePct: -0.05 })}>Subir precios 10% (−5% volumen)</Button>
                {topMaterial && <Button size="sm" variant="outline" onClick={() => reset({ ...emptyScenario, materialCostPct: { [topMaterial.id]: 0.15 } })}>{topMaterial.name} +15%</Button>}
                <Button size="sm" variant="outline" onClick={() => reset({ ...emptyScenario, fixedCostMonthlyDelta: 25000 })}>Contratar ayudante</Button>
                {distributorChannel && <Button size="sm" variant="outline" onClick={() => reset({ ...emptyScenario, newDistributor: { channelId: distributorChannel.id, discountPct: 0.3, monthlyUnits: Object.fromEntries(soldProducts.slice(0, 3).map((p) => [p.id, 20])) } })}>Nuevo distribuidor</Button>}
              </div>
            </Section>

            <Section title="General">
              <div className="grid gap-3 text-sm">
                <LeverRow label="Precios (todos)"><PctInput label="Precios" value={scenario.globalPricePct} onChange={(v) => set({ globalPricePct: v })} /></LeverRow>
                <LeverRow label="Volumen (todos)"><PctInput label="Volumen" value={scenario.globalVolumePct} onChange={(v) => set({ globalVolumePct: v })} /></LeverRow>
                <LeverRow label="Tarifa de mano de obra"><PctInput label="Mano de obra" value={scenario.laborRatePct} onChange={(v) => set({ laborRatePct: v })} /></LeverRow>
                <LeverRow label={`Gastos fijos al mes (${currency})`}>
                  <Input aria-label="Gastos fijos" inputMode="decimal" className="w-28 text-right" placeholder="0" defaultValue={scenario.fixedCostMonthlyDelta || ""} onChange={(e) => set({ fixedCostMonthlyDelta: parseInput(e.target.value) ?? 0 })} />
                </LeverRow>
              </div>
            </Section>

            <Section title="Costo de insumos">
              <div className="grid gap-2 text-sm">
                {usedMaterials.map((m) => (
                  <LeverRow key={m.id} label={m.name}>
                    <PctInput label={m.name} value={scenario.materialCostPct[m.id] ?? 0} onChange={(v) => set({ materialCostPct: { ...scenario.materialCostPct, [m.id]: v } })} />
                  </LeverRow>
                ))}
              </div>
            </Section>

            <Section title="Por producto" description="Precio, volumen y tamaño de lote.">
              <div className="grid gap-3 text-sm">
                {soldProducts.map((p) => (
                  <div key={p.id} className="grid gap-1.5">
                    <Label className="text-sm">{p.name}</Label>
                    <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">Precio <PctInput label={`Precio ${p.name}`} value={scenario.productPricePct[p.id] ?? 0} onChange={(v) => set({ productPricePct: { ...scenario.productPricePct, [p.id]: v } })} /></span>
                      <span className="flex items-center gap-1">Volumen <PctInput label={`Volumen ${p.name}`} value={scenario.productVolumePct[p.id] ?? 0} onChange={(v) => set({ productVolumePct: { ...scenario.productVolumePct, [p.id]: v } })} /></span>
                      <span className="flex items-center gap-1">Lote <Input aria-label={`Lote ${p.name}`} inputMode="decimal" className="w-16 text-right" placeholder={String(p.batchSize)} onChange={(e) => {
                        const v = parseInput(e.target.value);
                        const next = { ...scenario.batchSize };
                        if (v && v > 0) next[p.id] = v; else delete next[p.id];
                        set({ batchSize: next });
                      }} /></span>
                    </div>
                  </div>
                ))}
              </div>
            </Section>

            <Section title="Canales">
              <div className="grid gap-3 text-sm">
                <p className="text-xs text-muted-foreground">Mueve parte de las ventas de un canal a otro.</p>
                <div className="flex flex-wrap items-center gap-2">
                  <NativeSelect className="w-36" aria-label="Desde" placeholder="Desde…" value={scenario.channelShift?.fromChannelId ?? ""} onValueChange={(v) => set({ channelShift: { fromChannelId: v, toChannelId: scenario.channelShift?.toChannelId ?? "", pct: scenario.channelShift?.pct ?? 0 } })} options={data.channels.map((c) => ({ value: c.id, label: c.name }))} />
                  <span className="text-muted-foreground">→</span>
                  <NativeSelect className="w-36" aria-label="Hacia" placeholder="Hacia…" value={scenario.channelShift?.toChannelId ?? ""} onValueChange={(v) => set({ channelShift: { fromChannelId: scenario.channelShift?.fromChannelId ?? "", toChannelId: v, pct: scenario.channelShift?.pct ?? 0 } })} options={data.channels.map((c) => ({ value: c.id, label: c.name }))} />
                  <PctInput label="Porcentaje movido" value={scenario.channelShift?.pct ?? 0} onChange={(v) => set({ channelShift: { fromChannelId: scenario.channelShift?.fromChannelId ?? "", toChannelId: scenario.channelShift?.toChannelId ?? "", pct: v } })} />
                </div>
              </div>
            </Section>

            {distributorChannel && (
              <Section title="Nuevo distribuidor" description="Unidades al mes que te compraría y el descuento que le darías.">
                <div className="grid gap-2 text-sm">
                  <LeverRow label="Descuento sobre lista">
                    <PctInput label="Descuento" value={scenario.newDistributor?.discountPct ?? 0} onChange={(v) => set({ newDistributor: { channelId: distributorChannel.id, discountPct: v, monthlyUnits: scenario.newDistributor?.monthlyUnits ?? {} } })} />
                  </LeverRow>
                  {data.products.filter((p) => p.isActive && p.retailPrice > 0).map((p) => (
                    <LeverRow key={p.id} label={p.name}>
                      <Input aria-label={`Unidades ${p.name}`} inputMode="decimal" className="w-20 text-right" placeholder="0" defaultValue={scenario.newDistributor?.monthlyUnits[p.id] ?? ""} onChange={(e) => set({ newDistributor: { channelId: distributorChannel.id, discountPct: scenario.newDistributor?.discountPct ?? 0, monthlyUnits: { ...(scenario.newDistributor?.monthlyUnits ?? {}), [p.id]: parseInput(e.target.value) ?? 0 } } })} />
                    </LeverRow>
                  ))}
                </div>
              </Section>
            )}
          </div>

          {/* Results: first on small screens so the effect of each lever is visible */}
          <div className="order-1 grid content-start gap-4 xl:order-2 xl:sticky xl:top-4 xl:self-start">
            <div className="rounded-xl border bg-card p-5">
              <p className="text-sm text-muted-foreground">Resultado operativo mensual</p>
              <div className="mt-1 flex flex-wrap items-end gap-4">
                <p className="text-3xl font-semibold tabular-nums"><Amount value={s.operatingProfit}>{formatMoney(s.operatingProfit, currency, { decimals: 0 })}</Amount></p>
                <p className="pb-1 text-sm">
                  <Amount value={delta.operatingProfit}>{formatMoney(delta.operatingProfit, currency, { decimals: 0, signed: true })}</Amount>
                  <span className="text-muted-foreground"> vs. hoy ({formatMoney(b.operatingProfit, currency, { decimals: 0 })})</span>
                </p>
              </div>
              <p className="mt-3 text-sm text-muted-foreground">
                {Math.abs(delta.operatingProfit) < 1
                  ? "Mueve las palancas de la izquierda para ver el efecto."
                  : delta.operatingProfit > 0
                    ? `Este escenario te deja ${formatMoney(delta.operatingProfit, currency, { decimals: 0 })} más al mes (${formatMoney(delta.operatingProfit * 12, currency, { decimals: 0 })} al año).`
                    : `Este escenario te deja ${formatMoney(-delta.operatingProfit, currency, { decimals: 0 })} menos al mes (${formatMoney(-delta.operatingProfit * 12, currency, { decimals: 0 })} al año).`}
                {s.breakEvenRevenue !== null && ` Para cubrir los gastos fijos necesitas vender ${formatMoney(s.breakEvenRevenue, currency, { decimals: 0 })} al mes.`}
              </p>
            </div>

            <Section title="Mes promedio: hoy vs. escenario">
              <div className="overflow-x-auto">
              <table className="w-full min-w-[420px] text-sm">
                <thead className="text-muted-foreground">
                  <tr>
                    <th className="pb-2 text-left font-medium" />
                    <th className="pb-2 text-right font-medium">Hoy</th>
                    <th className="pb-2 text-right font-medium">Escenario</th>
                    <th className="pb-2 text-right font-medium">Diferencia</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.label} className={cn("border-t", r.strong && "font-medium")}>
                      <td className="py-2">{r.label}</td>
                      <td className="py-2 text-right tabular-nums">{formatMoney(r.base, currency, { decimals: 0 })}</td>
                      <td className="py-2 text-right tabular-nums">{formatMoney(r.next, currency, { decimals: 0 })}</td>
                      <td className="py-2 text-right tabular-nums"><Amount value={r.next - r.base}>{formatMoney(r.next - r.base, currency, { decimals: 0, signed: true })}</Amount></td>
                    </tr>
                  ))}
                  <tr className="border-t">
                    <td className="py-2">Margen de contribución</td>
                    <td className="py-2 text-right tabular-nums">{formatPercent(b.contributionMargin)}</td>
                    <td className="py-2 text-right tabular-nums">{formatPercent(s.contributionMargin)}</td>
                    <td className="py-2 text-right tabular-nums"><Amount value={delta.contributionMarginPts}>{formatPoints(delta.contributionMarginPts)}</Amount></td>
                  </tr>
                  <tr className="border-t">
                    <td className="py-2">Punto de equilibrio (ventas/mes)</td>
                    <td className="py-2 text-right tabular-nums">{b.breakEvenRevenue === null ? "—" : formatMoney(b.breakEvenRevenue, currency, { decimals: 0 })}</td>
                    <td className="py-2 text-right tabular-nums">{s.breakEvenRevenue === null ? "—" : formatMoney(s.breakEvenRevenue, currency, { decimals: 0 })}</td>
                    <td className="py-2 text-right tabular-nums">{delta.breakEvenRevenue === null ? "—" : <Amount value={-delta.breakEvenRevenue}>{formatMoney(delta.breakEvenRevenue, currency, { decimals: 0, signed: true })}</Amount>}</td>
                  </tr>
                </tbody>
              </table>
              </div>
              {s.contributionMargin <= 0 && <Callout tone="danger" className="mt-3">Con este escenario cada venta pierde dinero: no hay volumen que cubra los gastos fijos.</Callout>}
            </Section>

            <Section title="Por producto">
              <RowsTable
                dense
                rows={s.byProduct.map((p) => ({ ...p, base: b.byProduct.find((x) => x.productId === p.productId) }))}
                rowKey={(p) => p.productId}
                columns={[
                  { key: "p", header: "Producto", cell: (p) => data.productName(p.productId) },
                  { key: "u", header: "Unidades/mes", align: "right", cell: (p) => formatNumber(p.units, 1) },
                  { key: "r", header: "Ventas", align: "right", cell: (p) => formatMoney(p.revenue, currency, { decimals: 0 }) },
                  { key: "c", header: "Contribución", align: "right", cell: (p) => <Amount value={p.contribution}>{formatMoney(p.contribution, currency, { decimals: 0 })}</Amount> },
                  { key: "m", header: "Margen", align: "right", cell: (p) => formatPercent(p.margin) },
                  { key: "d", header: "vs. hoy", align: "right", cell: (p) => <Amount value={p.contribution - (p.base?.contribution ?? 0)}>{formatMoney(p.contribution - (p.base?.contribution ?? 0), currency, { decimals: 0, signed: true })}</Amount> },
                ]}
              />
            </Section>
            <p className="text-xs text-muted-foreground">Supuestos: volúmenes y precios netos promedio de los últimos {lookbackDays} días, costos de receta de hoy, costos de canal según su configuración y gastos fijos promedio del período. El simulador no estima cómo reaccionan tus clientes a un cambio de precio: eso lo decides tú con el ajuste de volumen.</p>
          </div>
        </div>
      )}
    </div>
  );
}

function LeverRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="min-w-0 truncate">{label}</span>
      {children}
    </div>
  );
}
