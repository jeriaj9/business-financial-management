'use client';

import { useMemo } from "react";
import Link from "next/link";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AlertTriangle, ArrowRight, CheckCircle2, Circle } from "lucide-react";
import { friendlyError } from "@/lib/errors";
import { formatMoney, formatMonth, formatPercent } from "@/lib/format";
import { addDays, addMonths, dayNumber, diffDays, startOfMonth, today } from "@/lib/domain/dates";
import { analyzeProfitability, costLines } from "@/lib/domain/profitability";
import { analyzeCostImpact } from "@/lib/domain/costImpact";
import { forecastWeeklyDemand, planMaterials, planProduction } from "@/lib/domain/planning";
import { useDataset } from "@/lib/data/dataset";
import { useDistributorOrders, useOpenReceivables, usePortalUsers, useProductionOrders, useSuppliers } from "@/lib/data/hooks";
import { useAuth } from "@/components/auth/AuthProvider";
import { Amount, ErrorState, LoadingState, PageHeader, Section, StatCard } from "@/components/ui/page";
import { cn } from "@/lib/utils";

/* eslint-disable @typescript-eslint/no-explicit-any */
interface Alert {
  key: string;
  tone: "danger" | "warning" | "info";
  title: string;
  detail: string;
  href: string;
  cta: string;
}

export default function SummaryPage() {
  const { profile } = useAuth();
  const asOf = today();
  const sixMonthsAgo = startOfMonth(addMonths(asOf, -5));
  const data = useDataset({ salesFrom: sixMonthsAgo, salesTo: asOf, withHistory: true });
  const receivables = useOpenReceivables(data.companyId);
  const productionOrders = useProductionOrders(data.companyId);
  const distributorOrders = useDistributorOrders(data.companyId);
  const suppliers = useSuppliers(data.companyId);
  const portalUsers = usePortalUsers(data.companyId);
  const currency = data.currency;

  const view = useMemo(() => {
    if (data.isLoading || !data.costSettings || !data.settings) return null;
    const monthStart = startOfMonth(asOf);
    const prevStart = startOfMonth(addMonths(asOf, -1));
    const prevEnd = addDays(prevStart, diffDays(asOf, monthStart));
    const inRange = (from: string, to: string) => data.sales.filter((s) => dayNumber(s.issueDate) >= dayNumber(from) && dayNumber(s.issueDate) <= dayNumber(to));
    const sum = (lines: ReturnType<typeof costLines>) => ({
      revenue: lines.reduce((s, l) => s + l.revenue, 0),
      contribution: lines.reduce((s, l) => s + l.contribution, 0),
    });
    const month = sum(costLines(inRange(monthStart, asOf), data.channels));
    const prev = sum(costLines(inRange(prevStart, prevEnd), data.channels));
    const monthExpenses = data.expenses.filter((e) => dayNumber(e.date) >= dayNumber(monthStart)).reduce((s, e) => s + e.amount, 0);

    // Six-month trend
    const trend = Array.from({ length: 6 }, (_, i) => {
      const start = startOfMonth(addMonths(asOf, i - 5));
      const end = i === 5 ? asOf : addDays(startOfMonth(addMonths(start, 1)), -1);
      const t = sum(costLines(inRange(start, end), data.channels));
      const expenses = data.expenses.filter((e) => dayNumber(e.date) >= dayNumber(start) && dayNumber(e.date) <= dayNumber(end)).reduce((s, e) => s + e.amount, 0);
      return { label: formatMonth(start).split(" ")[0].slice(0, 3), ventas: Math.round(t.revenue), contribucion: Math.round(t.contribution), gastos: Math.round(expenses) };
    });

    const profit90 = analyzeProfitability(inRange(addDays(asOf, -89), asOf), data.channels, { channel: data.channelName });
    const costImpact = analyzeCostImpact({
      asOf,
      materials: data.materials,
      products: data.products,
      costHistory: data.costHistory,
      priceHistory: data.priceHistory,
      sales: data.sales,
      settings: data.costSettings,
    });
    const plannedOrders = (productionOrders.data ?? []).filter((o: any) => o.status === "planned").map((o: any) => ({ productId: o.product_id, quantity: Number(o.planned_quantity), plannedDate: o.planned_date }));
    const production = planProduction({
      asOf,
      products: data.products,
      weeklyDemand: forecastWeeklyDemand(data.sales, asOf, Math.max(1, data.settings.demandLookbackWeeks)),
      horizonWeeks: 4,
      safetyWeeks: data.settings.safetyStockWeeks,
      plannedOrders,
      committedUnits: new Map(),
    });
    const materialsPlan = planMaterials({
      asOf,
      products: data.products,
      materials: data.materials,
      productionNeeds: production,
      plannedOrders,
      supplierLeadTime: new Map((suppliers.data ?? []).map((s: any) => [s.id, Number(s.lead_time_days)])),
      defaultLeadTimeDays: data.settings.defaultLeadTimeDays,
    });

    const overdue = (receivables.data ?? []).filter((r: any) => r.due_date < asOf).reduce((s: number, r: any) => s + Number(r.balance), 0);
    const totalReceivable = (receivables.data ?? []).reduce((s: number, r: any) => s + Number(r.balance), 0);
    const pendingOrders = (distributorOrders.data ?? []).filter((o: any) => o.status === "submitted");

    const alerts: Alert[] = [];
    const review = costImpact.repricing.filter((r) => r.needsReview);
    if (review.length) alerts.push({ key: "price", tone: "warning", title: `${review.length} producto${review.length > 1 ? "s" : ""} con margen erosionado por costos`, detail: `${review.slice(0, 3).map((r) => r.productName).join(", ")}. Pierdes ${formatMoney(review.reduce((s, r) => s + r.monthlyGap, 0), currency, { decimals: 0 })} al mes.`, href: "/app/costos", cta: "Revisar precios" });
    const losers = profit90.lossMakers.slice(0, 3);
    if (losers.length) alerts.push({ key: "loss", tone: "danger", title: "Ventas que pierden dinero (últimos 90 días)", detail: losers.map((l) => `${l.label} (${formatMoney(l.contribution, currency, { decimals: 0 })})`).join(", "), href: "/app/rentabilidad", cta: "Ver rentabilidad" });
    if (pendingOrders.length) alerts.push({ key: "orders", tone: "info", title: `${pendingOrders.length} pedido${pendingOrders.length > 1 ? "s" : ""} de distribuidores por revisar`, detail: `Por ${formatMoney(pendingOrders.reduce((s: number, o: any) => s + Number(o.total), 0), currency)}.`, href: "/app/pedidos", cta: "Revisar pedidos" });
    const urgent = production.filter((p) => p.status === "urgent");
    if (urgent.length) alerts.push({ key: "prod", tone: "danger", title: "Producción urgente", detail: `${urgent.map((p) => p.productName).join(", ")} se queda${urgent.length > 1 ? "n" : ""} sin existencia en menos de una semana.`, href: "/app/planificacion", cta: "Ver plan" });
    const late = materialsPlan.filter((m) => m.status === "late");
    if (late.length) alerts.push({ key: "buy", tone: "warning", title: "Compras atrasadas", detail: `${late.map((m) => m.materialName).join(", ")}: ya deberías haberlas pedido según el tiempo de entrega.`, href: "/app/planificacion", cta: "Ver compras" });
    if (overdue > 0) alerts.push({ key: "ar", tone: "warning", title: `${formatMoney(overdue, currency, { decimals: 0 })} en facturas vencidas`, detail: "Cobrar lo vencido es la forma más rápida de mejorar tu caja.", href: "/app/ventas", cta: "Ver por cobrar" });
    const unconfigured = data.channels.filter((c) => c.isActive && c.commissionPct + c.paymentFeePct + c.costPerOrder + c.costPerUnit === 0);
    if (unconfigured.length && data.sales.length) alerts.push({ key: "channels", tone: "info", title: "Canales sin costos de venta", detail: `${unconfigured.map((c) => c.name).join(", ")}: sin sus costos, el margen por canal se ve mejor de lo que es.`, href: "/app/configuracion", cta: "Configurar" });

    const checklist = [
      { label: "Registra tus materias primas", done: data.materials.length > 0, href: "/app/materiales" },
      { label: "Crea un producto con su receta y precio", done: data.products.some((p) => p.recipe.length > 0 && p.retailPrice > 0), href: "/app/productos" },
      { label: "Configura los costos de tus canales de venta", done: unconfigured.length < data.channels.filter((c) => c.isActive).length, href: "/app/configuracion" },
      { label: "Indica tu saldo inicial de caja", done: !!data.settings.openingCashDate, href: "/app/configuracion" },
      { label: "Registra tu primera venta", done: data.sales.length > 0, href: "/app/ventas" },
      { label: "Invita a un distribuidor al portal", done: (portalUsers.data ?? []).length > 0, href: "/app/distribuidores" },
    ];

    return { month, prev, monthExpenses, trend, profit90, alerts, checklist, overdue, totalReceivable };
  }, [data, asOf, productionOrders.data, distributorOrders.data, receivables.data, suppliers.data, portalUsers.data, currency]);

  if (data.isLoading || !view) return <LoadingState label="Preparando tu resumen…" />;
  if (data.error) return <ErrorState message={friendlyError(data.error)} onRetry={data.reload} />;

  const growth = view.prev.revenue > 0 ? (view.month.revenue - view.prev.revenue) / view.prev.revenue : null;
  const pendingSetup = view.checklist.filter((c) => !c.done);
  const firstName = profile?.full_name?.split(" ")[0];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={firstName ? `Hola, ${firstName}` : "Resumen"} description={`${data.companyName} · ${formatMonth(asOf)} al día ${Number(asOf.slice(8, 10))}`} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Ventas del mes" value={formatMoney(view.month.revenue, currency, { decimals: 0 })} hint={growth === null ? "Sin datos del mes anterior" : `${formatPercent(growth, 0, { signed: true })} vs. mismos días del mes anterior`} tone="brand" />
        <StatCard label="Contribución del mes" value={formatMoney(view.month.contribution, currency, { decimals: 0 })} hint={view.month.revenue > 0 ? `Margen ${formatPercent(view.month.contribution / view.month.revenue)}` : undefined} tone={view.month.contribution >= 0 ? "positive" : "negative"} />
        <StatCard label="Resultado operativo" value={formatMoney(view.month.contribution - view.monthExpenses, currency, { decimals: 0 })} hint={`Gastos del mes: ${formatMoney(view.monthExpenses, currency, { decimals: 0 })}`} tone={view.month.contribution - view.monthExpenses >= 0 ? "positive" : "negative"} />
        <StatCard label="Por cobrar" value={formatMoney(view.totalReceivable, currency, { decimals: 0 })} hint={view.overdue > 0 ? `${formatMoney(view.overdue, currency, { decimals: 0 })} vencido` : "Todo al día"} tone={view.overdue > 0 ? "warning" : "neutral"} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
        <Section title="Necesita tu atención">
          {view.alerts.length === 0 ? (
            <div className="flex items-center gap-3 py-6 text-sm text-muted-foreground"><CheckCircle2 className="h-5 w-5 text-emerald-400" /> Nada urgente. Tus precios, inventario y cobros están en orden.</div>
          ) : (
            <ul className="grid gap-2">
              {view.alerts.map((a) => (
                <li key={a.key} className={cn("flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between", a.tone === "danger" ? "border-red-500/30" : a.tone === "warning" ? "border-amber-500/30" : "")}>
                  <div className="flex gap-3">
                    <AlertTriangle className={cn("mt-0.5 h-4 w-4 shrink-0", a.tone === "danger" ? "text-red-400" : a.tone === "warning" ? "text-amber-400" : "text-sky-400")} />
                    <div>
                      <p className="text-sm font-medium">{a.title}</p>
                      <p className="text-xs text-muted-foreground">{a.detail}</p>
                    </div>
                  </div>
                  <Link href={a.href} className="flex shrink-0 items-center gap-1 text-sm font-medium text-brand hover:underline">{a.cta} <ArrowRight className="h-3.5 w-3.5" /></Link>
                </li>
              ))}
            </ul>
          )}
        </Section>

        {pendingSetup.length > 0 ? (
          <Section title="Pon a punto tu negocio" description={`${view.checklist.length - pendingSetup.length} de ${view.checklist.length} pasos listos`}>
            <ul className="grid gap-2 text-sm">
              {view.checklist.map((c) => (
                <li key={c.label}>
                  <Link href={c.href} className="flex items-center gap-2 rounded-md px-1 py-1 hover:bg-muted">
                    {c.done ? <CheckCircle2 className="h-4 w-4 text-emerald-400" /> : <Circle className="h-4 w-4 text-muted-foreground" />}
                    <span className={c.done ? "text-muted-foreground line-through" : undefined}>{c.label}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </Section>
        ) : (
          <Section title="Productos que más aportan (90 días)">
            <ul className="grid gap-2 text-sm">
              {view.profit90.byProduct.slice(0, 5).map((p) => (
                <li key={p.key} className="flex items-center justify-between gap-2">
                  <span className="truncate">{p.label}</span>
                  <span className="tabular-nums"><Amount value={p.contribution}>{formatMoney(p.contribution, currency, { decimals: 0 })}</Amount> <span className="text-xs text-muted-foreground">{formatPercent(p.margin, 0)}</span></span>
                </li>
              ))}
            </ul>
          </Section>
        )}
      </div>

      <Section title="Últimos 6 meses" description="Ventas, contribución (después de costo de producto y de canal) y gastos de operación.">
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={view.trend} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 12, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} width={70} tickFormatter={(v: number) => formatMoney(v, currency, { decimals: 0 })} />
              <Tooltip cursor={{ fill: "var(--muted)", opacity: 0.4 }} contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }} formatter={(v, name) => [formatMoney(Number(v), currency, { decimals: 0 }), String(name)]} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="ventas" name="Ventas" fill="var(--muted-foreground)" radius={[4, 4, 0, 0]} />
              <Bar dataKey="contribucion" name="Contribución" fill="var(--brand)" radius={[4, 4, 0, 0]} />
              <Bar dataKey="gastos" name="Gastos" fill="oklch(0.704 0.191 22.216)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Section>
    </div>
  );
}
