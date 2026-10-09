'use client';

import { useMemo, useState } from "react";
import { History, Pencil, Plus } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { friendlyError } from "@/lib/errors";
import { formatDate, formatMoney, formatNumber, formatPercent, parseInput } from "@/lib/format";
import { invalidate, useCompany, useCostHistory, useMaterials, useProducts, useSuppliers } from "@/lib/data/hooks";
import type { MaterialRecord } from "@/lib/data/mappers";
import { RowsTable } from "@/components/app/RowsTable";
import { AppDialog } from "@/components/ui/app-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { NativeSelectField } from "@/components/ui/native-select";
import { Callout, EmptyState, ErrorState, LoadingState, PageHeader } from "@/components/ui/page";
import { SwitchField } from "@/components/ui/switch";
import { useToast } from "@/components/ui/toaster";

interface FormState {
  name: string;
  category: string;
  unit: string;
  cost: string;
  supplierId: string;
  reorder: string;
  leadTime: string;
  stock: string;
  isActive: boolean;
}

const emptyForm: FormState = { name: "", category: "", unit: "", cost: "", supplierId: "", reorder: "0", leadTime: "", stock: "0", isActive: true };

export default function MaterialsPage() {
  const { companyId, canEdit, currency } = useCompany();
  const materials = useMaterials(companyId);
  const products = useProducts(companyId);
  const suppliers = useSuppliers(companyId);
  const history = useCostHistory(companyId);
  const toast = useToast();

  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<MaterialRecord | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [historyFor, setHistoryFor] = useState<MaterialRecord | null>(null);

  const usage = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const p of products.data ?? []) {
      for (const r of p.recipe) map.set(r.materialId, [...(map.get(r.materialId) ?? []), p.name]);
    }
    return map;
  }, [products.data]);

  const rows = useMemo(
    () => (materials.data ?? []).filter((m) => `${m.name} ${m.category} ${m.supplierName ?? ""}`.toLowerCase().includes(search.toLowerCase())),
    [materials.data, search]
  );

  const openForm = (m: MaterialRecord | null) => {
    setEditing(m);
    setForm(
      m
        ? {
            name: m.name,
            category: m.category,
            unit: m.unit,
            cost: String(m.costPerUnit),
            supplierId: m.supplierId ?? "",
            reorder: String(m.reorderPoint),
            leadTime: m.leadTimeDays === null ? "" : String(m.leadTimeDays),
            stock: String(m.currentStock),
            isActive: m.isActive,
          }
        : emptyForm
    );
    setOpen(true);
  };

  const save = async () => {
    const cost = parseInput(form.cost);
    if (!form.name.trim() || !form.unit.trim() || cost === null || cost < 0) {
      toast.error("Completa nombre, unidad y un costo válido.");
      return;
    }
    setSaving(true);
    const supplierName = suppliers.data?.find((s) => s.id === form.supplierId)?.name ?? null;
    const payload = {
      name: form.name.trim(),
      category: form.category.trim() || "General",
      unit_of_measure: form.unit.trim(),
      cost_per_unit: cost,
      supplier_id: form.supplierId || null,
      supplier: supplierName,
      reorder_point: parseInput(form.reorder) ?? 0,
      lead_time_days: form.leadTime === "" ? null : parseInput(form.leadTime),
      is_active: form.isActive,
    };
    const { error } = editing
      ? await supabase.from("materials").update(payload).eq("id", editing.id)
      : await supabase.from("materials").insert({ ...payload, company_id: companyId, current_stock: parseInput(form.stock) ?? 0 });
    setSaving(false);
    if (error) {
      toast.error("No se pudo guardar", friendlyError(error));
      return;
    }
    toast.success(editing ? "Materia prima actualizada" : "Materia prima creada", editing && cost !== editing.costPerUnit ? "El cambio de costo quedó registrado y los costos de los productos se recalcularon." : undefined);
    setOpen(false);
    void invalidate("materials", "products", "material_cost_history");
  };

  if (materials.isLoading) return <LoadingState />;
  if (materials.error) return <ErrorState message={friendlyError(materials.error)} onRetry={() => materials.mutate()} />;

  const costChanged = editing && parseInput(form.cost) !== null && parseInput(form.cost) !== editing.costPerUnit;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Materias primas"
        description="Insumos, unidades y costos. Cada cambio de costo queda registrado y se refleja al instante en el costo de tus productos."
        actions={canEdit && <Button onClick={() => openForm(null)}><Plus className="h-4 w-4" /> Nueva materia prima</Button>}
      />

      {(materials.data ?? []).length === 0 ? (
        <EmptyState
          title="Aún no tienes materias primas"
          description="Registra tus insumos (cera, fragancias, envases, etiquetas…) con su unidad y costo. Luego los usarás en las recetas de tus productos."
          action={canEdit && <Button onClick={() => openForm(null)}><Plus className="h-4 w-4" /> Agregar la primera</Button>}
        />
      ) : (
        <>
          <Input type="search" placeholder="Buscar por nombre, categoría o proveedor…" className="max-w-sm" value={search} onChange={(e) => setSearch(e.target.value)} />
          <RowsTable
            rows={rows}
            rowKey={(m) => m.id}
            initialSort={{ key: "name", dir: "asc" }}
            rowClassName={(m) => (!m.isActive ? "opacity-50" : undefined)}
            columns={[
              { key: "name", header: "Materia prima", sortValue: (m) => m.name, cell: (m) => (
                <div>
                  <p className="font-medium">{m.name}</p>
                  <p className="text-xs text-muted-foreground">{m.category}{m.supplierName ? ` · ${m.supplierName}` : ""}</p>
                </div>
              ) },
              { key: "cost", header: "Costo de reposición", align: "right", sortValue: (m) => m.costPerUnit, cell: (m) => `${formatMoney(m.costPerUnit, currency, { decimals: m.costPerUnit < 1 ? 4 : 2 })} / ${m.unit}` },
              { key: "avg", header: "Costo promedio", align: "right", sortValue: (m) => m.avgCost, cell: (m) => formatMoney(m.avgCost, currency, { decimals: m.avgCost < 1 ? 4 : 2 }) },
              { key: "stock", header: "Existencia", align: "right", sortValue: (m) => m.currentStock, cell: (m) => (
                <span className={m.currentStock <= m.reorderPoint ? "text-amber-400" : undefined}>{formatNumber(m.currentStock)} {m.unit}</span>
              ) },
              { key: "value", header: "Valor", align: "right", sortValue: (m) => m.currentStock * m.avgCost, cell: (m) => formatMoney(m.currentStock * m.avgCost, currency) },
              { key: "used", header: "Usada en", cell: (m) => {
                const list = usage.get(m.id) ?? [];
                return list.length ? <span className="text-xs text-muted-foreground">{list.length} producto{list.length > 1 ? "s" : ""}</span> : <Badge>Sin uso</Badge>;
              } },
              { key: "actions", header: "", align: "right", cell: (m) => (
                <div className="flex justify-end gap-1">
                  <Button variant="ghost" size="icon-sm" aria-label="Historial de costos" onClick={() => setHistoryFor(m)}><History className="h-4 w-4" /></Button>
                  {canEdit && <Button variant="ghost" size="icon-sm" aria-label="Editar" onClick={() => openForm(m)}><Pencil className="h-4 w-4" /></Button>}
                </div>
              ) },
            ]}
          />
        </>
      )}

      <AppDialog
        open={open}
        onOpenChange={setOpen}
        title={editing ? `Editar ${editing.name}` : "Nueva materia prima"}
        maxWidthClass="sm:max-w-lg"
        footer={<><Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button><Button onClick={save} disabled={saving}>{saving ? "Guardando…" : "Guardar"}</Button></>}
      >
        <div className="grid gap-4">
          <FormField label="Nombre" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ej. Cera de soya" />
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Categoría" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="Cera, Fragancia, Envase…" />
            <FormField label="Unidad de medida" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} placeholder="g, ml, unidad" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <FormField label={`Costo por unidad (${currency})`} inputMode="decimal" value={form.cost} onChange={(e) => setForm({ ...form, cost: e.target.value })} description="Lo que pagas hoy por reponerla." />
            <NativeSelectField
              label="Proveedor"
              placeholder="Sin proveedor"
              value={form.supplierId}
              onValueChange={(v) => setForm({ ...form, supplierId: v })}
              options={(suppliers.data ?? []).map((s) => ({ value: s.id, label: s.name }))}
            />
          </div>
          {costChanged && editing && (
            <Callout tone="info">
              El costo cambia {formatPercent((parseInput(form.cost)! - editing.costPerUnit) / (editing.costPerUnit || 1), 1, { signed: true })}. Afecta a {(usage.get(editing.id) ?? []).length} producto(s); verás el impacto en «Impacto de costos».
            </Callout>
          )}
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Punto de reorden" inputMode="decimal" value={form.reorder} onChange={(e) => setForm({ ...form, reorder: e.target.value })} description="Existencia mínima antes de comprar." />
            <FormField label="Tiempo de entrega (días)" inputMode="numeric" value={form.leadTime} onChange={(e) => setForm({ ...form, leadTime: e.target.value })} description="Vacío = el del proveedor." />
          </div>
          {!editing ? (
            <FormField label="Existencia inicial" inputMode="decimal" value={form.stock} onChange={(e) => setForm({ ...form, stock: e.target.value })} description="Después, la existencia cambia con compras, producción y ajustes." />
          ) : (
            <SwitchField checked={form.isActive} onCheckedChange={(v) => setForm({ ...form, isActive: v })} label="Activa" description="Las inactivas no aparecen al crear compras ni recetas." />
          )}
        </div>
      </AppDialog>

      <AppDialog open={!!historyFor} onOpenChange={(o) => !o && setHistoryFor(null)} title={`Historial de costos · ${historyFor?.name ?? ""}`} maxWidthClass="sm:max-w-lg">
        <RowsTable
          dense
          rows={(history.data ?? []).filter((h) => h.materialId === historyFor?.id).reverse()}
          rowKey={(h) => `${h.effectiveAt}-${h.newCost}`}
          empty="Sin cambios registrados."
          columns={[
            { key: "date", header: "Fecha", cell: (h) => formatDate(h.effectiveAt) },
            { key: "cost", header: "Costo", align: "right", cell: (h) => formatMoney(h.newCost, currency, { decimals: h.newCost < 1 ? 4 : 2 }) },
            { key: "change", header: "Cambio", align: "right", cell: (h) => h.previousCost ? formatPercent((h.newCost - h.previousCost) / h.previousCost, 1, { signed: true }) : "—" },
            { key: "source", header: "Origen", cell: (h) => ({ initial: "Inicial", manual: "Edición manual", purchase: "Compra" })[h.source] },
          ]}
        />
      </AppDialog>
    </div>
  );
}
