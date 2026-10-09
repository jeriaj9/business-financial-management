'use client';

import { useMemo, useState } from "react";
import { CircleAlert, CircleCheck, CircleMinus, Printer } from "lucide-react";
import { friendlyError } from "@/lib/errors";
import { formatMoney, formatMonth, formatPercent, formatPoints } from "@/lib/format";
import { addMonths, endOfMonth, startOfMonth, today } from "@/lib/domain/dates";
import { buildMonthlyReport } from "@/lib/domain/insights";
import { useDataset } from "@/lib/data/dataset";
import { useOpenReceivables } from "@/lib/data/hooks";
import { RowsTable } from "@/components/app/RowsTable";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import { Amount, ErrorState, LoadingState, PageHeader, Section } from "@/components/ui/page";
import { insightText } from "@/i18n/es";
import { cn } from "@/lib/utils";

export default function MonthlyReportPage() {
  const asOf = today();
  const months = Array.from({ length: 12 }, (_, i) => startOfMonth(addMonths(startOfMonth(asOf), -i)));
  const [month, setMonth] = useState(months[0]);
  const data = useDataset({ salesFrom: addMonths(month, -1), salesTo: asOf, withHistory: true });
  const receivables = useOpenReceivables(data.companyId);

  const report = useMemo(() => {
    if (data.isLoading) return null;
    return buildMonthlyReport({
      month,
      asOf,
      sales: data.sales,
      expenses: data.expenses,
      channels: data.channels,
      products: data.products,
      materials: data.materials,
      costHistory: data.costHistory,
      receivables: (receivables.data ?? []).map((r) => ({ id: r.id, number: r.number, dueDate: r.due_date, balance: Number(r.balance), counterpartyLabel: "" })),
      labels: { product: data.productName, channel: data.channelName },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.isLoading, data.sales, data.expenses, data.channels, data.products, data.materials, data.costHistory, receivables.data, month, asOf]);

  if (data.isLoading || !report) return <LoadingState label="Preparando el informe…" />;
  if (data.error) return <ErrorState message={friendlyError(data.error)} onRetry={data.reload} />;

  const currency = data.currency;
  const { current, previous, decomposition } = report;
  const inProgress = current.to !== endOfMonth(month);
  const kpis = [
    { label: "Ventas netas", curr: current.revenue, prev: previous.revenue },
    { label: "Margen bruto", curr: current.grossProfit, prev: previous.grossProfit, pct: current.grossMargin, prevPct: previous.grossMargin },
    { label: "Contribución", curr: current.contribution, prev: previous.contribution },
    { label: "Gastos", curr: current.expenses, prev: previous.expenses, invert: true },
    { label: "Resultado operativo", curr: current.operatingResult, prev: previous.operatingResult },
  ];
  const drivers = [
    { key: "volume", label: "Volumen", value: decomposition.volume, help: "Vender más o menos unidades" },
    { key: "mix", label: "Mezcla", value: decomposition.mix, help: "Qué productos y por qué canales" },
    { key: "price", label: "Precio", value: decomposition.price, help: "Precios netos y descuentos" },
    { key: "cost", label: "Costo", value: decomposition.cost, help: "Costo de lo vendido por unidad" },
  ];
  const maxDriver = Math.max(...drivers.map((d) => Math.abs(d.value)), 1);

  return (
    <div className="flex flex-col gap-6 print:gap-4">
      <PageHeader
        title={`Informe de ${formatMonth(month)}`}
        description={`Comparado con ${formatMonth(addMonths(month, -1))}${inProgress ? ` (mismos días: del 1 al ${Number(current.to.slice(8, 10))})` : ""}. Todo se calcula con tus datos; nada se estima.`}
        actions={
          <div className="flex gap-2 print:hidden">
            <NativeSelect className="w-48" aria-label="Mes" value={month} onValueChange={setMonth} options={months.map((m) => ({ value: m, label: formatMonth(m) }))} />
            <Button variant="outline" onClick={() => window.print()}><Printer className="h-4 w-4" /> Imprimir</Button>
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {kpis.map((k) => {
          const delta = k.curr - k.prev;
          return (
            <div key={k.label} className="rounded-xl border bg-card p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{k.label}</p>
              <p className="mt-2 text-xl font-semibold tabular-nums">{formatMoney(k.curr, currency, { decimals: 0 })}</p>
              <p className="mt-1 text-xs">
                <Amount value={k.invert ? -delta : delta}>{formatMoney(delta, currency, { decimals: 0, signed: true })}</Amount>
                {k.pct !== undefined && <span className="text-muted-foreground"> · {formatPercent(k.pct)} ({formatPoints(((k.pct ?? 0) - (k.prevPct ?? 0)) * 100)})</span>}
              </p>
            </div>
          );
        })}
      </div>

      <Section title="Lo que pasó este mes">
        <ul className="grid gap-3">
          {report.insights.map((insight, i) => {
            const Icon = insight.tone === "positive" ? CircleCheck : insight.tone === "negative" ? CircleAlert : CircleMinus;
            return (
              <li key={i} className="flex gap-3 text-sm leading-relaxed">
                <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", insight.tone === "positive" ? "text-emerald-400" : insight.tone === "negative" ? "text-red-400" : "text-muted-foreground")} />
                <span>{insightText(insight, currency)}</span>
              </li>
            );
          })}
        </ul>
      </Section>

      {previous.units > 0 && current.units > 0 && (
        <Section title="Por qué cambió tu margen bruto" description={`De ${formatMoney(decomposition.grossProfitPrev, currency, { decimals: 0 })} a ${formatMoney(decomposition.grossProfitCurr, currency, { decimals: 0 })}. La suma de los cuatro efectos es exactamente la diferencia.`}>
          <div className="grid gap-3">
            {drivers.map((d) => (
              <div key={d.key} className="grid grid-cols-[110px_1fr_110px] items-center gap-3 text-sm">
                <div>
                  <p className="font-medium">{d.label}</p>
                  <p className="text-xs text-muted-foreground">{d.help}</p>
                </div>
                <div className="relative h-6">
                  <div className="absolute inset-y-0 left-1/2 w-px bg-border" />
                  <div
                    className={cn("absolute top-1 h-4 rounded", d.value >= 0 ? "left-1/2 bg-emerald-500/70" : "right-1/2 bg-red-500/70")}
                    style={{ width: `${(Math.abs(d.value) / maxDriver) * 50}%` }}
                  />
                </div>
                <p className="text-right tabular-nums"><Amount value={d.value}>{formatMoney(d.value, currency, { decimals: 0, signed: true })}</Amount></p>
              </div>
            ))}
            <div className="grid grid-cols-[110px_1fr_110px] items-center gap-3 border-t pt-3 text-sm font-medium">
              <p>Total</p>
              <span />
              <p className="text-right tabular-nums"><Amount value={decomposition.delta}>{formatMoney(decomposition.delta, currency, { decimals: 0, signed: true })}</Amount></p>
            </div>
          </div>
        </Section>
      )}

      {report.materialDrivers.length > 0 && (
        <Section
          title="Insumos que cambiaron de precio"
          description="Tu costo de lo vendido refleja estos aumentos poco a poco, a medida que usas el inventario comprado antes. La última columna muestra el efecto completo en un mes como este, a precio de reposición: es lo que viene."
        >
          <RowsTable dense rows={report.materialDrivers} rowKey={(m) => m.materialId} columns={[
            { key: "m", header: "Materia prima", cell: (m) => m.materialName },
            { key: "c", header: "Costo antes → ahora", align: "right", cell: (m) => `${formatMoney(m.costPrev, currency, { decimals: m.costPrev < 1 ? 4 : 2 })} → ${formatMoney(m.costCurr, currency, { decimals: m.costCurr < 1 ? 4 : 2 })}` },
            { key: "p", header: "Cambio", align: "right", cell: (m) => <Amount value={-m.changePct}>{formatPercent(m.changePct, 1, { signed: true })}</Amount> },
            { key: "i", header: "Efecto completo a precio de reposición", align: "right", cell: (m) => <Amount value={m.impact}>{formatMoney(m.impact, currency, { signed: true })}</Amount> },
          ]} />
        </Section>
      )}
    </div>
  );
}
