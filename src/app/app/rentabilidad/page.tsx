'use client';

import { useMemo, useState } from "react";
import Link from "next/link";
import { friendlyError } from "@/lib/errors";
import { formatMoney, formatNumber, formatPercent } from "@/lib/format";
import { analyzeProfitability, type ProfitRow } from "@/lib/domain/profitability";
import { useDataset } from "@/lib/data/dataset";
import { PeriodPicker, periodFor, type Period } from "@/components/app/PeriodPicker";
import { RowsTable } from "@/components/app/RowsTable";
import { Amount, Callout, EmptyState, ErrorState, LoadingState, PageHeader, StatCard } from "@/components/ui/page";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

export default function ProfitabilityPage() {
  const [period, setPeriod] = useState<Period>(periodFor("last_90"));
  const data = useDataset({ salesFrom: period.from, salesTo: period.to });

  const result = useMemo(
    () => analyzeProfitability(data.sales, data.channels, { channel: data.channelName }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data.sales, data.channels]
  );

  if (data.isLoading) return <LoadingState label="Calculando rentabilidad…" />;
  if (data.error) return <ErrorState message={friendlyError(data.error)} onRetry={data.reload} />;

  const currency = data.currency;
  const unconfigured = data.channels.filter((c) => c.isActive && c.commissionPct + c.paymentFeePct + c.costPerOrder + c.costPerUnit === 0);
  const columns = (dimensionLabel: string) => [
    { key: "label", header: dimensionLabel, sortValue: (r: ProfitRow) => r.label, cell: (r: ProfitRow) => <span className="font-medium">{r.label}</span> },
    { key: "units", header: "Unidades", align: "right" as const, sortValue: (r: ProfitRow) => r.units, cell: (r: ProfitRow) => formatNumber(r.units) },
    { key: "revenue", header: "Ventas netas", align: "right" as const, sortValue: (r: ProfitRow) => r.revenue, cell: (r: ProfitRow) => formatMoney(r.revenue, currency), footer: formatMoney(result.totals.revenue, currency) },
    { key: "cogs", header: "Costo producto", align: "right" as const, sortValue: (r: ProfitRow) => r.cogs, cell: (r: ProfitRow) => <span className="text-muted-foreground">{formatMoney(r.cogs, currency)}</span>, footer: formatMoney(result.totals.cogs, currency) },
    { key: "channel", header: "Costo canal", align: "right" as const, sortValue: (r: ProfitRow) => r.channelCosts, cell: (r: ProfitRow) => <span className="text-muted-foreground">{formatMoney(r.channelCosts, currency)}</span>, footer: formatMoney(result.totals.channelCosts, currency) },
    { key: "contribution", header: "Contribución", align: "right" as const, sortValue: (r: ProfitRow) => r.contribution, cell: (r: ProfitRow) => <Amount value={r.contribution} className="font-medium">{formatMoney(r.contribution, currency)}</Amount>, footer: formatMoney(result.totals.contribution, currency) },
    { key: "margin", header: "Margen", align: "right" as const, sortValue: (r: ProfitRow) => r.margin, cell: (r: ProfitRow) => <MarginPill value={r.margin} />, footer: formatPercent(result.totals.margin) },
    { key: "share", header: "Peso en la ganancia", className: "w-40", sortValue: (r: ProfitRow) => r.contributionShare, cell: (r: ProfitRow) => <ShareBar value={r.contributionShare} /> },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Rentabilidad real"
        description="Cuánto te deja cada producto, canal y cliente después del costo del producto y de lo que cuesta vender por ese canal."
        actions={<PeriodPicker value={period} onChange={setPeriod} />}
      />

      {data.sales.length === 0 ? (
        <EmptyState title="No hay ventas en este período" description="Registra facturas en «Ventas y cobros» para ver la rentabilidad." />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatCard label="Ventas netas" value={formatMoney(result.totals.revenue, currency)} hint={`${result.totals.invoices} factura${result.totals.invoices === 1 ? "" : "s"} · ${formatNumber(result.totals.units)} unidades`} />
            <StatCard label="Costo de producto" value={formatMoney(result.totals.cogs, currency)} hint={formatPercent(result.totals.revenue > 0 ? result.totals.cogs / result.totals.revenue : 0) + " de las ventas"} />
            <StatCard label="Costo de vender" value={formatMoney(result.totals.channelCosts, currency)} hint="Comisiones, pagos, envíos" />
            <StatCard label="Contribución" value={formatMoney(result.totals.contribution, currency)} hint={`Margen ${formatPercent(result.totals.margin)}`} tone={result.totals.contribution >= 0 ? "positive" : "negative"} />
          </div>

          {result.lossMakers.length > 0 && (
            <Callout tone="danger" title="Esto te está haciendo perder dinero">
              <ul className="mt-1 list-disc pl-4">
                {result.lossMakers.slice(0, 5).map((r) => (
                  <li key={r.key}>
                    <span className="text-foreground">{r.label}</span>: {formatMoney(r.contribution, currency)} en el período ({formatMoney(r.revenue, currency)} vendidos).
                  </li>
                ))}
              </ul>
            </Callout>
          )}

          {unconfigured.length > 0 && (
            <Callout tone="info" action={<Link href="/app/configuracion" className="text-sm font-medium text-brand hover:underline">Configurar</Link>}>
              Los canales {unconfigured.map((c) => c.name).join(", ")} no tienen costos de venta configurados; su margen puede verse mejor de lo que es.
            </Callout>
          )}

          <Tabs defaultValue="productos">
            <TabsList className="flex-wrap">
              <TabsTrigger value="productos">Productos</TabsTrigger>
              <TabsTrigger value="canales">Canales</TabsTrigger>
              <TabsTrigger value="clientes">Clientes y distribuidores</TabsTrigger>
              <TabsTrigger value="matriz">Producto × canal</TabsTrigger>
            </TabsList>
            <TabsContent value="productos" className="mt-4">
              <RowsTable rows={result.byProduct} rowKey={(r) => r.key} columns={columns("Producto")} initialSort={{ key: "contribution", dir: "desc" }} rowClassName={(r) => (r.contribution < 0 ? "bg-red-500/5" : undefined)} />
            </TabsContent>
            <TabsContent value="canales" className="mt-4">
              <RowsTable rows={result.byChannel} rowKey={(r) => r.key} columns={columns("Canal")} initialSort={{ key: "contribution", dir: "desc" }} rowClassName={(r) => (r.contribution < 0 ? "bg-red-500/5" : undefined)} />
            </TabsContent>
            <TabsContent value="clientes" className="mt-4">
              <RowsTable rows={result.byCounterparty} rowKey={(r) => r.key} columns={columns("Cliente / distribuidor")} initialSort={{ key: "contribution", dir: "desc" }} rowClassName={(r) => (r.contribution < 0 ? "bg-red-500/5" : undefined)} />
            </TabsContent>
            <TabsContent value="matriz" className="mt-4">
              <Matrix result={result} channels={data.channels.filter((c) => result.byChannel.some((r) => r.key === c.id))} productName={data.productName} currency={currency} />
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}

function MarginPill({ value }: { value: number }) {
  return (
    <span className={cn("rounded-md px-1.5 py-0.5 text-xs font-medium tabular-nums", value < 0 ? "bg-red-500/15 text-red-400" : value < 0.25 ? "bg-amber-500/15 text-amber-400" : "bg-emerald-500/15 text-emerald-400")}>
      {formatPercent(value)}
    </span>
  );
}

function ShareBar({ value }: { value: number }) {
  const width = Math.min(Math.abs(value) * 100, 100);
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 flex-1 rounded-full bg-muted">
        <div className={cn("h-1.5 rounded-full", value < 0 ? "bg-red-400" : "bg-brand")} style={{ width: `${width}%` }} />
      </div>
      <span className="w-10 text-right text-xs tabular-nums text-muted-foreground">{formatPercent(value, 0)}</span>
    </div>
  );
}

function Matrix({ result, channels, productName, currency }: { result: ReturnType<typeof analyzeProfitability>; channels: { id: string; name: string }[]; productName: (id: string) => string; currency: string }) {
  const products = [...new Set(result.matrix.map((c) => c.productId))];
  const cell = (p: string, c: string) => result.matrix.find((m) => m.productId === p && m.channelId === c);
  return (
    <div className="overflow-x-auto rounded-xl border">
      <table className="w-full text-sm">
        <thead className="bg-muted/40">
          <tr>
            <th className="px-3 py-2 text-left font-medium text-muted-foreground">Producto</th>
            {channels.map((c) => <th key={c.id} className="px-3 py-2 text-right font-medium text-muted-foreground">{c.name}</th>)}
          </tr>
        </thead>
        <tbody>
          {products.map((p) => (
            <tr key={p} className="border-t">
              <td className="px-3 py-2 font-medium">{productName(p)}</td>
              {channels.map((c) => {
                const x = cell(p, c.id);
                return (
                  <td key={c.id} className="px-3 py-2 text-right">
                    {x ? (
                      <div className={cn("inline-flex flex-col items-end rounded-lg px-2 py-1", x.contribution < 0 ? "bg-red-500/15" : x.margin < 0.25 ? "bg-amber-500/10" : "bg-emerald-500/10")}>
                        <span className={cn("font-medium tabular-nums", x.contribution < 0 ? "text-red-400" : undefined)}>{formatPercent(x.margin)}</span>
                        <span className="text-xs tabular-nums text-muted-foreground">{formatMoney(x.contribution, currency, { decimals: 0 })}</span>
                      </div>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
