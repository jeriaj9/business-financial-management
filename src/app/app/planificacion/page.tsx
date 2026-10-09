'use client';

import { useMemo, useState } from "react";
import Link from "next/link";
import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { friendlyError } from "@/lib/errors";
import { formatDate, formatMoney, formatNumber } from "@/lib/format";
import { addDays, today } from "@/lib/domain/dates";
import {
  cashPosition,
  forecastWeeklyDemand,
  planMaterials,
  planProduction,
  projectCash,
  recurringExpenseTemplates,
  weeklySalesByChannel,
  weeklyVariableExpenses,
} from "@/lib/domain/planning";
import { useDataset } from "@/lib/data/dataset";
import { invalidate, mapExpenses, rpc, useDistributorOrders, useExpenses, useOpenPayables, useOpenReceivables, usePayments, useProductionOrders, useSuppliers } from "@/lib/data/hooks";
import { RowsTable } from "@/components/app/RowsTable";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import { Callout, ErrorState, LoadingState, PageHeader, Section, StatCard } from "@/components/ui/page";
import { useToast } from "@/components/ui/toaster";
import { es } from "@/i18n/es";

/* eslint-disable @typescript-eslint/no-explicit-any */
const statusTone = { ok: "success", soon: "warning", urgent: "danger", order_soon: "warning", late: "danger" } as const;

export default function PlanningPage() {
  const asOf = today();
  const toast = useToast();
  const [horizon, setHorizon] = useState("4");
  const base = useDataset({ salesFrom: addDays(asOf, -7 * 26), salesTo: asOf, expensesFrom: addDays(asOf, -120), expensesTo: asOf });
  const { companyId, settings, currency, canEdit } = base;
  const productionOrders = useProductionOrders(companyId);
  const distributorOrders = useDistributorOrders(companyId);
  const suppliers = useSuppliers(companyId);
  const receivables = useOpenReceivables(companyId);
  const payables = useOpenPayables(companyId);
  const openingDate = settings?.openingCashDate ?? null;
  const payments = usePayments(companyId, openingDate);
  const expensesSinceOpening = useExpenses(openingDate ? companyId : undefined, openingDate ?? asOf, asOf);

  const plan = useMemo(() => {
    if (!settings) return null;
    const lookbackWeeks = Math.max(1, settings.demandLookbackWeeks);
    const weeklyDemand = forecastWeeklyDemand(base.sales, asOf, lookbackWeeks);
    const plannedOrders = (productionOrders.data ?? [])
      .filter((o: any) => o.status === "planned")
      .map((o: any) => ({ productId: o.product_id, quantity: Number(o.planned_quantity), plannedDate: o.planned_date }));
    const committed = new Map<string, number>();
    for (const o of distributorOrders.data ?? []) {
      if (o.status !== "submitted") continue;
      for (const l of o.distributor_order_lines) committed.set(l.product_id, (committed.get(l.product_id) ?? 0) + Number(l.quantity));
    }
    const production = planProduction({
      asOf,
      products: base.products,
      weeklyDemand,
      horizonWeeks: Number(horizon),
      safetyWeeks: settings.safetyStockWeeks,
      plannedOrders,
      committedUnits: committed,
    });
    const supplierLead = new Map<string, number>((suppliers.data ?? []).map((s: any) => [s.id, Number(s.lead_time_days)]));
    const supplierTerms = new Map<string, number>((suppliers.data ?? []).map((s: any) => [s.id, Number(s.payment_terms_days)]));
    const materials = planMaterials({
      asOf,
      products: base.products,
      materials: base.materials,
      productionNeeds: production,
      plannedOrders,
      supplierLeadTime: supplierLead,
      defaultLeadTimeDays: settings.defaultLeadTimeDays,
    });

    const opening = cashPosition({
      openingBalance: settings.openingCashBalance,
      openingDate,
      payments: (payments.data ?? []).map((p: any) => ({ direction: p.direction, date: p.payment_date, amount: Number(p.amount), voided: !!p.voided_at })),
      expenses: mapExpenses(expensesSinceOpening.data),
      asOf,
    });

    const cash = projectCash({
      asOf,
      weeks: 13,
      openingCash: opening ?? 0,
      receivables: (receivables.data ?? []).map((r: any) => ({ id: r.id, number: r.number, dueDate: r.due_date, balance: Number(r.balance), counterpartyLabel: r.distributors?.name ?? r.customers?.name ?? r.customer_name ?? "" })),
      payables: (payables.data ?? []).map((p: any) => ({ id: p.id, number: p.number, dueDate: p.due_date, balance: Number(p.balance), counterpartyLabel: p.suppliers?.name ?? "" })),
      salesByChannel: weeklySalesByChannel(base.sales, base.channels, asOf, lookbackWeeks),
      plannedPurchases: materials
        .filter((m) => m.suggestedPurchase > 0)
        .map((m) => ({
          date: m.orderBy && m.orderBy > asOf ? m.orderBy : asOf,
          amount: m.estimatedCost,
          paymentTermsDays: m.supplierId ? supplierTerms.get(m.supplierId) ?? 0 : 0,
        })),
      recurringExpenses: recurringExpenseTemplates(base.expenses, asOf),
      weeklyVariableExpenses: weeklyVariableExpenses(base.expenses, asOf),
    });

    return { production, materials, cash, opening, lookbackWeeks };
  }, [settings, base.sales, base.products, base.materials, base.channels, base.expenses, asOf, horizon, productionOrders.data, distributorOrders.data, suppliers.data, receivables.data, payables.data, payments.data, expensesSinceOpening.data, openingDate]);

  const createOrder = async (productId: string, quantity: number, date: string) => {
    try {
      await rpc("create_production_order", { p_product_id: productId, p_planned_quantity: quantity, p_planned_date: date < asOf ? asOf : date, p_notes: "Sugerida por el plan" });
      toast.success("Orden de producción creada", "La encuentras en Producción.");
      void invalidate("production_orders");
    } catch (err) {
      toast.error("No se pudo crear la orden", friendlyError(err));
    }
  };

  if (base.isLoading || !plan || productionOrders.isLoading) return <LoadingState label="Calculando el plan…" />;
  if (base.error) return <ErrorState message={friendlyError(base.error)} onRetry={base.reload} />;

  const toProduce = plan.production.filter((p) => p.suggestedQuantity > 0);
  const toBuy = plan.materials.filter((m) => m.suggestedPurchase > 0);
  const purchaseCost = toBuy.reduce((s, m) => s + m.estimatedCost, 0);
  const chartData = plan.cash.weeks.map((w) => ({ label: formatDate(w.weekStart, { day: "2-digit", month: "short" }), closing: Math.round(w.closing) }));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Plan de producción, compras y caja"
        description={`Basado en tu demanda promedio de las últimas ${plan.lookbackWeeks} semanas, tu inventario, las órdenes abiertas, los pedidos de distribuidores y tus cuentas por cobrar y pagar.`}
        actions={
          <NativeSelect className="w-48" aria-label="Horizonte" value={horizon} onValueChange={setHorizon} options={[
            { value: "2", label: "Próximas 2 semanas" },
            { value: "4", label: "Próximas 4 semanas" },
            { value: "8", label: "Próximas 8 semanas" },
            { value: "12", label: "Próximas 12 semanas" },
          ]} />
        }
      />

      {plan.opening === null && (
        <Callout tone="warning" title="Configura tu saldo inicial de caja" action={<Link href="/app/configuracion" className="text-sm font-medium text-brand hover:underline">Configurar</Link>}>
          Sin un saldo de partida, la proyección empieza en cero y solo muestra flujos, no tu caja real.
        </Callout>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Caja hoy" value={plan.opening === null ? "Sin configurar" : formatMoney(plan.opening, currency)} />
        <StatCard label="Producción sugerida" value={`${toProduce.length} producto${toProduce.length === 1 ? "" : "s"}`} hint={toProduce.length ? `${formatNumber(toProduce.reduce((s, p) => s + p.batches, 0))} lotes` : "Inventario suficiente"} tone={toProduce.some((p) => p.status === "urgent") ? "negative" : "neutral"} />
        <StatCard label="Compras sugeridas" value={formatMoney(purchaseCost, currency)} hint={`${toBuy.length} materia${toBuy.length === 1 ? "" : "s"} prima${toBuy.length === 1 ? "" : "s"}`} tone={toBuy.some((m) => m.status === "late") ? "negative" : "neutral"} />
        <StatCard
          label="Caja mínima (13 semanas)"
          value={formatMoney(plan.cash.minBalance, currency, { decimals: 0 })}
          tone={plan.cash.minBalance < 0 ? "negative" : "positive"}
          hint={plan.cash.minBalanceWeek ? `semana del ${formatDate(plan.cash.minBalanceWeek)}` : undefined}
        />
      </div>

      {plan.cash.firstNegativeWeek && (
        <Callout tone="danger" title={`Tu caja quedaría en negativo la semana del ${formatDate(plan.cash.firstNegativeWeek)}`}>
          Opciones: acelera cobros vencidos ({formatMoney(plan.cash.overdueReceivables, currency)}), negocia plazo con proveedores, escalona las compras sugeridas o produce menos de los productos con más cobertura.
        </Callout>
      )}

      <Section title="Qué producir" description="Unidades para cubrir la demanda del horizonte, los pedidos pendientes y el stock de seguridad, en lotes completos.">
        <RowsTable
          rows={plan.production}
          rowKey={(p) => p.productId}
          empty="No hay productos con receta."
          columns={[
            { key: "p", header: "Producto", cell: (p) => <span className="font-medium">{p.productName}</span> },
            { key: "d", header: "Demanda/semana", align: "right", sortValue: (p) => p.weeklyDemand, cell: (p) => formatNumber(p.weeklyDemand, 1) },
            { key: "h", header: "Existencia", align: "right", cell: (p) => formatNumber(p.onHand) },
            { key: "o", header: "En producción", align: "right", cell: (p) => (p.plannedProduction ? formatNumber(p.plannedProduction) : "—") },
            { key: "c", header: "Pedidos pendientes", align: "right", cell: (p) => (p.committedUnits ? formatNumber(p.committedUnits) : "—") },
            { key: "w", header: "Cobertura", align: "right", cell: (p) => (p.weeksOfCover === null ? "Sin demanda" : `${formatNumber(p.weeksOfCover, 1)} sem.`) },
            { key: "s", header: "Producir", align: "right", sortValue: (p) => p.suggestedQuantity, cell: (p) => (p.suggestedQuantity > 0 ? <span className="font-medium">{formatNumber(p.suggestedQuantity)} <span className="text-xs text-muted-foreground">({p.batches} lote{p.batches > 1 ? "s" : ""})</span></span> : "—") },
            { key: "by", header: "Antes del", cell: (p) => (p.produceBy ? formatDate(p.produceBy) : "—") },
            { key: "st", header: "", cell: (p) => (p.suggestedQuantity > 0 ? <Badge tone={statusTone[p.status]}>{es.planStatus[p.status]}</Badge> : <Badge tone="success">Cubierto</Badge>) },
            { key: "a", header: "", align: "right", cell: (p) => canEdit && p.suggestedQuantity > 0 && <Button size="sm" variant="outline" onClick={() => createOrder(p.productId, p.suggestedQuantity, p.produceBy ?? asOf)}>Crear orden</Button> },
          ]}
        />
      </Section>

      <Section title="Qué comprar y cuándo" description="Materias primas para lo sugerido y las órdenes abiertas, más el punto de reorden. La fecha considera el tiempo de entrega.">
        <RowsTable
          rows={plan.materials}
          rowKey={(m) => m.materialId}
          empty="No necesitas comprar materias primas para este plan."
          columns={[
            { key: "m", header: "Materia prima", cell: (m) => <span className="font-medium">{m.materialName}</span> },
            { key: "r", header: "Necesitas", align: "right", cell: (m) => `${formatNumber(m.required)} ${m.unit}` },
            { key: "h", header: "Tienes", align: "right", cell: (m) => `${formatNumber(m.onHand)} ${m.unit}` },
            { key: "b", header: "Comprar", align: "right", sortValue: (m) => m.suggestedPurchase, cell: (m) => (m.suggestedPurchase > 0 ? <span className="font-medium">{formatNumber(m.suggestedPurchase)} {m.unit}</span> : "—") },
            { key: "c", header: "Costo estimado", align: "right", sortValue: (m) => m.estimatedCost, cell: (m) => (m.estimatedCost > 0 ? formatMoney(m.estimatedCost, currency) : "—") },
            { key: "o", header: "Pedir antes del", cell: (m) => (m.orderBy ? `${formatDate(m.orderBy)} (${m.leadTimeDays} d)` : "—") },
            { key: "s", header: "", cell: (m) => (m.suggestedPurchase > 0 ? <Badge tone={statusTone[m.status]}>{es.purchaseStatus[m.status]}</Badge> : <Badge tone="success">Cubierto</Badge>) },
          ]}
        />
      </Section>

      <Section title="Caja de las próximas 13 semanas" description="Cobros por vencimiento, ventas esperadas según el plazo de cobro de cada canal, pagos a proveedores, compras sugeridas y gastos recurrentes.">
        <div className="h-56 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} width={70} tickFormatter={(v: number) => formatMoney(v, currency, { decimals: 0 })} />
              <Tooltip
                cursor={{ fill: "var(--muted)", opacity: 0.4 }}
                contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
                formatter={(v) => [formatMoney(Number(v), currency, { decimals: 0 }), "Caja al cierre"]}
              />
              <ReferenceLine y={0} stroke="var(--muted-foreground)" />
              <Bar dataKey="closing" radius={[4, 4, 0, 0]}>
                {chartData.map((d) => <Cell key={d.label} fill={d.closing < 0 ? "oklch(0.704 0.191 22.216)" : "var(--brand)"} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-4">
          <RowsTable
            dense
            rows={plan.cash.weeks}
            rowKey={(w) => w.weekStart}
            columns={[
              { key: "w", header: "Semana", cell: (w) => `${formatDate(w.weekStart, { day: "2-digit", month: "short" })} – ${formatDate(w.weekEnd, { day: "2-digit", month: "short" })}` },
              { key: "r", header: "Cobros", align: "right", cell: (w) => formatMoney(w.receivables, currency, { decimals: 0 }) },
              { key: "f", header: "Ventas esperadas", align: "right", cell: (w) => formatMoney(w.forecastSales, currency, { decimals: 0 }) },
              { key: "p", header: "Proveedores", align: "right", cell: (w) => formatMoney(-w.payables, currency, { decimals: 0 }) },
              { key: "c", header: "Compras sugeridas", align: "right", cell: (w) => formatMoney(-w.plannedPurchases, currency, { decimals: 0 }) },
              { key: "e", header: "Gastos", align: "right", cell: (w) => formatMoney(-w.expenses, currency, { decimals: 0 }) },
              { key: "b", header: "Caja al cierre", align: "right", cell: (w) => <span className={w.closing < 0 ? "font-medium text-red-400" : "font-medium"}>{formatMoney(w.closing, currency, { decimals: 0 })}</span> },
            ]}
          />
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Las facturas vencidas ({formatMoney(plan.cash.overdueReceivables, currency)}) y los pagos atrasados ({formatMoney(plan.cash.overduePayables, currency)}) se cuentan en la primera semana. Las ventas esperadas usan tu promedio reciente por canal; no son una predicción estadística.
        </p>
      </Section>
    </div>
  );
}
