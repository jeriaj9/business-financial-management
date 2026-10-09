'use client';

import { useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { friendlyError } from "@/lib/errors";
import { formatDate, formatMoney, formatNumber, formatPercent, parseInput } from "@/lib/format";
import { addDays, today } from "@/lib/domain/dates";
import { agingBuckets, paymentStatus } from "@/lib/domain/receivables";
import { invalidate, rpc, useCompany, useMaterials, useOpenPayables, useProducts, usePurchases, useSuppliers } from "@/lib/data/hooks";
import { PaymentDialog, paymentMethods, type PaymentTarget } from "@/components/app/PaymentDialog";
import { PeriodPicker, periodFor, type Period } from "@/components/app/PeriodPicker";
import { RowsTable } from "@/components/app/RowsTable";
import { AppDialog } from "@/components/ui/app-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectField } from "@/components/ui/native-select";
import { Callout, ErrorState, LoadingState, PageHeader, StatCard } from "@/components/ui/page";
import { SwitchField } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TextareaField } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toaster";
import { es } from "@/i18n/es";

/* eslint-disable @typescript-eslint/no-explicit-any */
interface LineDraft {
  key: string;
  materialId: string;
  quantity: string;
  unitCost: string;
}

const statusTone = { paid: "success", partial: "info", pending: "neutral", overdue: "danger", void: "neutral" } as const;

export default function PurchasesPage() {
  const { companyId, canEdit, currency } = useCompany();
  const [period, setPeriod] = useState<Period>(periodFor("last_90"));
  const purchases = usePurchases(companyId, period.from, period.to);
  const payables = useOpenPayables(companyId);
  const materials = useMaterials(companyId);
  const suppliers = useSuppliers(companyId);
  const products = useProducts(companyId);
  const toast = useToast();

  const [creating, setCreating] = useState(false);
  const [detail, setDetail] = useState<any | null>(null);
  const [paying, setPaying] = useState<PaymentTarget | null>(null);

  // New purchase form
  const [supplierId, setSupplierId] = useState("");
  const [date, setDate] = useState(today());
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<LineDraft[]>([]);
  const [paidNow, setPaidNow] = useState(false);
  const [method, setMethod] = useState("Transferencia");
  const [saving, setSaving] = useState(false);

  const materialById = useMemo(() => new Map((materials.data ?? []).map((m) => [m.id, m])), [materials.data]);
  const supplier = suppliers.data?.find((s: any) => s.id === supplierId);
  const total = lines.reduce((s, l) => s + (parseInput(l.quantity) ?? 0) * (parseInput(l.unitCost) ?? 0), 0);

  const startCreate = () => {
    setSupplierId("");
    setDate(today());
    setNotes("");
    setLines([{ key: "l0", materialId: "", quantity: "", unitCost: "" }]);
    setPaidNow(false);
    setCreating(true);
  };

  const submit = async () => {
    const valid = lines.filter((l) => l.materialId && (parseInput(l.quantity) ?? 0) > 0);
    if (valid.length === 0) return toast.error("Agrega al menos una materia prima con cantidad.");
    if (valid.some((l) => parseInput(l.unitCost) === null || parseInput(l.unitCost)! < 0)) return toast.error("Revisa los costos unitarios.");
    setSaving(true);
    try {
      await rpc("create_purchase", {
        p_data: {
          supplier_id: supplierId || null,
          purchase_date: date,
          notes,
          lines: valid.map((l) => ({ material_id: l.materialId, quantity: parseInput(l.quantity), unit_cost: parseInput(l.unitCost) })),
          payment: paidNow ? { amount: total, method, payment_date: date } : null,
        },
      });
      toast.success("Compra registrada", "La existencia y los costos de tus materias primas se actualizaron.");
      setCreating(false);
      void invalidate("purchases", "payables", "materials", "products", "material_cost_history", "inventory_transactions");
    } catch (err) {
      toast.error("No se pudo registrar la compra", friendlyError(err));
    } finally {
      setSaving(false);
    }
  };

  const voidPurchase = async (p: any) => {
    const reason = window.prompt(`Motivo para anular ${p.number}:`);
    if (reason === null) return;
    try {
      await rpc("void_purchase", { p_purchase_id: p.id, p_reason: reason });
      toast.success("Compra anulada");
      setDetail(null);
      void invalidate("purchases", "payables", "materials", "inventory_transactions");
    } catch (err) {
      toast.error("No se pudo anular", friendlyError(err));
    }
  };

  if (purchases.isLoading || materials.isLoading) return <LoadingState />;
  if (purchases.error) return <ErrorState message={friendlyError(purchases.error)} onRetry={() => purchases.mutate()} />;

  const asOf = today();
  const rows = (purchases.data ?? []).map((p: any) => ({
    ...p,
    status_label: paymentStatus({ status: p.status === "void" ? "void" : "issued", total: Number(p.total), amountPaid: Number(p.amount_paid), dueDate: p.due_date }, asOf),
  }));
  const aging = agingBuckets((payables.data ?? []).map((p: any) => ({ dueDate: p.due_date, balance: Number(p.balance) })), asOf);
  const usage = (materialId: string) => (products.data ?? []).filter((p) => p.recipe.some((r) => r.materialId === materialId)).length;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Compras"
        description="Cada compra suma existencia, actualiza el costo de reposición y el costo promedio de la materia prima, y queda en cuentas por pagar."
        actions={canEdit && <Button onClick={startCreate}><Plus className="h-4 w-4" /> Nueva compra</Button>}
      />

      <Tabs defaultValue="compras">
        <TabsList>
          <TabsTrigger value="compras">Compras</TabsTrigger>
          <TabsTrigger value="pagar">Por pagar ({(payables.data ?? []).length})</TabsTrigger>
        </TabsList>

        <TabsContent value="compras" className="mt-4 grid gap-4">
          <PeriodPicker value={period} onChange={setPeriod} />
          <RowsTable
            rows={rows}
            rowKey={(p: any) => p.id}
            onRowClick={setDetail}
            rowClassName={(p: any) => (p.status === "void" ? "opacity-50" : undefined)}
            empty="No hay compras en este período."
            columns={[
              { key: "number", header: "Compra", cell: (p: any) => <span className="font-medium">{p.number}</span> },
              { key: "date", header: "Fecha", sortValue: (p: any) => p.purchase_date, cell: (p: any) => formatDate(p.purchase_date) },
              { key: "supplier", header: "Proveedor", cell: (p: any) => p.suppliers?.name ?? "Sin proveedor" },
              { key: "items", header: "Materias primas", cell: (p: any) => <span className="text-xs text-muted-foreground">{p.purchase_lines.map((l: any) => l.materials?.name).join(", ")}</span> },
              { key: "total", header: "Total", align: "right", sortValue: (p: any) => Number(p.total), cell: (p: any) => formatMoney(Number(p.total), currency) },
              { key: "balance", header: "Saldo", align: "right", cell: (p: any) => (p.status === "void" ? "—" : formatMoney(Number(p.balance), currency)) },
              { key: "status", header: "Estado", cell: (p: any) => <Badge tone={statusTone[p.status_label as keyof typeof statusTone]}>{p.status === "void" ? "Anulada" : es.paymentStatus[p.status_label as keyof typeof es.paymentStatus]}</Badge> },
            ]}
          />
        </TabsContent>

        <TabsContent value="pagar" className="mt-4 grid gap-4">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatCard label="Total por pagar" value={formatMoney(aging.total, currency)} />
            <StatCard label="Al día" value={formatMoney(aging.current, currency)} />
            <StatCard label="Vencido 1-30 días" value={formatMoney(aging.days1to30, currency)} tone={aging.days1to30 > 0 ? "warning" : "neutral"} />
            <StatCard label="Vencido +30 días" value={formatMoney(aging.days31to60 + aging.days61to90 + aging.over90, currency)} tone={aging.days31to60 + aging.days61to90 + aging.over90 > 0 ? "negative" : "neutral"} />
          </div>
          <RowsTable
            rows={payables.data ?? []}
            rowKey={(p: any) => p.id}
            empty="No tienes cuentas por pagar."
            initialSort={{ key: "due", dir: "asc" }}
            columns={[
              { key: "number", header: "Compra", cell: (p: any) => <span className="font-medium">{p.number}</span> },
              { key: "supplier", header: "Proveedor", cell: (p: any) => p.suppliers?.name ?? "Sin proveedor" },
              { key: "due", header: "Vence", sortValue: (p: any) => p.due_date, cell: (p: any) => <span className={p.due_date < asOf ? "text-red-400" : undefined}>{formatDate(p.due_date)}</span> },
              { key: "balance", header: "Saldo", align: "right", sortValue: (p: any) => Number(p.balance), cell: (p: any) => formatMoney(Number(p.balance), currency) },
              { key: "pay", header: "", align: "right", cell: (p: any) => canEdit && (
                <Button size="sm" variant="outline" onClick={() => setPaying({ kind: "purchase", id: p.id, number: p.number, balance: Number(p.balance), counterparty: p.suppliers?.name ?? "Proveedor" })}>Registrar pago</Button>
              ) },
            ]}
          />
        </TabsContent>
      </Tabs>

      {/* New purchase */}
      <AppDialog open={creating} onOpenChange={setCreating} title="Nueva compra" maxWidthClass="sm:max-w-3xl"
        footer={<><Button variant="outline" onClick={() => setCreating(false)}>Cancelar</Button><Button onClick={submit} disabled={saving}>{saving ? "Registrando…" : `Registrar compra · ${formatMoney(total, currency)}`}</Button></>}>
        <div className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <NativeSelectField label="Proveedor" placeholder="Sin proveedor" value={supplierId} onValueChange={setSupplierId} options={(suppliers.data ?? []).filter((s: any) => s.is_active).map((s: any) => ({ value: s.id, label: s.name }))} />
            <FormField label="Fecha" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            <div className="grid gap-2 text-sm">
              <span className="font-medium">Vencimiento</span>
              <span className="pt-1.5 text-muted-foreground">{supplier?.payment_terms_days ? `${formatDate(addDays(date, supplier.payment_terms_days))} (${supplier.payment_terms_days} días)` : "Contado"}</span>
            </div>
          </div>

          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Materia prima</th>
                  <th className="px-3 py-2 text-right font-medium">Cantidad</th>
                  <th className="px-3 py-2 text-right font-medium">Costo unitario</th>
                  <th className="px-3 py-2 text-right font-medium">Subtotal</th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody>
                {lines.map((l, idx) => {
                  const m = materialById.get(l.materialId);
                  const cost = parseInput(l.unitCost);
                  const change = m && cost !== null && m.costPerUnit > 0 ? (cost - m.costPerUnit) / m.costPerUnit : 0;
                  return (
                    <tr key={l.key} className="border-t align-top">
                      <td className="px-3 py-1.5">
                        <NativeSelect
                          aria-label="Materia prima"
                          placeholder="Selecciona…"
                          value={l.materialId}
                          onValueChange={(v) => setLines(lines.map((x, i) => (i === idx ? { ...x, materialId: v, unitCost: x.unitCost || String(materialById.get(v)?.costPerUnit ?? "") } : x)))}
                          options={(materials.data ?? []).filter((x) => x.isActive).map((x) => ({ value: x.id, label: `${x.name} (${x.unit})` }))}
                        />
                        {m && Math.abs(change) >= 0.005 && (
                          <p className={`mt-1 text-xs ${change > 0 ? "text-amber-400" : "text-emerald-400"}`}>
                            {formatPercent(change, 1, { signed: true })} vs. costo actual · afecta {usage(m.id)} producto(s)
                          </p>
                        )}
                      </td>
                      <td className="px-3 py-1.5">
                        <div className="flex items-center justify-end gap-1.5">
                          <Input className="w-24 text-right" inputMode="decimal" aria-label="Cantidad" value={l.quantity} onChange={(e) => setLines(lines.map((x, i) => (i === idx ? { ...x, quantity: e.target.value } : x)))} />
                          <span className="w-8 text-xs text-muted-foreground">{m?.unit}</span>
                        </div>
                      </td>
                      <td className="px-3 py-1.5"><Input className="ml-auto w-28 text-right" inputMode="decimal" aria-label="Costo unitario" value={l.unitCost} onChange={(e) => setLines(lines.map((x, i) => (i === idx ? { ...x, unitCost: e.target.value } : x)))} /></td>
                      <td className="px-3 py-1.5 pt-3 text-right tabular-nums">{formatMoney((parseInput(l.quantity) ?? 0) * (cost ?? 0), currency)}</td>
                      <td className="px-1 py-1.5"><Button variant="ghost" size="icon-sm" aria-label="Quitar" onClick={() => setLines(lines.filter((_, i) => i !== idx))}><Trash2 className="h-4 w-4 text-muted-foreground" /></Button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <Button variant="outline" size="sm" className="w-fit" onClick={() => setLines([...lines, { key: `l${Date.now()}`, materialId: "", quantity: "", unitCost: "" }])}><Plus className="h-4 w-4" /> Agregar línea</Button>

          <div className="grid gap-4 sm:grid-cols-2">
            <TextareaField label="Notas" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
            <div className="grid content-start gap-3">
              <SwitchField checked={paidNow} onCheckedChange={setPaidNow} label="Pagada en este momento" description="Si no, queda en cuentas por pagar." />
              {paidNow && <NativeSelectField label="Método de pago" value={method} onValueChange={setMethod} options={paymentMethods} />}
            </div>
          </div>
        </div>
      </AppDialog>

      {/* Detail */}
      <AppDialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)} title={detail ? `Compra ${detail.number}` : ""} description={detail ? `${detail.suppliers?.name ?? "Sin proveedor"} · ${formatDate(detail.purchase_date)} · vence ${formatDate(detail.due_date)}` : undefined} maxWidthClass="sm:max-w-2xl"
        footer={detail && canEdit && detail.status !== "void" && (
          <>
            <Button variant="destructive" onClick={() => voidPurchase(detail)}>Anular compra</Button>
            {Number(detail.balance) > 0.009 && <Button onClick={() => { setPaying({ kind: "purchase", id: detail.id, number: detail.number, balance: Number(detail.balance), counterparty: detail.suppliers?.name ?? "Proveedor" }); setDetail(null); }}>Registrar pago</Button>}
          </>
        )}>
        {detail && (
          <div className="grid gap-4">
            {detail.status === "void" && <Callout tone="warning" title="Compra anulada">{detail.void_reason}</Callout>}
            <RowsTable dense rows={detail.purchase_lines} rowKey={(l: any) => l.id} columns={[
              { key: "m", header: "Materia prima", cell: (l: any) => l.materials?.name },
              { key: "q", header: "Cantidad", align: "right", cell: (l: any) => `${formatNumber(Number(l.quantity))} ${l.materials?.unit_of_measure ?? ""}` },
              { key: "c", header: "Costo unitario", align: "right", cell: (l: any) => formatMoney(Number(l.unit_cost), currency, { decimals: Number(l.unit_cost) < 1 ? 4 : 2 }) },
              { key: "t", header: "Subtotal", align: "right", cell: (l: any) => formatMoney(Number(l.line_total), currency) },
            ]} />
            <div>
              <p className="mb-2 text-sm font-medium">Pagos</p>
              {detail.payments.length === 0 ? <p className="text-sm text-muted-foreground">Sin pagos registrados.</p> : (
                <ul className="grid gap-1 text-sm">
                  {detail.payments.map((p: any) => (
                    <li key={p.id} className={`flex justify-between ${p.voided_at ? "line-through opacity-50" : ""}`}>
                      <span>{formatDate(p.payment_date)} · {p.method ?? "—"} {p.reference ? `· ${p.reference}` : ""}</span>
                      <span className="tabular-nums">{formatMoney(Number(p.amount), currency)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {detail.notes && <p className="text-sm text-muted-foreground">Notas: {detail.notes}</p>}
          </div>
        )}
      </AppDialog>

      <PaymentDialog target={paying} currency={currency} onClose={() => setPaying(null)} onDone={() => void invalidate("purchases", "payables", "payments")} />
    </div>
  );
}
