'use client';

import { useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { friendlyError } from "@/lib/errors";
import { formatDate, formatMoney, formatNumber, formatPercent, parseInput } from "@/lib/format";
import { addDays, today } from "@/lib/domain/dates";
import { agingBuckets, paymentStatus } from "@/lib/domain/receivables";
import { resolveDistributorPrice } from "@/lib/domain/costing";
import { costLines } from "@/lib/domain/profitability";
import { invalidate, rpc, useChannels, useCompany, useCustomers, useDistributors, useInvoices, useOpenReceivables, useProducts } from "@/lib/data/hooks";
import { PaymentDialog, paymentMethods, type PaymentTarget } from "@/components/app/PaymentDialog";
import { PeriodPicker, periodFor, type Period } from "@/components/app/PeriodPicker";
import { RowsTable } from "@/components/app/RowsTable";
import { AppDialog } from "@/components/ui/app-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectField } from "@/components/ui/native-select";
import { Amount, Callout, ErrorState, LoadingState, PageHeader, StatCard } from "@/components/ui/page";
import { SwitchField } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TextareaField } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toaster";
import { es } from "@/i18n/es";

/* eslint-disable @typescript-eslint/no-explicit-any */
interface LineDraft {
  key: string;
  productId: string;
  quantity: string;
  unitPrice: string;
  discount: string; // percent
  priceTouched: boolean;
}

const statusTone = { paid: "success", partial: "info", pending: "neutral", overdue: "danger", void: "neutral" } as const;

export default function SalesPage() {
  const { companyId, canEdit, currency, settings } = useCompany();
  const [period, setPeriod] = useState<Period>(periodFor("this_month"));
  const invoices = useInvoices(companyId, period.from, period.to);
  const receivables = useOpenReceivables(companyId);
  const products = useProducts(companyId);
  const channels = useChannels(companyId);
  const customers = useCustomers(companyId);
  const distributors = useDistributors(companyId);
  const toast = useToast();

  const [channelFilter, setChannelFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [detail, setDetail] = useState<any | null>(null);
  const [paying, setPaying] = useState<PaymentTarget | null>(null);

  // Invoice form
  const [formOpen, setFormOpen] = useState(false);
  const [replacing, setReplacing] = useState<any | null>(null);
  const [channelId, setChannelId] = useState("");
  const [distributorId, setDistributorId] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [issueDate, setIssueDate] = useState(today());
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<LineDraft[]>([]);
  const [paidNow, setPaidNow] = useState(true);
  const [method, setMethod] = useState("Efectivo");
  const [saving, setSaving] = useState(false);

  const productById = useMemo(() => new Map((products.data ?? []).map((p) => [p.id, p])), [products.data]);
  const channel = channels.data?.find((c) => c.id === channelId);
  const distributor = distributors.data?.find((d) => d.id === distributorId);
  const isDistributorSale = channel?.kind === "distributor" || channel?.priceBasis === "distributor";

  const listPrice = (productId: string) => {
    const p = productById.get(productId);
    if (!p) return 0;
    if (isDistributorSale || distributor) {
      return resolveDistributorPrice(p.retailPrice, p.distributorPrice, distributor?.marginOverride ?? null, settings?.distributorMargin ?? 0);
    }
    return p.retailPrice;
  };

  // Re-price untouched lines when channel or distributor changes
  const repriced = lines.map((l) => (l.priceTouched || !l.productId ? l : { ...l, unitPrice: String(listPrice(l.productId)) }));

  // Cheap to compute; recalculated on every edit of the form
  const preview = (() => {
    const priced = repriced
      .filter((l) => l.productId && (parseInput(l.quantity) ?? 0) > 0)
      .map((l) => {
        const p = productById.get(l.productId)!;
        const qty = parseInput(l.quantity) ?? 0;
        const price = parseInput(l.unitPrice) ?? 0;
        const discount = (parseInput(l.discount) ?? 0) / 100;
        const revenue = Math.round(qty * price * (1 - discount) * 100) / 100;
        const unitCost = p.avgUnitCost ?? p.variableUnitCost;
        return { line: l, product: p, qty, price, discount, revenue, cogs: unitCost * qty };
      });
    const costed = channel
      ? costLines(
          priced.map((x) => ({
            invoiceId: "new", invoiceNumber: "", issueDate, channelId: channel.id, counterpartyKey: "x", counterpartyLabel: "",
            productId: x.product.id, productLabel: x.product.name, quantity: x.qty, listPrice: x.price, unitPrice: x.price, revenue: x.revenue, cogs: x.cogs,
          })),
          [channel]
        )
      : [];
    const subtotal = priced.reduce((s, x) => s + x.qty * x.price, 0);
    const total = priced.reduce((s, x) => s + x.revenue, 0);
    const cogs = priced.reduce((s, x) => s + x.cogs, 0);
    const channelCost = costed.reduce((s, x) => s + x.channelCost, 0);
    return { priced, subtotal, total, cogs, channelCost, contribution: total - cogs - channelCost };
  })();

  const terms = distributor?.paymentTermsDays ?? channel?.paymentTermsDays ?? 0;

  const openForm = (source: any | null) => {
    const defaultChannel = channels.data?.find((c) => c.isActive && c.kind === "direct") ?? channels.data?.find((c) => c.isActive);
    setReplacing(source);
    setChannelId(source?.channel_id ?? defaultChannel?.id ?? "");
    setDistributorId(source?.distributor_id ?? "");
    setCustomerId(source?.customer_id ?? "");
    setCustomerName(source && !source.customer_id && !source.distributor_id ? source.customer_name ?? "" : "");
    setIssueDate(source?.issue_date ?? today());
    setNotes(source?.notes ?? "");
    setLines(
      source
        ? source.invoice_lines
            .filter((l: any) => l.product_id)
            .map((l: any, i: number) => ({ key: `l${i}`, productId: l.product_id, quantity: String(l.quantity), unitPrice: String(l.unit_price), discount: String(Number(l.discount_pct) * 100), priceTouched: true }))
        : [{ key: "l0", productId: "", quantity: "1", unitPrice: "", discount: "0", priceTouched: false }]
    );
    setPaidNow(!source);
    setFormOpen(true);
  };

  const submit = async () => {
    if (!channel) return toast.error("Selecciona el canal de venta.");
    if (preview.priced.length === 0) return toast.error("Agrega al menos un producto con cantidad.");
    if (channel.kind === "distributor" && !distributorId) return toast.error("Selecciona el distribuidor.");
    const payload = {
      issue_date: issueDate,
      channel_id: channelId,
      distributor_id: distributorId || null,
      customer_id: !distributorId && customerId ? customerId : null,
      customer_name: !distributorId && !customerId ? customerName.trim() || "Consumidor final" : null,
      notes,
      lines: preview.priced.map((x) => ({ product_id: x.product.id, quantity: x.qty, unit_price: x.price, discount_pct: x.discount })),
      payment: paidNow ? { amount: preview.total, method, payment_date: issueDate } : null,
    };
    setSaving(true);
    try {
      if (replacing) {
        await rpc("replace_invoice", { p_invoice_id: replacing.id, p_data: payload });
        toast.success("Factura corregida", `La factura ${replacing.number} quedó anulada y se emitió una nueva.`);
      } else {
        await rpc("create_invoice", { p_data: payload });
        toast.success("Factura registrada");
      }
      setFormOpen(false);
      setDetail(null);
      void invalidate("invoices", "invoice_lines", "receivables", "products", "inventory_transactions", "payments");
    } catch (err) {
      toast.error("No se pudo guardar la factura", friendlyError(err));
    } finally {
      setSaving(false);
    }
  };

  const voidInvoice = async (inv: any) => {
    const reason = window.prompt(`Motivo para anular ${inv.number}:`);
    if (reason === null) return;
    try {
      await rpc("void_invoice", { p_invoice_id: inv.id, p_reason: reason });
      toast.success("Factura anulada", "La existencia de los productos fue devuelta al inventario.");
      setDetail(null);
      void invalidate("invoices", "invoice_lines", "receivables", "products", "inventory_transactions", "payments");
    } catch (err) {
      toast.error("No se pudo anular", friendlyError(err));
    }
  };

  const voidPayment = async (paymentId: string) => {
    if (!window.confirm("¿Anular este cobro?")) return;
    try {
      await rpc("void_payment", { p_payment_id: paymentId });
      toast.success("Cobro anulado");
      setDetail(null);
      void invalidate("invoices", "receivables", "payments");
    } catch (err) {
      toast.error("No se pudo anular el cobro", friendlyError(err));
    }
  };

  if (invoices.isLoading || products.isLoading || channels.isLoading) return <LoadingState />;
  if (invoices.error) return <ErrorState message={friendlyError(invoices.error)} onRetry={() => invoices.mutate()} />;

  const asOf = today();
  const rows = (invoices.data ?? [])
    .map((inv: any) => ({
      ...inv,
      status_label: paymentStatus({ status: inv.status, total: Number(inv.total), amountPaid: Number(inv.amount_paid), dueDate: inv.due_date }, asOf),
      counterparty: inv.distributors?.name ?? inv.customers?.name ?? inv.customer_name ?? "Consumidor final",
    }))
    .filter((inv: any) => (!channelFilter || inv.channel_id === channelFilter) && (!statusFilter || inv.status_label === statusFilter));
  const issued = rows.filter((r: any) => r.status === "issued");
  const totalSales = issued.reduce((s: number, r: any) => s + Number(r.total), 0);
  const totalCogs = issued.reduce((s: number, r: any) => s + Number(r.cogs_total), 0);
  const aging = agingBuckets((receivables.data ?? []).map((r: any) => ({ dueDate: r.due_date, balance: Number(r.balance) })), asOf);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Ventas y cobros"
        description="Factura con el precio que corresponde a cada canal y ve el margen real antes de emitir. Las correcciones anulan y reemplazan la factura sin perder el historial."
        actions={canEdit && <Button onClick={() => openForm(null)}><Plus className="h-4 w-4" /> Nueva factura</Button>}
      />

      <Tabs defaultValue="facturas">
        <TabsList>
          <TabsTrigger value="facturas">Facturas</TabsTrigger>
          <TabsTrigger value="cobrar">Por cobrar ({(receivables.data ?? []).length})</TabsTrigger>
        </TabsList>

        <TabsContent value="facturas" className="mt-4 grid gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <PeriodPicker value={period} onChange={setPeriod} />
            <NativeSelect className="w-48" aria-label="Canal" placeholder="Todos los canales" value={channelFilter} onValueChange={setChannelFilter} options={[{ value: "", label: "Todos los canales" }, ...(channels.data ?? []).map((c) => ({ value: c.id, label: c.name }))]} />
            <NativeSelect className="w-40" aria-label="Estado" value={statusFilter} onValueChange={setStatusFilter} options={[{ value: "", label: "Todos los estados" }, ...Object.entries(es.paymentStatus).map(([value, label]) => ({ value, label }))]} />
          </div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatCard label="Ventas netas" value={formatMoney(totalSales, currency)} hint={`${issued.length} facturas`} />
            <StatCard label="Costo de lo vendido" value={formatMoney(totalCogs, currency)} />
            <StatCard label="Margen bruto" value={formatMoney(totalSales - totalCogs, currency)} hint={formatPercent(totalSales > 0 ? (totalSales - totalCogs) / totalSales : 0)} tone="positive" />
            <StatCard label="Pendiente de cobro" value={formatMoney(issued.reduce((s: number, r: any) => s + Number(r.balance), 0), currency)} />
          </div>
          <RowsTable
            rows={rows}
            rowKey={(r: any) => r.id}
            onRowClick={setDetail}
            rowClassName={(r: any) => (r.status === "void" ? "opacity-50" : undefined)}
            empty="No hay facturas en este período."
            columns={[
              { key: "number", header: "Factura", cell: (r: any) => <span className="font-medium">{r.number}</span> },
              { key: "date", header: "Fecha", sortValue: (r: any) => r.issue_date, cell: (r: any) => formatDate(r.issue_date) },
              { key: "who", header: "Cliente", sortValue: (r: any) => r.counterparty, cell: (r: any) => r.counterparty },
              { key: "channel", header: "Canal", cell: (r: any) => <span className="text-muted-foreground">{r.sales_channels?.name}</span> },
              { key: "total", header: "Total", align: "right", sortValue: (r: any) => Number(r.total), cell: (r: any) => formatMoney(Number(r.total), currency) },
              { key: "margin", header: "Margen bruto", align: "right", cell: (r: any) => {
                const gp = Number(r.total) - Number(r.cogs_total);
                return r.status === "void" ? "—" : <Amount value={gp}>{formatPercent(Number(r.total) > 0 ? gp / Number(r.total) : 0)}</Amount>;
              } },
              { key: "status", header: "Estado", cell: (r: any) => <Badge tone={statusTone[r.status_label as keyof typeof statusTone]}>{es.paymentStatus[r.status_label as keyof typeof es.paymentStatus]}</Badge> },
            ]}
          />
        </TabsContent>

        <TabsContent value="cobrar" className="mt-4 grid gap-4">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            <StatCard label="Total por cobrar" value={formatMoney(aging.total, currency)} />
            <StatCard label="Al día" value={formatMoney(aging.current, currency)} />
            <StatCard label="1-30 días" value={formatMoney(aging.days1to30, currency)} tone={aging.days1to30 > 0 ? "warning" : "neutral"} />
            <StatCard label="31-60 días" value={formatMoney(aging.days31to60, currency)} tone={aging.days31to60 > 0 ? "negative" : "neutral"} />
            <StatCard label="+60 días" value={formatMoney(aging.days61to90 + aging.over90, currency)} tone={aging.days61to90 + aging.over90 > 0 ? "negative" : "neutral"} />
          </div>
          <RowsTable
            rows={receivables.data ?? []}
            rowKey={(r: any) => r.id}
            empty="No tienes cuentas por cobrar."
            initialSort={{ key: "due", dir: "asc" }}
            columns={[
              { key: "number", header: "Factura", cell: (r: any) => <span className="font-medium">{r.number}</span> },
              { key: "who", header: "Cliente", cell: (r: any) => r.distributors?.name ?? r.customers?.name ?? r.customer_name ?? "Consumidor final" },
              { key: "due", header: "Vence", sortValue: (r: any) => r.due_date, cell: (r: any) => <span className={r.due_date < asOf ? "text-red-400" : undefined}>{formatDate(r.due_date)}</span> },
              { key: "total", header: "Total", align: "right", cell: (r: any) => formatMoney(Number(r.total), currency) },
              { key: "balance", header: "Saldo", align: "right", sortValue: (r: any) => Number(r.balance), cell: (r: any) => formatMoney(Number(r.balance), currency) },
              { key: "pay", header: "", align: "right", cell: (r: any) => canEdit && (
                <Button size="sm" variant="outline" onClick={() => setPaying({ kind: "invoice", id: r.id, number: r.number, balance: Number(r.balance), counterparty: r.distributors?.name ?? r.customers?.name ?? r.customer_name ?? "Cliente" })}>Registrar cobro</Button>
              ) },
            ]}
          />
        </TabsContent>
      </Tabs>

      {/* Invoice form */}
      <AppDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        title={replacing ? `Corregir factura ${replacing.number}` : "Nueva factura"}
        description={replacing ? "Al guardar, la factura original se anula (con su historial) y se emite una nueva con un número nuevo." : undefined}
        maxWidthClass="sm:max-w-4xl"
        footer={<><Button variant="outline" onClick={() => setFormOpen(false)}>Cancelar</Button><Button onClick={submit} disabled={saving}>{saving ? "Guardando…" : `${replacing ? "Guardar corrección" : "Emitir factura"} · ${formatMoney(preview.total, currency)}`}</Button></>}
      >
        <div className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <NativeSelectField label="Canal de venta" value={channelId} onValueChange={(v) => { setChannelId(v); setDistributorId(""); }} options={(channels.data ?? []).filter((c) => c.isActive || c.id === channelId).map((c) => ({ value: c.id, label: c.name }))} />
            {channel?.kind === "distributor" ? (
              <NativeSelectField label="Distribuidor" placeholder="Selecciona…" value={distributorId} onValueChange={setDistributorId} options={(distributors.data ?? []).filter((d) => d.isActive || d.id === distributorId).map((d) => ({ value: d.id, label: d.name }))} />
            ) : (
              <div className="grid gap-2">
                <NativeSelectField label="Cliente" value={customerId} onValueChange={setCustomerId} options={[{ value: "", label: "Consumidor final / otro" }, ...(customers.data ?? []).filter((c: any) => c.is_active).map((c: any) => ({ value: c.id, label: c.name }))]} />
                {!customerId && <Input aria-label="Nombre del cliente" placeholder="Nombre (opcional)" value={customerName} onChange={(e) => setCustomerName(e.target.value)} />}
              </div>
            )}
            <div className="grid gap-2">
              <FormField label="Fecha" type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} />
              <p className="text-xs text-muted-foreground">Vence: {terms > 0 ? `${formatDate(addDays(issueDate, terms))} (${terms} días)` : "al contado"}</p>
            </div>
          </div>

          {distributor && distributor.creditLimit !== null && (
            <CreditCheck distributorId={distributor.id} limit={distributor.creditLimit} orderTotal={preview.total} receivables={receivables.data ?? []} currency={currency} />
          )}

          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-muted/40 text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Producto</th>
                  <th className="px-3 py-2 text-right font-medium">Cantidad</th>
                  <th className="px-3 py-2 text-right font-medium">Precio</th>
                  <th className="px-3 py-2 text-right font-medium">Desc. %</th>
                  <th className="px-3 py-2 text-right font-medium">Total</th>
                  <th className="px-3 py-2 text-right font-medium">Margen</th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody>
                {repriced.map((l, idx) => {
                  const p = productById.get(l.productId);
                  const x = preview.priced.find((y) => y.line.key === l.key);
                  const lineMargin = x && x.revenue > 0 ? (x.revenue - x.cogs) / x.revenue : null;
                  const qty = parseInput(l.quantity) ?? 0;
                  const lowStock = p && !settings?.allowNegativeStock && qty > p.currentStock + (replacing?.invoice_lines.filter((il: any) => il.product_id === p.id).reduce((s: number, il: any) => s + Number(il.quantity), 0) ?? 0);
                  const update = (patch: Partial<LineDraft>) => setLines(repriced.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
                  return (
                    <tr key={l.key} className="border-t align-top">
                      <td className="px-3 py-1.5">
                        <NativeSelect
                          aria-label="Producto"
                          placeholder="Selecciona…"
                          value={l.productId}
                          onValueChange={(v) => update({ productId: v, unitPrice: String(listPrice(v)), priceTouched: false })}
                          options={(products.data ?? []).filter((x) => x.isActive || x.id === l.productId).map((x) => ({ value: x.id, label: `${x.name}${x.sku ? ` · ${x.sku}` : ""}` }))}
                        />
                        {p && <p className={`mt-1 text-xs ${lowStock ? "text-red-400" : "text-muted-foreground"}`}>Existencia: {formatNumber(p.currentStock)}{lowStock ? " — insuficiente" : ""}</p>}
                      </td>
                      <td className="px-3 py-1.5"><Input className="ml-auto w-20 text-right" inputMode="decimal" aria-label="Cantidad" value={l.quantity} onChange={(e) => update({ quantity: e.target.value })} /></td>
                      <td className="px-3 py-1.5">
                        <Input className="ml-auto w-28 text-right" inputMode="decimal" aria-label="Precio" value={l.unitPrice} onChange={(e) => update({ unitPrice: e.target.value, priceTouched: true })} />
                        {p && l.priceTouched && Math.abs((parseInput(l.unitPrice) ?? 0) - listPrice(p.id)) > 0.004 && (
                          <p className="mt-1 text-right text-xs text-muted-foreground">Lista: {formatMoney(listPrice(p.id), currency)}</p>
                        )}
                      </td>
                      <td className="px-3 py-1.5"><Input className="ml-auto w-16 text-right" inputMode="decimal" aria-label="Descuento" value={l.discount} onChange={(e) => update({ discount: e.target.value })} /></td>
                      <td className="px-3 py-1.5 pt-3 text-right tabular-nums">{formatMoney(x?.revenue ?? 0, currency)}</td>
                      <td className="px-3 py-1.5 pt-3 text-right">{lineMargin === null ? "—" : <Amount value={lineMargin}>{formatPercent(lineMargin)}</Amount>}</td>
                      <td className="px-1 py-1.5"><Button variant="ghost" size="icon-sm" aria-label="Quitar" onClick={() => setLines(repriced.filter((_, i) => i !== idx))}><Trash2 className="h-4 w-4 text-muted-foreground" /></Button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <Button variant="outline" size="sm" className="w-fit" onClick={() => setLines([...repriced, { key: `l${Date.now()}`, productId: "", quantity: "1", unitPrice: "", discount: "0", priceTouched: false }])}><Plus className="h-4 w-4" /> Agregar producto</Button>

          <div className="grid gap-4 md:grid-cols-[1fr_320px]">
            <div className="grid content-start gap-3">
              <TextareaField label="Notas" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
              <SwitchField checked={paidNow} onCheckedChange={setPaidNow} label="Cobrada en este momento" description="Si no, queda en cuentas por cobrar." />
              {paidNow && <NativeSelectField label="Método de cobro" value={method} onValueChange={setMethod} options={paymentMethods} />}
            </div>
            <dl className="grid content-start gap-1.5 rounded-lg border p-3 text-sm">
              <Row label="Subtotal" value={formatMoney(preview.subtotal, currency)} />
              <Row label="Descuentos" value={formatMoney(preview.total - preview.subtotal, currency)} />
              <Row label="Total" value={formatMoney(preview.total, currency)} strong />
              <div className="my-1 border-t" />
              <Row label="Costo de lo vendido" value={formatMoney(-preview.cogs, currency)} muted />
              <Row label={`Costos del canal${channel ? ` (${channel.name})` : ""}`} value={formatMoney(-preview.channelCost, currency)} muted />
              <div className="flex items-center justify-between gap-2 pt-1">
                <dt className="font-medium">Contribución</dt>
                <dd className="font-semibold tabular-nums"><Amount value={preview.contribution}>{formatMoney(preview.contribution, currency)}</Amount> <span className="text-xs text-muted-foreground">({formatPercent(preview.total > 0 ? preview.contribution / preview.total : 0)})</span></dd>
              </div>
              {preview.contribution < 0 && <Callout tone="danger" className="mt-2">Esta venta pierde dinero con el precio y los costos actuales.</Callout>}
            </dl>
          </div>
        </div>
      </AppDialog>

      {/* Detail */}
      <AppDialog
        open={!!detail}
        onOpenChange={(o) => !o && setDetail(null)}
        title={detail ? `Factura ${detail.number}` : ""}
        description={detail ? `${detail.distributors?.name ?? detail.customers?.name ?? detail.customer_name ?? "Consumidor final"} · ${detail.sales_channels?.name} · ${formatDate(detail.issue_date)} · vence ${formatDate(detail.due_date)}` : undefined}
        maxWidthClass="sm:max-w-3xl"
        footer={detail && canEdit && detail.status === "issued" && (
          <>
            <Button variant="destructive" onClick={() => voidInvoice(detail)}>Anular</Button>
            <Button variant="outline" onClick={() => openForm(detail)}>Corregir</Button>
            {Number(detail.balance) > 0.009 && <Button onClick={() => { setPaying({ kind: "invoice", id: detail.id, number: detail.number, balance: Number(detail.balance), counterparty: detail.distributors?.name ?? detail.customers?.name ?? detail.customer_name ?? "Cliente" }); setDetail(null); }}>Registrar cobro</Button>}
          </>
        )}
      >
        {detail && (
          <div className="grid gap-4">
            {detail.status === "void" && <Callout tone="warning" title="Factura anulada">{detail.void_reason}</Callout>}
            {detail.source === "legacy" && <Callout tone="info">Factura migrada del sistema anterior: su costo incluye mano de obra y gastos indirectos según el método antiguo.</Callout>}
            <RowsTable dense rows={detail.invoice_lines} rowKey={(l: any) => l.id} columns={[
              { key: "p", header: "Producto", cell: (l: any) => l.products?.name ?? l.description },
              { key: "q", header: "Cant.", align: "right", cell: (l: any) => formatNumber(Number(l.quantity)) },
              { key: "price", header: "Precio", align: "right", cell: (l: any) => formatMoney(Number(l.unit_price), currency) },
              { key: "disc", header: "Desc.", align: "right", cell: (l: any) => (Number(l.discount_pct) > 0 ? formatPercent(Number(l.discount_pct), 0) : "—") },
              { key: "t", header: "Total", align: "right", cell: (l: any) => formatMoney(Number(l.line_total), currency) },
              { key: "cogs", header: "Costo", align: "right", cell: (l: any) => <span className="text-muted-foreground">{formatMoney(Number(l.cogs), currency)}</span> },
            ]} />
            <div className="grid grid-cols-3 gap-3 text-sm">
              <StatCard label="Total" value={formatMoney(Number(detail.total), currency)} />
              <StatCard label="Margen bruto" value={formatMoney(Number(detail.total) - Number(detail.cogs_total), currency)} />
              <StatCard label="Saldo" value={formatMoney(Number(detail.balance), currency)} />
            </div>
            <div>
              <p className="mb-2 text-sm font-medium">Cobros</p>
              {detail.payments.length === 0 ? <p className="text-sm text-muted-foreground">Sin cobros registrados.</p> : (
                <ul className="grid gap-1.5 text-sm">
                  {detail.payments.map((p: any) => (
                    <li key={p.id} className={`flex items-center justify-between gap-2 ${p.voided_at ? "line-through opacity-50" : ""}`}>
                      <span>{formatDate(p.payment_date)} · {p.method ?? "—"} {p.reference ? `· ${p.reference}` : ""}</span>
                      <span className="flex items-center gap-2 tabular-nums">
                        {formatMoney(Number(p.amount), currency)}
                        {canEdit && !p.voided_at && detail.status === "issued" && <Button variant="ghost" size="xs" onClick={() => voidPayment(p.id)}>Anular</Button>}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {detail.notes && <p className="text-sm text-muted-foreground">Notas: {detail.notes}</p>}
          </div>
        )}
      </AppDialog>

      <PaymentDialog target={paying} currency={currency} onClose={() => setPaying(null)} onDone={() => void invalidate("invoices", "receivables", "payments")} />
    </div>
  );
}

function Row({ label, value, strong, muted }: { label: string; value: string; strong?: boolean; muted?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <dt className={muted ? "text-muted-foreground" : strong ? "font-medium" : undefined}>{label}</dt>
      <dd className={`tabular-nums ${strong ? "font-semibold" : ""} ${muted ? "text-muted-foreground" : ""}`}>{value}</dd>
    </div>
  );
}

function CreditCheck({ distributorId, limit, orderTotal, receivables, currency }: { distributorId: string; limit: number; orderTotal: number; receivables: any[]; currency: string }) {
  const balance = receivables.filter((r) => r.distributor_id === distributorId).reduce((s, r) => s + Number(r.balance), 0);
  const after = balance + orderTotal;
  if (after <= limit) {
    return <Callout tone="info">Crédito: saldo actual {formatMoney(balance, currency)} de {formatMoney(limit, currency)}. Disponible después de esta factura: {formatMoney(limit - after, currency)}.</Callout>;
  }
  return <Callout tone="warning" title="Supera el límite de crédito">Saldo actual {formatMoney(balance, currency)} + esta factura = {formatMoney(after, currency)}, por encima del límite de {formatMoney(limit, currency)}.</Callout>;
}
