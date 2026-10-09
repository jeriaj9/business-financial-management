'use client';

import { useMemo, useState } from "react";
import { Pencil, Plus } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { friendlyError } from "@/lib/errors";
import { formatMoney, parseInput } from "@/lib/format";
import { invalidate, useCompany, useMaterials, useOpenPayables, useSuppliers } from "@/lib/data/hooks";
import { RowsTable } from "@/components/app/RowsTable";
import { AppDialog } from "@/components/ui/app-dialog";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { EmptyState, ErrorState, LoadingState, PageHeader } from "@/components/ui/page";
import { SwitchField } from "@/components/ui/switch";
import { TextareaField } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toaster";

/* eslint-disable @typescript-eslint/no-explicit-any */
const empty = { name: "", tax_id: "", contact_name: "", email: "", phone: "", payment_terms_days: "0", lead_time_days: "7", notes: "", is_active: true };

export default function SuppliersPage() {
  const { companyId, canEdit, currency } = useCompany();
  const suppliers = useSuppliers(companyId);
  const materials = useMaterials(companyId);
  const payables = useOpenPayables(companyId);
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);

  const owed = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of payables.data ?? []) {
      const id = (p as any).supplier_id as string | null;
      if (id) map.set(id, (map.get(id) ?? 0) + Number(p.balance));
    }
    return map;
  }, [payables.data]);

  const openForm = (s: any | null) => {
    setEditingId(s?.id ?? null);
    setForm(
      s
        ? { name: s.name, tax_id: s.tax_id ?? "", contact_name: s.contact_name ?? "", email: s.email ?? "", phone: s.phone ?? "", payment_terms_days: String(s.payment_terms_days), lead_time_days: String(s.lead_time_days), notes: s.notes ?? "", is_active: s.is_active }
        : empty
    );
    setOpen(true);
  };

  const save = async () => {
    if (!form.name.trim()) return toast.error("El proveedor necesita un nombre.");
    setSaving(true);
    const payload = {
      name: form.name.trim(),
      tax_id: form.tax_id.trim() || null,
      contact_name: form.contact_name.trim() || null,
      email: form.email.trim() || null,
      phone: form.phone.trim() || null,
      payment_terms_days: parseInput(form.payment_terms_days) ?? 0,
      lead_time_days: parseInput(form.lead_time_days) ?? 7,
      notes: form.notes.trim() || null,
      is_active: form.is_active,
    };
    const { error } = editingId
      ? await supabase.from("suppliers").update(payload).eq("id", editingId)
      : await supabase.from("suppliers").insert({ ...payload, company_id: companyId });
    setSaving(false);
    if (error) return toast.error("No se pudo guardar", friendlyError(error));
    toast.success(editingId ? "Proveedor actualizado" : "Proveedor creado");
    setOpen(false);
    void invalidate("suppliers", "materials");
  };

  if (suppliers.isLoading) return <LoadingState />;
  if (suppliers.error) return <ErrorState message={friendlyError(suppliers.error)} onRetry={() => suppliers.mutate()} />;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Proveedores"
        description="Sus plazos de pago alimentan la proyección de caja y sus tiempos de entrega, el plan de compras."
        actions={canEdit && <Button onClick={() => openForm(null)}><Plus className="h-4 w-4" /> Nuevo proveedor</Button>}
      />
      {(suppliers.data ?? []).length === 0 ? (
        <EmptyState title="Sin proveedores" description="Registra a quién le compras tus materias primas." action={canEdit && <Button onClick={() => openForm(null)}>Agregar proveedor</Button>} />
      ) : (
        <RowsTable
          rows={suppliers.data ?? []}
          rowKey={(s: any) => s.id}
          rowClassName={(s: any) => (!s.is_active ? "opacity-50" : undefined)}
          columns={[
            { key: "name", header: "Proveedor", sortValue: (s: any) => s.name, cell: (s: any) => (
              <div><p className="font-medium">{s.name}</p><p className="text-xs text-muted-foreground">{[s.contact_name, s.phone, s.email].filter(Boolean).join(" · ")}</p></div>
            ) },
            { key: "materials", header: "Materias primas", align: "right", cell: (s: any) => (materials.data ?? []).filter((m) => m.supplierId === s.id).length },
            { key: "terms", header: "Plazo de pago", align: "right", cell: (s: any) => (s.payment_terms_days ? `${s.payment_terms_days} días` : "Contado") },
            { key: "lead", header: "Entrega", align: "right", cell: (s: any) => `${s.lead_time_days} días` },
            { key: "owed", header: "Por pagar", align: "right", cell: (s: any) => formatMoney(owed.get(s.id) ?? 0, currency) },
            { key: "edit", header: "", align: "right", cell: (s: any) => canEdit && <Button variant="ghost" size="icon-sm" aria-label="Editar" onClick={() => openForm(s)}><Pencil className="h-4 w-4" /></Button> },
          ]}
        />
      )}

      <AppDialog open={open} onOpenChange={setOpen} title={editingId ? "Editar proveedor" : "Nuevo proveedor"} maxWidthClass="sm:max-w-lg"
        footer={<><Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button><Button onClick={save} disabled={saving}>{saving ? "Guardando…" : "Guardar"}</Button></>}>
        <div className="grid gap-4">
          <FormField label="Nombre" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <div className="grid grid-cols-2 gap-4">
            <FormField label="RNC / identificación fiscal" value={form.tax_id} onChange={(e) => setForm({ ...form, tax_id: e.target.value })} />
            <FormField label="Contacto" value={form.contact_name} onChange={(e) => setForm({ ...form, contact_name: e.target.value })} />
            <FormField label="Teléfono" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            <FormField label="Correo" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            <FormField label="Plazo de pago (días)" inputMode="numeric" value={form.payment_terms_days} onChange={(e) => setForm({ ...form, payment_terms_days: e.target.value })} description="0 = contado" />
            <FormField label="Tiempo de entrega (días)" inputMode="numeric" value={form.lead_time_days} onChange={(e) => setForm({ ...form, lead_time_days: e.target.value })} />
          </div>
          <TextareaField label="Notas" rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          {editingId && <SwitchField checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} label="Activo" />}
        </div>
      </AppDialog>
    </div>
  );
}
