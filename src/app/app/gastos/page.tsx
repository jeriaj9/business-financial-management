'use client';

import { useMemo, useState } from "react";
import { Pencil, Plus, Repeat, Trash2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { friendlyError } from "@/lib/errors";
import { formatDate, formatMoney, formatPercent, parseInput } from "@/lib/format";
import { today } from "@/lib/domain/dates";
import { invalidate, useCompany, useExpenses } from "@/lib/data/hooks";
import { PeriodPicker, periodFor, type Period } from "@/components/app/PeriodPicker";
import { RowsTable } from "@/components/app/RowsTable";
import { AppDialog } from "@/components/ui/app-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { NativeSelectField } from "@/components/ui/native-select";
import { ErrorState, LoadingState, PageHeader, Section, StatCard } from "@/components/ui/page";
import { SwitchField } from "@/components/ui/switch";
import { useToast } from "@/components/ui/toaster";
import { paymentMethods } from "@/components/app/PaymentDialog";

/* eslint-disable @typescript-eslint/no-explicit-any */
const CATEGORIES = ["Alquiler", "Salarios", "Servicios (luz, agua, internet)", "Publicidad", "Transporte", "Software", "Impuestos y tasas", "Mantenimiento", "Otros"];
const empty = { date: today(), category: "Alquiler", description: "", vendor: "", amount: "", method: "Transferencia", recurring: false };

export default function ExpensesPage() {
  const { companyId, canEdit, currency } = useCompany();
  const [period, setPeriod] = useState<Period>(periodFor("this_month"));
  const expenses = useExpenses(companyId, period.from, period.to);
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(empty);

  const categories = useMemo(() => {
    const extra = new Set((expenses.data ?? []).map((e: any) => e.category).filter((c: string) => !CATEGORIES.includes(c)));
    return [...CATEGORIES, ...extra];
  }, [expenses.data]);

  const byCategory = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of expenses.data ?? []) map.set(e.category, (map.get(e.category) ?? 0) + Number(e.amount));
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [expenses.data]);

  const openForm = (e: any | null) => {
    setEditingId(e?.id ?? null);
    setForm(e ? { date: e.expense_date, category: e.category, description: e.description ?? "", vendor: e.vendor ?? "", amount: String(e.amount), method: e.payment_method ?? "Transferencia", recurring: e.is_recurring } : { ...empty, date: today() });
    setOpen(true);
  };

  const save = async () => {
    const amount = parseInput(form.amount);
    if (!amount || amount <= 0) return toast.error("Indica un monto válido.");
    const payload = {
      expense_date: form.date,
      category: form.category,
      description: form.description.trim() || null,
      vendor: form.vendor.trim() || null,
      amount,
      payment_method: form.method,
      is_recurring: form.recurring,
    };
    const { error } = editingId
      ? await supabase.from("expenses").update(payload).eq("id", editingId)
      : await supabase.from("expenses").insert({ ...payload, company_id: companyId });
    if (error) return toast.error("No se pudo guardar", friendlyError(error));
    toast.success(editingId ? "Gasto actualizado" : "Gasto registrado");
    setOpen(false);
    void invalidate("expenses");
  };

  const remove = async (id: string) => {
    if (!window.confirm("¿Eliminar este gasto?")) return;
    const { error } = await supabase.from("expenses").delete().eq("id", id);
    if (error) return toast.error("No se pudo eliminar", friendlyError(error));
    void invalidate("expenses");
  };

  if (expenses.isLoading) return <LoadingState />;
  if (expenses.error) return <ErrorState message={friendlyError(expenses.error)} onRetry={() => expenses.mutate()} />;

  const total = (expenses.data ?? []).reduce((s: number, e: any) => s + Number(e.amount), 0);
  const recurring = (expenses.data ?? []).filter((e: any) => e.is_recurring).reduce((s: number, e: any) => s + Number(e.amount), 0);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Gastos"
        description="Gastos de operación (no materias primas: esas se registran en Compras). Marca como recurrentes los que se repiten cada mes para proyectar tu caja."
        actions={canEdit && <Button onClick={() => openForm(null)}><Plus className="h-4 w-4" /> Nuevo gasto</Button>}
      />
      <PeriodPicker value={period} onChange={setPeriod} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <StatCard label="Total del período" value={formatMoney(total, currency)} />
        <StatCard label="Recurrentes" value={formatMoney(recurring, currency)} hint="Se proyectan cada mes en la caja" />
        <StatCard label="Mayor categoría" value={byCategory[0]?.[0] ?? "—"} hint={byCategory[0] ? `${formatMoney(byCategory[0][1], currency)} · ${formatPercent(total > 0 ? byCategory[0][1] / total : 0, 0)}` : undefined} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
        <RowsTable
          rows={expenses.data ?? []}
          rowKey={(e: any) => e.id}
          empty="No hay gastos en este período."
          columns={[
            { key: "date", header: "Fecha", sortValue: (e: any) => e.expense_date, cell: (e: any) => formatDate(e.expense_date) },
            { key: "cat", header: "Categoría", cell: (e: any) => <span className="flex items-center gap-1.5">{e.category}{e.is_recurring && <Repeat className="h-3 w-3 text-brand" aria-label="Recurrente" />}</span> },
            { key: "desc", header: "Detalle", className: "whitespace-normal min-w-48", cell: (e: any) => <span className="text-muted-foreground">{[e.description, e.vendor].filter(Boolean).join(" · ")}</span> },
            { key: "amount", header: "Monto", align: "right", sortValue: (e: any) => Number(e.amount), cell: (e: any) => formatMoney(Number(e.amount), currency) },
            { key: "actions", header: "", align: "right", cell: (e: any) => canEdit && (
              <div className="flex justify-end gap-1">
                <Button variant="ghost" size="icon-sm" aria-label="Editar" onClick={() => openForm(e)}><Pencil className="h-4 w-4" /></Button>
                <Button variant="ghost" size="icon-sm" aria-label="Eliminar" onClick={() => remove(e.id)}><Trash2 className="h-4 w-4 text-muted-foreground" /></Button>
              </div>
            ) },
          ]}
        />
        <Section title="Por categoría">
          <ul className="grid gap-2 text-sm">
            {byCategory.map(([cat, amount]) => (
              <li key={cat}>
                <div className="flex justify-between"><span>{cat}</span><span className="tabular-nums">{formatMoney(amount, currency)}</span></div>
                <div className="mt-1 h-1.5 rounded-full bg-muted"><div className="h-1.5 rounded-full bg-brand" style={{ width: `${total > 0 ? (amount / total) * 100 : 0}%` }} /></div>
              </li>
            ))}
            {byCategory.length === 0 && <li className="text-muted-foreground">Sin datos.</li>}
          </ul>
        </Section>
      </div>

      <AppDialog open={open} onOpenChange={setOpen} title={editingId ? "Editar gasto" : "Nuevo gasto"}
        footer={<><Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button><Button onClick={save}>Guardar</Button></>}>
        <div className="grid gap-4">
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Fecha" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
            <FormField label={`Monto (${currency})`} inputMode="decimal" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
          </div>
          <NativeSelectField label="Categoría" value={form.category} onValueChange={(v) => setForm({ ...form, category: v })} options={categories.map((c) => ({ value: c, label: c }))} />
          <FormField label="Descripción" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Proveedor / beneficiario" value={form.vendor} onChange={(e) => setForm({ ...form, vendor: e.target.value })} />
            <NativeSelectField label="Método de pago" value={form.method} onValueChange={(v) => setForm({ ...form, method: v })} options={paymentMethods} />
          </div>
          <SwitchField checked={form.recurring} onCheckedChange={(v) => setForm({ ...form, recurring: v })} label={<span className="flex items-center gap-1.5"><Badge tone="brand">Mensual</Badge> Gasto recurrente</span>} description="Alquiler, salarios, servicios… Se proyecta en la caja el mismo día de cada mes." />
        </div>
      </AppDialog>
    </div>
  );
}
