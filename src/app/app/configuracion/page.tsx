'use client';

import { useState } from "react";
import { Copy, Pencil, Plus, Trash2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { friendlyError } from "@/lib/errors";
import { formatDate, formatMoney, formatPercent, parseInput } from "@/lib/format";
import { invalidate, rpc, useChannels, useCompany, useInvitations, useTeam } from "@/lib/data/hooks";
import { useAuth } from "@/components/auth/AuthProvider";
import type { Channel } from "@/lib/domain/types";
import type { SettingsRecord } from "@/lib/data/mappers";
import { RowsTable } from "@/components/app/RowsTable";
import { AppDialog } from "@/components/ui/app-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { NativeSelect, NativeSelectField } from "@/components/ui/native-select";
import { Callout, LoadingState, PageHeader, Section } from "@/components/ui/page";
import { SwitchField } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/toaster";
import { es } from "@/i18n/es";

/* eslint-disable @typescript-eslint/no-explicit-any */
const pct = (v: number) => String(Math.round(v * 10000) / 100);

export default function SettingsPage() {
  const { companyName, settings, settingsLoading } = useCompany();
  const [tab, setTab] = useState("costeo");
  if (settingsLoading || !settings) return <LoadingState />;
  // Remount the forms when the saved settings change so they start from the stored values
  return <SettingsEditor key={`${JSON.stringify(settings)}:${companyName}`} settings={settings} tab={tab} onTabChange={setTab} />;
}

function SettingsEditor({ settings, tab, onTabChange }: { settings: SettingsRecord; tab: string; onTabChange: (tab: string) => void }) {
  const { companyId, companyName, isAdmin, currency } = useCompany();
  const { refresh } = useAuth();
  const toast = useToast();

  const [company, setCompany] = useState({ name: companyName, currency: settings.currency });
  const [costing, setCosting] = useState({
    labor: String(settings.laborCostPerHour),
    laborVariable: settings.laborIsVariable,
    reserve: pct(settings.indirectCostReserve),
    distributor: pct(settings.distributorMargin),
    negative: settings.allowNegativeStock,
  });
  const [cash, setCash] = useState({
    opening: String(settings.openingCashBalance),
    openingDate: settings.openingCashDate ?? "",
    terms: String(settings.defaultPaymentTermsDays),
    safety: String(settings.safetyStockWeeks),
    lookback: String(settings.demandLookbackWeeks),
    lead: String(settings.defaultLeadTimeDays),
  });
  const [saving, setSaving] = useState<string | null>(null);

  const updateSettings = async (section: string, patch: Record<string, unknown>) => {
    setSaving(section);
    const { error } = await supabase.from("settings").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", settings.id);
    setSaving(null);
    if (error) return toast.error("No se pudo guardar", friendlyError(error));
    toast.success("Configuración guardada");
    void invalidate("settings", "products");
  };

  const saveCompany = async () => {
    if (!company.name.trim()) return toast.error("El nombre de la empresa es obligatorio.");
    setSaving("company");
    const { error } = await supabase.from("companies").update({ name: company.name.trim() }).eq("id", companyId);
    if (error) {
      setSaving(null);
      return toast.error("No se pudo guardar", friendlyError(error));
    }
    await updateSettings("company", { currency: company.currency });
    await refresh();
  };

  const readOnly = !isAdmin;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Configuración" description="Estos parámetros alimentan el costeo, los precios, la rentabilidad por canal y la proyección de caja." />
      {readOnly && <Callout tone="info">Solo los administradores pueden cambiar la configuración.</Callout>}

      <Tabs value={tab} onValueChange={(v) => onTabChange(String(v))}>
        <TabsList className="flex-wrap">
          <TabsTrigger value="costeo">Costeo y precios</TabsTrigger>
          <TabsTrigger value="canales">Canales de venta</TabsTrigger>
          <TabsTrigger value="caja">Caja y planificación</TabsTrigger>
          <TabsTrigger value="equipo">Equipo</TabsTrigger>
          <TabsTrigger value="empresa">Empresa</TabsTrigger>
        </TabsList>

        <TabsContent value="costeo" className="mt-4">
          <Section title="Cómo se calcula el costo de tus productos">
            <div className="grid gap-5 md:grid-cols-2">
              <FormField label={`Costo de mano de obra por hora (${currency})`} inputMode="decimal" value={costing.labor} disabled={readOnly} onChange={(e) => setCosting({ ...costing, labor: e.target.value })} />
              <FormField label="Reserva para gastos indirectos (%)" inputMode="decimal" value={costing.reserve} disabled={readOnly} onChange={(e) => setCosting({ ...costing, reserve: e.target.value })} description="Se suma al costo para fijar precios que cubran alquiler, luz, etc." />
              <SwitchField
                className="md:col-span-2"
                checked={costing.laborVariable}
                disabled={readOnly}
                onCheckedChange={(v) => setCosting({ ...costing, laborVariable: v })}
                label="La mano de obra se paga por unidad producida"
                description="Actívalo si pagas a destajo y NO registras esos pagos en Gastos. Si pagas salarios fijos (registrados en Gastos), déjalo apagado para no contar la mano de obra dos veces."
              />
              <FormField label="Descuento general para distribuidores (%)" inputMode="decimal" value={costing.distributor} disabled={readOnly} onChange={(e) => setCosting({ ...costing, distributor: e.target.value })} description="Precio distribuidor = precio de lista menos este %, salvo excepciones." />
              <SwitchField
                checked={costing.negative}
                disabled={readOnly}
                onCheckedChange={(v) => setCosting({ ...costing, negative: v })}
                label="Permitir vender o producir sin existencia"
                description="Útil mientras cargas tu inventario inicial. Apagado protege la exactitud del inventario."
              />
            </div>
            {!readOnly && (
              <div className="mt-5 flex justify-end">
                <Button
                  disabled={saving === "costing"}
                  onClick={() =>
                    updateSettings("costing", {
                      labor_cost_per_hour: parseInput(costing.labor) ?? 0,
                      labor_is_variable: costing.laborVariable,
                      indirect_cost_reserve: (parseInput(costing.reserve) ?? 0) / 100,
                      distributor_margin: (parseInput(costing.distributor) ?? 0) / 100,
                      allow_negative_stock: costing.negative,
                    })
                  }
                >
                  {saving === "costing" ? "Guardando…" : "Guardar"}
                </Button>
              </div>
            )}
          </Section>
        </TabsContent>

        <TabsContent value="canales" className="mt-4">
          <ChannelsSection currency={currency} />
        </TabsContent>

        <TabsContent value="caja" className="mt-4">
          <Section title="Punto de partida de la caja" description="Indica cuánto dinero tenías en caja y bancos en una fecha. Desde ahí sumamos cobros y restamos pagos y gastos.">
            <div className="grid gap-5 md:grid-cols-3">
              <FormField label={`Saldo inicial (${currency})`} inputMode="decimal" value={cash.opening} disabled={readOnly} onChange={(e) => setCash({ ...cash, opening: e.target.value })} />
              <FormField label="Fecha del saldo" type="date" value={cash.openingDate} disabled={readOnly} onChange={(e) => setCash({ ...cash, openingDate: e.target.value })} />
              <FormField label="Plazo de cobro por defecto (días)" inputMode="numeric" value={cash.terms} disabled={readOnly} onChange={(e) => setCash({ ...cash, terms: e.target.value })} />
            </div>
          </Section>
          <Section className="mt-4" title="Planificación" description="Parámetros del plan de producción y compras.">
            <div className="grid gap-5 md:grid-cols-3">
              <FormField label="Semanas de stock de seguridad" inputMode="decimal" value={cash.safety} disabled={readOnly} onChange={(e) => setCash({ ...cash, safety: e.target.value })} />
              <FormField label="Semanas de historial para estimar demanda" inputMode="numeric" value={cash.lookback} disabled={readOnly} onChange={(e) => setCash({ ...cash, lookback: e.target.value })} />
              <FormField label="Tiempo de entrega por defecto (días)" inputMode="numeric" value={cash.lead} disabled={readOnly} onChange={(e) => setCash({ ...cash, lead: e.target.value })} />
            </div>
            {!readOnly && (
              <div className="mt-5 flex justify-end">
                <Button
                  disabled={saving === "cash"}
                  onClick={() =>
                    updateSettings("cash", {
                      opening_cash_balance: parseInput(cash.opening) ?? 0,
                      opening_cash_date: cash.openingDate || null,
                      default_payment_terms_days: parseInput(cash.terms) ?? 0,
                      safety_stock_weeks: parseInput(cash.safety) ?? 1,
                      demand_lookback_weeks: Math.max(1, Math.round(parseInput(cash.lookback) ?? 8)),
                      default_lead_time_days: parseInput(cash.lead) ?? 7,
                    })
                  }
                >
                  {saving === "cash" ? "Guardando…" : "Guardar"}
                </Button>
              </div>
            )}
          </Section>
        </TabsContent>

        <TabsContent value="equipo" className="mt-4">
          <TeamSection />
        </TabsContent>

        <TabsContent value="empresa" className="mt-4">
          <Section title="Datos de la empresa">
            <div className="grid gap-5 md:grid-cols-2">
              <FormField label="Nombre" value={company.name} disabled={readOnly} onChange={(e) => setCompany({ ...company, name: e.target.value })} />
              <NativeSelectField
                label="Moneda"
                value={company.currency}
                disabled={readOnly}
                onValueChange={(v) => setCompany({ ...company, currency: v })}
                options={["DOP", "USD", "MXN", "COP", "EUR"].map((c) => ({ value: c, label: c }))}
              />
            </div>
            {!readOnly && (
              <div className="mt-5 flex justify-end">
                <Button onClick={saveCompany} disabled={saving === "company"}>{saving === "company" ? "Guardando…" : "Guardar"}</Button>
              </div>
            )}
          </Section>
        </TabsContent>
      </Tabs>
    </div>
  );
}

const emptyChannel = { name: "", kind: "direct", price_basis: "retail", commission: "0", fee: "0", per_order: "0", per_unit: "0", terms: "0", is_active: true };

function ChannelsSection({ currency }: { currency: string }) {
  const { companyId, canEdit } = useCompany();
  const channels = useChannels(companyId);
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyChannel);

  const openForm = (c: Channel | null) => {
    setEditingId(c?.id ?? null);
    setForm(
      c
        ? { name: c.name, kind: c.kind, price_basis: c.priceBasis, commission: pct(c.commissionPct), fee: pct(c.paymentFeePct), per_order: String(c.costPerOrder), per_unit: String(c.costPerUnit), terms: String(c.paymentTermsDays), is_active: c.isActive }
        : emptyChannel
    );
    setOpen(true);
  };

  const save = async () => {
    if (!form.name.trim()) return toast.error("El canal necesita un nombre.");
    const payload = {
      name: form.name.trim(),
      kind: form.kind,
      price_basis: form.price_basis,
      commission_pct: (parseInput(form.commission) ?? 0) / 100,
      payment_fee_pct: (parseInput(form.fee) ?? 0) / 100,
      cost_per_order: parseInput(form.per_order) ?? 0,
      cost_per_unit: parseInput(form.per_unit) ?? 0,
      payment_terms_days: parseInput(form.terms) ?? 0,
      is_active: form.is_active,
    };
    const { error } = editingId
      ? await supabase.from("sales_channels").update(payload).eq("id", editingId)
      : await supabase.from("sales_channels").insert({ ...payload, company_id: companyId });
    if (error) return toast.error("No se pudo guardar", friendlyError(error));
    toast.success("Canal guardado");
    setOpen(false);
    void invalidate("sales_channels");
  };

  const unconfigured = (channels.data ?? []).filter((c) => c.isActive && c.commissionPct === 0 && c.paymentFeePct === 0 && c.costPerOrder === 0 && c.costPerUnit === 0);

  return (
    <Section
      title="Canales de venta y sus costos"
      description="Lo que te cuesta vender por cada canal: comisiones, cargos de la pasarela de pago, envío por pedido y empaque por unidad. Con esto calculamos el margen real por canal."
      actions={canEdit && <Button size="sm" onClick={() => openForm(null)}><Plus className="h-4 w-4" /> Nuevo canal</Button>}
    >
      {unconfigured.length > 0 && (
        <Callout tone="warning" className="mb-4" title="Canales sin costos configurados">
          {unconfigured.map((c) => c.name).join(", ")}. Si vender por ellos te cuesta algo (envío, comisión, tarjeta), agrégalo para que la rentabilidad sea real.
        </Callout>
      )}
      <RowsTable
        rows={channels.data ?? []}
        rowKey={(c) => c.id}
        rowClassName={(c) => (!c.isActive ? "opacity-50" : undefined)}
        columns={[
          { key: "name", header: "Canal", cell: (c) => <div><p className="font-medium">{c.name}</p><p className="text-xs text-muted-foreground">{es.channelKinds[c.kind]} · {es.priceBasis[c.priceBasis]}</p></div> },
          { key: "pct", header: "Comisión + pasarela", align: "right", cell: (c) => formatPercent(c.commissionPct + c.paymentFeePct) },
          { key: "order", header: "Por pedido", align: "right", cell: (c) => formatMoney(c.costPerOrder, currency) },
          { key: "unit", header: "Por unidad", align: "right", cell: (c) => formatMoney(c.costPerUnit, currency) },
          { key: "terms", header: "Cobro", align: "right", cell: (c) => (c.paymentTermsDays ? `${c.paymentTermsDays} días` : "Contado") },
          { key: "edit", header: "", align: "right", cell: (c) => canEdit && <Button variant="ghost" size="icon-sm" aria-label="Editar" onClick={() => openForm(c)}><Pencil className="h-4 w-4" /></Button> },
        ]}
      />

      <AppDialog open={open} onOpenChange={setOpen} title={editingId ? "Editar canal" : "Nuevo canal"} maxWidthClass="sm:max-w-lg"
        footer={<><Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button><Button onClick={save}>Guardar</Button></>}>
        <div className="grid gap-4">
          <FormField label="Nombre" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ej. Instagram, Feria, Tienda propia" />
          <div className="grid grid-cols-2 gap-4">
            <NativeSelectField label="Tipo" value={form.kind} onValueChange={(v) => setForm({ ...form, kind: v })} options={Object.entries(es.channelKinds).map(([value, label]) => ({ value, label }))} />
            <NativeSelectField label="Precio que aplica" value={form.price_basis} onValueChange={(v) => setForm({ ...form, price_basis: v })} options={Object.entries(es.priceBasis).map(([value, label]) => ({ value, label }))} />
            <FormField label="Comisión (%)" inputMode="decimal" value={form.commission} onChange={(e) => setForm({ ...form, commission: e.target.value })} description="Vendedores, marketplace…" />
            <FormField label="Cargo de pago (%)" inputMode="decimal" value={form.fee} onChange={(e) => setForm({ ...form, fee: e.target.value })} description="Tarjeta, pasarela…" />
            <FormField label={`Costo por pedido (${currency})`} inputMode="decimal" value={form.per_order} onChange={(e) => setForm({ ...form, per_order: e.target.value })} description="Envío, entrega." />
            <FormField label={`Costo por unidad (${currency})`} inputMode="decimal" value={form.per_unit} onChange={(e) => setForm({ ...form, per_unit: e.target.value })} description="Empaque extra, etiqueta." />
            <FormField label="Días para cobrar" inputMode="numeric" value={form.terms} onChange={(e) => setForm({ ...form, terms: e.target.value })} />
          </div>
          {editingId && <SwitchField checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} label="Activo" />}
        </div>
      </AppDialog>
    </Section>
  );
}

function TeamSection() {
  const { companyId, isAdmin } = useCompany();
  const { user } = useAuth();
  const team = useTeam(companyId);
  const invitations = useInvitations(isAdmin ? companyId : undefined);
  const toast = useToast();
  const [role, setRole] = useState("edit");
  const [email, setEmail] = useState("");
  const [link, setLink] = useState<string | null>(null);

  const invite = async () => {
    try {
      const token = await rpc<string>("create_member_invitation", { p_role: role, p_email: email.trim() || null });
      setLink(`${window.location.origin}/invitacion/${token}`);
      void invalidate("company_invitations");
    } catch (err) {
      toast.error("No se pudo crear la invitación", friendlyError(err));
    }
  };

  const changeRole = async (userId: string, newRole: string) => {
    try {
      await rpc("update_member_role", { p_user_id: userId, p_role: newRole });
      toast.success("Rol actualizado");
      void invalidate("team");
    } catch (err) {
      toast.error("No se pudo cambiar el rol", friendlyError(err));
    }
  };

  const remove = async (userId: string) => {
    if (!window.confirm("¿Quitar a esta persona de la empresa? Perderá el acceso de inmediato.")) return;
    try {
      await rpc("remove_member", { p_user_id: userId });
      toast.success("Usuario retirado");
      void invalidate("team");
    } catch (err) {
      toast.error("No se pudo retirar", friendlyError(err));
    }
  };

  const pending = (invitations.data ?? []).filter((i: any) => i.kind === "member" && new Date(i.expires_at) > new Date());

  return (
    <div className="grid gap-4">
      <Section title="Miembros del equipo">
        <RowsTable
          rows={team.data ?? []}
          rowKey={(m) => m.user_id}
          columns={[
            { key: "name", header: "Persona", cell: (m) => <div><p className="font-medium">{m.full_name || "Sin nombre"}</p><p className="text-xs text-muted-foreground">{m.email}</p></div> },
            { key: "since", header: "Desde", cell: (m) => formatDate(m.created_at) },
            { key: "role", header: "Rol", cell: (m) =>
              isAdmin && m.user_id !== user?.id ? (
                <NativeSelect className="w-40" value={m.role} onValueChange={(v) => changeRole(m.user_id, v)} options={Object.entries(es.roles).map(([value, label]) => ({ value, label }))} />
              ) : (
                <Badge tone={m.role === "admin" ? "brand" : "neutral"}>{es.roles[m.role]}</Badge>
              ) },
            { key: "remove", header: "", align: "right", cell: (m) => isAdmin && m.user_id !== user?.id && <Button variant="ghost" size="icon-sm" aria-label="Quitar" onClick={() => remove(m.user_id)}><Trash2 className="h-4 w-4 text-red-400" /></Button> },
          ]}
        />
      </Section>

      {isAdmin && (
        <Section title="Invitar al equipo" description="Genera un enlace de un solo uso. Lectura: puede ver todo pero no modificar. Editor: puede registrar operaciones. Administrador: además cambia la configuración y el equipo.">
          <div className="grid gap-4 md:grid-cols-[1fr_200px_auto] md:items-end">
            <FormField label="Correo (recomendado)" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            <NativeSelectField label="Rol" value={role} onValueChange={setRole} options={Object.entries(es.roles).map(([value, label]) => ({ value, label }))} />
            <Button onClick={invite}>Generar enlace</Button>
          </div>
          {link && (
            <Callout tone="success" className="mt-4" title="Enlace de invitación">
              <div className="mt-1 flex items-center gap-2">
                <code className="min-w-0 flex-1 truncate rounded bg-muted px-2 py-1 text-xs text-foreground">{link}</code>
                <Button variant="outline" size="sm" onClick={() => { void navigator.clipboard.writeText(link); toast.success("Enlace copiado"); }}><Copy className="h-4 w-4" /> Copiar</Button>
              </div>
            </Callout>
          )}
          {pending.length > 0 && (
            <ul className="mt-4 grid gap-2 text-sm">
              {pending.map((i: any) => (
                <li key={i.id} className="flex items-center justify-between rounded-lg border px-3 py-2">
                  <span>{i.email ?? "Enlace abierto"} · {es.roles[i.role]} <span className="text-xs text-muted-foreground">vence {formatDate(i.expires_at)}</span></span>
                  <Button variant="ghost" size="sm" onClick={() => rpc("revoke_invitation", { p_invitation_id: i.id }).then(() => invalidate("company_invitations")).catch((err) => toast.error("No se pudo revocar", friendlyError(err)))}>Revocar</Button>
                </li>
              ))}
            </ul>
          )}
        </Section>
      )}
    </div>
  );
}
