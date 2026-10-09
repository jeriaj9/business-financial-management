'use client';

import { useMemo, useState } from "react";
import { Pencil, Plus } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { friendlyError } from "@/lib/errors";
import { formatDate, formatMoney } from "@/lib/format";
import { addDays, today } from "@/lib/domain/dates";
import { invalidate, useCompany, useCustomers, useOpenReceivables, useSalesLineRows } from "@/lib/data/hooks";
import { RowsTable } from "@/components/app/RowsTable";
import { AppDialog } from "@/components/ui/app-dialog";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { EmptyState, ErrorState, LoadingState, PageHeader } from "@/components/ui/page";
import { SwitchField } from "@/components/ui/switch";
import { TextareaField } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toaster";

/* eslint-disable @typescript-eslint/no-explicit-any */
const empty = { name: "", tax_id: "", email: "", phone: "", address: "", notes: "", is_active: true };

export default function CustomersPage() {
  const { companyId, canEdit, currency } = useCompany();
  const customers = useCustomers(companyId);
  const receivables = useOpenReceivables(companyId);
  const since = addDays(today(), -364);
  const sales = useSalesLineRows(companyId, since, today());
  const toast = useToast();
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);

  const stats = useMemo(() => {
    const map = new Map<string, { revenue: number; last: string; invoices: Set<string> }>();
    for (const r of sales.data ?? []) {
      const id = (r as any).invoice?.customer_id;
      if (!id) continue;
      const s = map.get(id) ?? { revenue: 0, last: "", invoices: new Set<string>() };
      s.revenue += Number(r.line_total);
      s.invoices.add((r as any).invoice.id);
      if ((r as any).invoice.issue_date > s.last) s.last = (r as any).invoice.issue_date;
      map.set(id, s);
    }
    return map;
  }, [sales.data]);

  const balances = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of receivables.data ?? []) {
      const id = (r as any).customer_id as string | null;
      if (id) map.set(id, (map.get(id) ?? 0) + Number(r.balance));
    }
    return map;
  }, [receivables.data]);

  const openForm = (c: any | null) => {
    setEditingId(c?.id ?? null);
    setForm(c ? { name: c.name, tax_id: c.tax_id ?? "", email: c.email ?? "", phone: c.phone ?? "", address: c.address ?? "", notes: c.notes ?? "", is_active: c.is_active } : empty);
    setOpen(true);
  };

  const save = async () => {
    if (!form.name.trim()) return toast.error("El cliente necesita un nombre.");
    setSaving(true);
    const payload = {
      name: form.name.trim(),
      tax_id: form.tax_id.trim() || null,
      email: form.email.trim() || null,
      phone: form.phone.trim() || null,
      address: form.address.trim() || null,
      notes: form.notes.trim() || null,
      is_active: form.is_active,
    };
    const { error } = editingId
      ? await supabase.from("customers").update(payload).eq("id", editingId)
      : await supabase.from("customers").insert({ ...payload, company_id: companyId });
    setSaving(false);
    if (error) return toast.error("No se pudo guardar", friendlyError(error));
    toast.success(editingId ? "Cliente actualizado" : "Cliente creado");
    setOpen(false);
    void invalidate("customers");
  };

  if (customers.isLoading) return <LoadingState />;
  if (customers.error) return <ErrorState message={friendlyError(customers.error)} onRetry={() => customers.mutate()} />;

  const rows = (customers.data ?? []).filter((c: any) => `${c.name} ${c.tax_id ?? ""} ${c.phone ?? ""}`.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Clientes"
        description="Clientes directos (no distribuidores). Su rentabilidad aparece en «Rentabilidad» junto con la de tus distribuidores."
        actions={canEdit && <Button onClick={() => openForm(null)}><Plus className="h-4 w-4" /> Nuevo cliente</Button>}
      />
      {(customers.data ?? []).length === 0 ? (
        <EmptyState title="Sin clientes registrados" description="También puedes facturar a «Consumidor final» sin registrar al cliente." action={canEdit && <Button onClick={() => openForm(null)}>Agregar cliente</Button>} />
      ) : (
        <>
          <Input type="search" className="max-w-sm" placeholder="Buscar cliente…" value={search} onChange={(e) => setSearch(e.target.value)} />
          <RowsTable
            rows={rows}
            rowKey={(c: any) => c.id}
            rowClassName={(c: any) => (!c.is_active ? "opacity-50" : undefined)}
            initialSort={{ key: "revenue", dir: "desc" }}
            columns={[
              { key: "name", header: "Cliente", sortValue: (c: any) => c.name, cell: (c: any) => (
                <div><p className="font-medium">{c.name}</p><p className="text-xs text-muted-foreground">{[c.tax_id, c.phone, c.email].filter(Boolean).join(" · ")}</p></div>
              ) },
              { key: "revenue", header: "Ventas (12 meses)", align: "right", sortValue: (c: any) => stats.get(c.id)?.revenue ?? 0, cell: (c: any) => formatMoney(stats.get(c.id)?.revenue ?? 0, currency) },
              { key: "invoices", header: "Facturas", align: "right", cell: (c: any) => stats.get(c.id)?.invoices.size ?? 0 },
              { key: "last", header: "Última compra", cell: (c: any) => formatDate(stats.get(c.id)?.last || null) },
              { key: "balance", header: "Por cobrar", align: "right", sortValue: (c: any) => balances.get(c.id) ?? 0, cell: (c: any) => formatMoney(balances.get(c.id) ?? 0, currency) },
              { key: "edit", header: "", align: "right", cell: (c: any) => canEdit && <Button variant="ghost" size="icon-sm" aria-label="Editar" onClick={() => openForm(c)}><Pencil className="h-4 w-4" /></Button> },
            ]}
          />
        </>
      )}

      <AppDialog open={open} onOpenChange={setOpen} title={editingId ? "Editar cliente" : "Nuevo cliente"} maxWidthClass="sm:max-w-lg"
        footer={<><Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button><Button onClick={save} disabled={saving}>{saving ? "Guardando…" : "Guardar"}</Button></>}>
        <div className="grid gap-4">
          <FormField label="Nombre" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <div className="grid grid-cols-2 gap-4">
            <FormField label="RNC / cédula" value={form.tax_id} onChange={(e) => setForm({ ...form, tax_id: e.target.value })} />
            <FormField label="Teléfono" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </div>
          <FormField label="Correo" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <FormField label="Dirección" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
          <TextareaField label="Notas" rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          {editingId && <SwitchField checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} label="Activo" />}
        </div>
      </AppDialog>
    </div>
  );
}
