'use client';

import { useMemo, useState } from "react";
import { Copy, KeyRound, Pencil, Plus, Trash2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { friendlyError } from "@/lib/errors";
import { formatDate, formatMoney, formatPercent, parseInput } from "@/lib/format";
import { dayNumber, today } from "@/lib/domain/dates";
import { invalidate, rpc, useCompany, useDistributors, useInvitations, useOpenReceivables, usePortalUsers } from "@/lib/data/hooks";
import type { DistributorRecord } from "@/lib/data/mappers";
import { RowsTable } from "@/components/app/RowsTable";
import { AppDialog } from "@/components/ui/app-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Callout, EmptyState, ErrorState, LoadingState, PageHeader } from "@/components/ui/page";
import { SwitchField } from "@/components/ui/switch";
import { TextareaField } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toaster";

/* eslint-disable @typescript-eslint/no-explicit-any */
const empty = { name: "", contact_name: "", email: "", phone: "", tax_id: "", address: "", discount: "", terms: "30", credit: "", notes: "", is_active: true };

export default function DistributorsPage() {
  const { companyId, canEdit, currency, settings } = useCompany();
  const distributors = useDistributors(companyId);
  const receivables = useOpenReceivables(companyId);
  const portalUsers = usePortalUsers(companyId);
  const invitations = useInvitations(canEdit ? companyId : undefined);
  const toast = useToast();

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<DistributorRecord | null>(null);
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);
  const [accessFor, setAccessFor] = useState<DistributorRecord | null>(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteLink, setInviteLink] = useState<string | null>(null);

  const balances = useMemo(() => {
    const map = new Map<string, { balance: number; overdue: number }>();
    for (const r of receivables.data ?? []) {
      if (!r.distributor_id) continue;
      const b = map.get(r.distributor_id) ?? { balance: 0, overdue: 0 };
      b.balance += Number(r.balance);
      if (dayNumber(r.due_date) < dayNumber(today())) b.overdue += Number(r.balance);
      map.set(r.distributor_id, b);
    }
    return map;
  }, [receivables.data]);

  const openForm = (d: DistributorRecord | null) => {
    setEditing(d);
    setForm(
      d
        ? {
            name: d.name,
            contact_name: d.contactName ?? "",
            email: d.email ?? "",
            phone: d.phone ?? "",
            tax_id: d.taxId ?? "",
            address: d.address ?? "",
            discount: d.marginOverride === null ? "" : String(Math.round(d.marginOverride * 10000) / 100),
            terms: String(d.paymentTermsDays),
            credit: d.creditLimit === null ? "" : String(d.creditLimit),
            notes: d.territoryNotes ?? "",
            is_active: d.isActive,
          }
        : empty
    );
    setOpen(true);
  };

  const save = async () => {
    if (!form.name.trim()) return toast.error("El distribuidor necesita un nombre.");
    const discount = form.discount.trim() === "" ? null : parseInput(form.discount);
    if (discount !== null && (discount < 0 || discount >= 100)) return toast.error("El descuento debe estar entre 0 y 99 %.");
    setSaving(true);
    const payload = {
      name: form.name.trim(),
      contact_name: form.contact_name.trim() || null,
      email: form.email.trim() || null,
      phone: form.phone.trim() || null,
      tax_id: form.tax_id.trim() || null,
      address: form.address.trim() || null,
      margin_override: discount === null ? null : discount / 100,
      payment_terms_days: parseInput(form.terms) ?? 30,
      credit_limit: form.credit.trim() === "" ? null : parseInput(form.credit),
      territory_notes: form.notes.trim() || null,
      is_active: form.is_active,
    };
    const { error } = editing
      ? await supabase.from("distributors").update(payload).eq("id", editing.id)
      : await supabase.from("distributors").insert({ ...payload, company_id: companyId });
    setSaving(false);
    if (error) return toast.error("No se pudo guardar", friendlyError(error));
    toast.success(editing ? "Distribuidor actualizado" : "Distribuidor creado");
    setOpen(false);
    void invalidate("distributors");
  };

  const createInvite = async () => {
    if (!accessFor) return;
    try {
      const token = await rpc<string>("create_distributor_invitation", { p_distributor_id: accessFor.id, p_email: inviteEmail.trim() || null });
      setInviteLink(`${window.location.origin}/invitacion/${token}`);
      void invalidate("company_invitations");
    } catch (err) {
      toast.error("No se pudo crear la invitación", friendlyError(err));
    }
  };

  const revokeAccess = async (linkId: string) => {
    try {
      await rpc("remove_distributor_portal_user", { p_link_id: linkId });
      toast.success("Acceso retirado");
      void invalidate("portal_users");
    } catch (err) {
      toast.error("No se pudo retirar el acceso", friendlyError(err));
    }
  };

  const revokeInvite = async (id: string) => {
    try {
      await rpc("revoke_invitation", { p_invitation_id: id });
      void invalidate("company_invitations");
    } catch (err) {
      toast.error("No se pudo revocar", friendlyError(err));
    }
  };

  if (distributors.isLoading) return <LoadingState />;
  if (distributors.error) return <ErrorState message={friendlyError(distributors.error)} onRetry={() => distributors.mutate()} />;

  const defaultDiscount = settings?.distributorMargin ?? 0;
  const usersFor = (id: string) => (portalUsers.data ?? []).filter((u) => u.distributor_id === id);
  const pendingInvites = (invitations.data ?? []).filter((i: any) => i.kind === "distributor" && i.distributor_id === accessFor?.id && new Date(i.expires_at) > new Date());

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Distribuidores"
        description="Condiciones comerciales, saldos y acceso al portal donde tus distribuidores ven precios, hacen pedidos y consultan su cuenta."
        actions={canEdit && <Button onClick={() => openForm(null)}><Plus className="h-4 w-4" /> Nuevo distribuidor</Button>}
      />

      {(distributors.data ?? []).length === 0 ? (
        <EmptyState title="Sin distribuidores" description="Agrega a quienes revenden tus productos para darles acceso al portal y medir su rentabilidad." action={canEdit && <Button onClick={() => openForm(null)}>Agregar distribuidor</Button>} />
      ) : (
        <RowsTable
          rows={distributors.data ?? []}
          rowKey={(d) => d.id}
          rowClassName={(d) => (!d.isActive ? "opacity-50" : undefined)}
          initialSort={{ key: "balance", dir: "desc" }}
          columns={[
            { key: "name", header: "Distribuidor", sortValue: (d) => d.name, cell: (d) => (
              <div><p className="font-medium">{d.name}</p><p className="text-xs text-muted-foreground">{[d.contactName, d.phone].filter(Boolean).join(" · ")}</p></div>
            ) },
            { key: "discount", header: "Descuento", align: "right", cell: (d) => (
              <span>{formatPercent(d.marginOverride ?? defaultDiscount, 0)}{d.marginOverride === null && <span className="ml-1 text-xs text-muted-foreground">(general)</span>}</span>
            ) },
            { key: "terms", header: "Plazo", align: "right", cell: (d) => `${d.paymentTermsDays} días` },
            { key: "credit", header: "Límite de crédito", align: "right", cell: (d) => (d.creditLimit === null ? "Sin límite" : formatMoney(d.creditLimit, currency)) },
            { key: "balance", header: "Saldo", align: "right", sortValue: (d) => balances.get(d.id)?.balance ?? 0, cell: (d) => {
              const b = balances.get(d.id);
              return (
                <div>
                  <p>{formatMoney(b?.balance ?? 0, currency)}</p>
                  {b && b.overdue > 0 && <p className="text-xs text-red-400">{formatMoney(b.overdue, currency)} vencido</p>}
                  {d.creditLimit !== null && b && b.balance > d.creditLimit && <p className="text-xs text-amber-400">Sobre el límite</p>}
                </div>
              );
            } },
            { key: "portal", header: "Portal", cell: (d) => {
              const count = usersFor(d.id).length;
              return count > 0 ? <Badge tone="success">{count} usuario{count > 1 ? "s" : ""}</Badge> : <Badge>Sin acceso</Badge>;
            } },
            { key: "actions", header: "", align: "right", cell: (d) => canEdit && (
              <div className="flex justify-end gap-1">
                <Button variant="ghost" size="sm" onClick={() => { setAccessFor(d); setInviteLink(null); setInviteEmail(d.email ?? ""); }}><KeyRound className="h-4 w-4" /> Acceso</Button>
                <Button variant="ghost" size="icon-sm" aria-label="Editar" onClick={() => openForm(d)}><Pencil className="h-4 w-4" /></Button>
              </div>
            ) },
          ]}
        />
      )}

      <AppDialog open={open} onOpenChange={setOpen} title={editing ? `Editar ${editing.name}` : "Nuevo distribuidor"} maxWidthClass="sm:max-w-xl"
        footer={<><Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button><Button onClick={save} disabled={saving}>{saving ? "Guardando…" : "Guardar"}</Button></>}>
        <div className="grid gap-4">
          <FormField label="Nombre comercial" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Contacto" value={form.contact_name} onChange={(e) => setForm({ ...form, contact_name: e.target.value })} />
            <FormField label="Teléfono" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            <FormField label="Correo" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            <FormField label="RNC" value={form.tax_id} onChange={(e) => setForm({ ...form, tax_id: e.target.value })} />
          </div>
          <FormField label="Dirección" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
          <div className="grid gap-4 sm:grid-cols-3">
            <FormField label="Descuento sobre lista (%)" inputMode="decimal" placeholder={`General: ${formatPercent(defaultDiscount, 0)}`} value={form.discount} onChange={(e) => setForm({ ...form, discount: e.target.value })} description="Vacío = descuento general" />
            <FormField label="Plazo de pago (días)" inputMode="numeric" value={form.terms} onChange={(e) => setForm({ ...form, terms: e.target.value })} />
            <FormField label={`Límite de crédito (${currency})`} inputMode="decimal" value={form.credit} onChange={(e) => setForm({ ...form, credit: e.target.value })} description="Vacío = sin límite" />
          </div>
          <TextareaField label="Territorio / notas" rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          {editing && <SwitchField checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} label="Activo" description="Un distribuidor inactivo pierde el acceso al portal." />}
        </div>
      </AppDialog>

      <AppDialog open={!!accessFor} onOpenChange={(o) => !o && setAccessFor(null)} title={`Acceso al portal · ${accessFor?.name ?? ""}`} maxWidthClass="sm:max-w-lg">
        <div className="grid gap-5">
          <div>
            <p className="mb-2 text-sm font-medium">Usuarios con acceso</p>
            {accessFor && usersFor(accessFor.id).length === 0 ? (
              <p className="text-sm text-muted-foreground">Nadie tiene acceso todavía.</p>
            ) : (
              <ul className="grid gap-2">
                {accessFor && usersFor(accessFor.id).map((u) => (
                  <li key={u.id} className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm">
                    <span>{u.email}<span className="ml-2 text-xs text-muted-foreground">desde {formatDate(u.created_at)}</span></span>
                    <Button variant="ghost" size="icon-sm" aria-label="Retirar acceso" onClick={() => revokeAccess(u.id)}><Trash2 className="h-4 w-4 text-red-400" /></Button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {pendingInvites.length > 0 && (
            <div>
              <p className="mb-2 text-sm font-medium">Invitaciones pendientes</p>
              <ul className="grid gap-2">
                {pendingInvites.map((i: any) => (
                  <li key={i.id} className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm">
                    <span>{i.email ?? "Cualquier correo"}<span className="ml-2 text-xs text-muted-foreground">vence {formatDate(i.expires_at)}</span></span>
                    <Button variant="ghost" size="sm" onClick={() => revokeInvite(i.id)}>Revocar</Button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="grid gap-3 rounded-lg border p-3">
            <p className="text-sm font-medium">Invitar a alguien</p>
            <FormField label="Correo del distribuidor" type="email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} description="Solo esa persona podrá usar el enlace. Déjalo vacío para un enlace abierto (válido 14 días, un solo uso)." />
            <Button onClick={createInvite}>Generar enlace de invitación</Button>
            {inviteLink && (
              <Callout tone="success" title="Enlace listo para compartir">
                <div className="mt-1 flex items-center gap-2">
                  <code className="min-w-0 flex-1 truncate rounded bg-muted px-2 py-1 text-xs text-foreground">{inviteLink}</code>
                  <Button variant="outline" size="sm" onClick={() => { void navigator.clipboard.writeText(inviteLink); toast.success("Enlace copiado"); }}><Copy className="h-4 w-4" /> Copiar</Button>
                </div>
                <p className="mt-2 text-xs">Envíalo por WhatsApp o correo. No se envía automáticamente.</p>
              </Callout>
            )}
          </div>
        </div>
      </AppDialog>
    </div>
  );
}
