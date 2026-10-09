'use client';

import { useMemo, useState } from "react";
import { PackagePlus, Plus, Trash2 } from "lucide-react";
import { friendlyError } from "@/lib/errors";
import { formatDate, formatMoney, formatNumber, formatPercent, parseInput } from "@/lib/format";
import { invalidate, rpc, useCompany, useMaterials, usePriceHistory, useProducts } from "@/lib/data/hooks";
import type { ProductRecord } from "@/lib/data/mappers";
import { computeProductCost, marginOnPrice, priceForMargin, resolveDistributorPrice, round2 } from "@/lib/domain/costing";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Callout, EmptyState, ErrorState, LoadingState, PageHeader, Section } from "@/components/ui/page";
import { SwitchField } from "@/components/ui/switch";
import { TextareaField } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toaster";
import { cn } from "@/lib/utils";
import { es } from "@/i18n/es";

interface RecipeRow {
  key: string;
  materialId: string;
  quantity: string;
}

interface Draft {
  id: string | null;
  name: string;
  sku: string;
  category: string;
  description: string;
  batchSize: string;
  hours: string;
  laborPerPiece: string;
  retailPrice: string;
  distributorAuto: boolean;
  distributorPrice: string;
  isActive: boolean;
  openingStock: string;
  recipe: RecipeRow[];
}

const newDraft = (): Draft => ({
  id: null,
  name: "",
  sku: "",
  category: "",
  description: "",
  batchSize: "1",
  hours: "0",
  laborPerPiece: "0",
  retailPrice: "",
  distributorAuto: true,
  distributorPrice: "",
  isActive: true,
  openingStock: "0",
  recipe: [],
});

function toDraft(p: ProductRecord): Draft {
  return {
    id: p.id,
    name: p.name,
    sku: p.sku ?? "",
    category: p.category ?? "",
    description: p.description ?? "",
    batchSize: String(p.batchSize),
    hours: String(p.productionTimeHours),
    laborPerPiece: String(p.laborCostPerPiece),
    retailPrice: p.retailPrice ? String(p.retailPrice) : "",
    distributorAuto: p.distributorPrice === null,
    distributorPrice: p.distributorPrice === null ? "" : String(p.distributorPrice),
    isActive: p.isActive,
    openingStock: "0",
    recipe: p.recipe.map((r, i) => ({ key: `${r.materialId}-${i}`, materialId: r.materialId, quantity: String(r.quantity) })),
  };
}

export default function ProductsPage() {
  const { companyId, canEdit, currency, settings } = useCompany();
  const products = useProducts(companyId);
  const materials = useMaterials(companyId);
  const priceHistory = usePriceHistory(companyId);
  const toast = useToast();

  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Draft | null>(null);
  const [targetMargin, setTargetMargin] = useState("55");
  const [saving, setSaving] = useState(false);

  const laborMode = settings?.laborMode ?? "salary";
  const piece = laborMode === "piece";

  // Until the user picks a product, show the first one
  const defaultDraft = useMemo(() => (products.data && products.data.length > 0 ? toDraft(products.data[0]) : null), [products.data]);
  const draft = editing ?? defaultDraft;
  const setDraft = setEditing;

  const materialById = useMemo(() => new Map((materials.data ?? []).map((m) => [m.id, m])), [materials.data]);
  const costSettings = useMemo(
    () =>
      settings
        ? { laborCostPerHour: settings.laborCostPerHour, indirectCostReserve: settings.indirectCostReserve, laborMode: settings.laborMode }
        : { laborCostPerHour: 0, indirectCostReserve: 0, laborMode: "salary" as const },
    [settings]
  );

  const preview = useMemo(() => {
    if (!draft) return null;
    const recipe = draft.recipe
      .map((r) => ({ materialId: r.materialId, quantity: parseInput(r.quantity) ?? 0 }))
      .filter((r) => r.materialId && r.quantity > 0);
    const cost = computeProductCost(
      {
        batchSize: parseInput(draft.batchSize) ?? 0,
        productionTimeHours: parseInput(draft.hours) ?? 0,
        laborCostPerPiece: parseInput(draft.laborPerPiece) ?? 0,
        recipe,
      },
      (id) => materialById.get(id)?.costPerUnit ?? 0,
      costSettings
    );
    const retail = parseInput(draft.retailPrice) ?? 0;
    const distributor = draft.distributorAuto
      ? resolveDistributorPrice(retail, null, null, settings?.distributorMargin ?? 0)
      : parseInput(draft.distributorPrice) ?? 0;
    return { recipe, cost, retail, distributor };
  }, [draft, materialById, costSettings, settings?.distributorMargin]);

  const filtered = (products.data ?? []).filter((p) => `${p.name} ${p.sku ?? ""} ${p.category ?? ""}`.toLowerCase().includes(search.toLowerCase()));
  const currentProduct = draft?.id ? products.data?.find((p) => p.id === draft.id) : null;

  const save = async () => {
    if (!draft || !preview) return;
    if (!draft.name.trim()) return toast.error("El producto necesita un nombre.");
    if (!(parseInput(draft.batchSize)! > 0)) return toast.error("El tamaño de lote debe ser mayor que cero.");
    if (draft.recipe.some((r) => !r.materialId || !(parseInput(r.quantity)! > 0))) return toast.error("Completa cada línea de la receta con una materia prima y una cantidad.");
    setSaving(true);
    try {
      const id = await rpc<string>("save_product", {
        p_product_id: draft.id,
        p_data: {
          name: draft.name,
          sku: draft.sku,
          category: draft.category,
          description: draft.description,
          batch_size: parseInput(draft.batchSize),
          production_time_hours: parseInput(draft.hours) ?? 0,
          labor_cost_per_piece: parseInput(draft.laborPerPiece) ?? 0,
          retail_price: preview.retail,
          distributor_price: draft.distributorAuto ? null : parseInput(draft.distributorPrice),
          is_active: draft.isActive,
          opening_stock: draft.id ? undefined : parseInput(draft.openingStock) ?? 0,
        },
        p_bom: preview.recipe.map((r) => ({ material_id: r.materialId, quantity: r.quantity })),
      });
      toast.success(draft.id ? "Producto actualizado" : "Producto creado");
      await invalidate("products", "product_price_history", "inventory_transactions");
      setDraft({ ...draft, id });
    } catch (err) {
      toast.error("No se pudo guardar", friendlyError(err));
    } finally {
      setSaving(false);
    }
  };

  if (products.isLoading || materials.isLoading) return <LoadingState />;
  if (products.error) return <ErrorState message={friendlyError(products.error)} onRetry={() => products.mutate()} />;

  const target = (parseInput(targetMargin) ?? 0) / 100;
  const suggested = preview && target > 0 && target < 1 ? round2(priceForMargin(preview.cost.full, target)) : null;
  const update = (patch: Partial<Draft>) => setDraft((d) => {
    const base = d ?? draft;
    return base ? { ...base, ...patch } : base;
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Productos y recetas"
        description="Define la receta de cada producto. El costo se calcula solo con los costos actuales de tus materias primas; el precio lo decides tú."
        actions={canEdit && <Button onClick={() => setDraft(newDraft())}><PackagePlus className="h-4 w-4" /> Nuevo producto</Button>}
      />

      {(materials.data ?? []).length === 0 && (
        <Callout tone="warning" title="Primero registra tus materias primas">Las recetas se arman con materias primas. Ve a «Materias primas» y agrega tus insumos.</Callout>
      )}

      {(products.data ?? []).length === 0 && !draft ? (
        <EmptyState title="Aún no tienes productos" description="Crea tu primer producto con su receta para conocer su costo real." action={canEdit && <Button onClick={() => setDraft(newDraft())}><Plus className="h-4 w-4" /> Crear producto</Button>} />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
          {/* Product list */}
          <div className="flex flex-col gap-2">
            <Input type="search" placeholder="Buscar producto…" value={search} onChange={(e) => setSearch(e.target.value)} />
            <div className="flex max-h-[70vh] flex-col gap-1 overflow-y-auto rounded-xl border bg-card p-1.5">
              {filtered.map((p) => {
                const margin = marginOnPrice(p.retailPrice, p.fullUnitCost);
                return (
                  <button
                    key={p.id}
                    onClick={() => setDraft(toDraft(p))}
                    className={cn("rounded-lg px-3 py-2 text-left transition-colors hover:bg-muted", draft?.id === p.id && "bg-brand/10 ring-1 ring-brand/30")}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className={cn("truncate text-sm font-medium", !p.isActive && "text-muted-foreground line-through")}>{p.name}</span>
                      {piece && p.laborCostPerPiece <= 0 ? (
                        <Badge tone="warning">Sin tarifa</Badge>
                      ) : (
                        p.retailPrice > 0 && <span className={cn("text-xs tabular-nums", margin < 0.3 ? "text-red-400" : "text-muted-foreground")}>{formatPercent(margin, 0)}</span>
                      )}
                    </div>
                    <p className="truncate text-xs text-muted-foreground">{[p.sku, p.category].filter(Boolean).join(" · ") || "Sin SKU"}</p>
                  </button>
                );
              })}
              {filtered.length === 0 && <p className="p-3 text-sm text-muted-foreground">Sin resultados.</p>}
            </div>
          </div>

          {/* Editor */}
          {draft && preview && (
            <div className="flex min-w-0 flex-col gap-4">
              <Section
                title={draft.id ? draft.name || "Producto" : "Nuevo producto"}
                actions={canEdit && <Button onClick={save} disabled={saving} className="bg-brand text-brand-foreground hover:bg-brand/90">{saving ? "Guardando…" : "Guardar cambios"}</Button>}
              >
                <div className="grid gap-4 md:grid-cols-2">
                  <FormField label="Nombre" value={draft.name} onChange={(e) => update({ name: e.target.value })} disabled={!canEdit} />
                  <div className="grid grid-cols-2 gap-4">
                    <FormField label="SKU" value={draft.sku} onChange={(e) => update({ sku: e.target.value })} disabled={!canEdit} />
                    <FormField label="Categoría" value={draft.category} onChange={(e) => update({ category: e.target.value })} disabled={!canEdit} />
                  </div>
                  <TextareaField label="Descripción (visible para distribuidores)" containerClassName="md:col-span-2" rows={2} value={draft.description} onChange={(e) => update({ description: e.target.value })} disabled={!canEdit} />
                </div>
              </Section>

              <div className="grid gap-4 xl:grid-cols-[1fr_320px]">
                <Section title="Receta por lote" description="Cantidad de cada materia prima para producir un lote completo.">
                  <div className={cn("mb-4 grid gap-4", piece ? "grid-cols-1 sm:grid-cols-3 sm:max-w-2xl" : "grid-cols-2 sm:max-w-md")}>
                    <FormField label="Unidades por lote" inputMode="decimal" value={draft.batchSize} onChange={(e) => update({ batchSize: e.target.value })} disabled={!canEdit} />
                    <FormField
                      label={piece ? "Horas por lote (referencia)" : "Horas de trabajo por lote"}
                      inputMode="decimal"
                      value={draft.hours}
                      onChange={(e) => update({ hours: e.target.value })}
                      disabled={!canEdit}
                    />
                    {piece && (
                      <FormField
                        error={(parseInput(draft.laborPerPiece) ?? 0) <= 0 ? "Sin tarifa: el costo no incluye mano de obra." : undefined}
                        label={`Pago por unidad producida (${currency})`}
                        inputMode="decimal"
                        value={draft.laborPerPiece}
                        onChange={(e) => update({ laborPerPiece: e.target.value })}
                        disabled={!canEdit}
                        description="Lo que pagas a destajo por cada unidad terminada."
                      />
                    )}
                  </div>
                  <div className="overflow-x-auto rounded-lg border">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/40 text-muted-foreground">
                        <tr>
                          <th className="px-3 py-2 text-left font-medium">Materia prima</th>
                          <th className="px-3 py-2 text-right font-medium">Cantidad por lote</th>
                          <th className="px-3 py-2 text-right font-medium">Costo por lote</th>
                          <th className="px-3 py-2 text-right font-medium">Por unidad</th>
                          <th className="w-10" />
                        </tr>
                      </thead>
                      <tbody>
                        {draft.recipe.map((row, idx) => {
                          const m = materialById.get(row.materialId);
                          const qty = parseInput(row.quantity) ?? 0;
                          const batchCost = m ? qty * m.costPerUnit : 0;
                          const batch = parseInput(draft.batchSize) ?? 0;
                          return (
                            <tr key={row.key} className="border-t">
                              <td className="px-3 py-1.5">
                                <NativeSelect
                                  aria-label="Materia prima"
                                  placeholder="Selecciona…"
                                  value={row.materialId}
                                  disabled={!canEdit}
                                  onValueChange={(v) => update({ recipe: draft.recipe.map((r, i) => (i === idx ? { ...r, materialId: v } : r)) })}
                                  options={(materials.data ?? []).filter((x) => x.isActive || x.id === row.materialId).map((x) => ({ value: x.id, label: `${x.name} (${x.unit})` }))}
                                />
                              </td>
                              <td className="px-3 py-1.5">
                                <div className="flex items-center justify-end gap-1.5">
                                  <Input className="w-24 text-right" inputMode="decimal" aria-label="Cantidad" value={row.quantity} disabled={!canEdit} onChange={(e) => update({ recipe: draft.recipe.map((r, i) => (i === idx ? { ...r, quantity: e.target.value } : r)) })} />
                                  <span className="w-8 text-xs text-muted-foreground">{m?.unit}</span>
                                </div>
                              </td>
                              <td className="px-3 py-1.5 text-right tabular-nums">{formatMoney(batchCost, currency)}</td>
                              <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">{batch > 0 ? formatMoney(batchCost / batch, currency) : "—"}</td>
                              <td className="px-1 py-1.5">
                                {canEdit && (
                                  <Button variant="ghost" size="icon-sm" aria-label="Quitar" onClick={() => update({ recipe: draft.recipe.filter((_, i) => i !== idx) })}>
                                    <Trash2 className="h-4 w-4 text-muted-foreground" />
                                  </Button>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                        {draft.recipe.length === 0 && (
                          <tr><td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">La receta está vacía.</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                  {canEdit && (
                    <Button variant="outline" size="sm" className="mt-3" onClick={() => update({ recipe: [...draft.recipe, { key: `new-${Date.now()}`, materialId: "", quantity: "" }] })}>
                      <Plus className="h-4 w-4" /> Agregar materia prima
                    </Button>
                  )}
                </Section>

                <Section title="Costo por unidad">
                  <dl className="grid gap-2 text-sm">
                    <CostRow label="Materiales" value={formatMoney(preview.cost.material, currency)} />
                    <CostRow label={`Mano de obra (${es.laborModes[laborMode].short})`} value={formatMoney(preview.cost.labor, currency)} />
                    <CostRow label={`Reserva de gastos indirectos (${formatPercent(settings?.indirectCostReserve ?? 0, 0)})`} value={formatMoney(preview.cost.overhead, currency)} />
                    <div className="my-1 border-t" />
                    <CostRow label="Costo completo (para fijar precio)" value={formatMoney(preview.cost.full, currency)} strong />
                    <CostRow label="Costo de lo vendido (contable)" value={formatMoney(preview.cost.variable, currency)} muted />
                  </dl>
                  <p className="mt-3 text-xs text-muted-foreground">
                    {laborMode === "salary"
                      ? "La mano de obra está configurada como salario fijo: se usa para fijar precios, pero el salario se registra en Gastos para no contarlo dos veces."
                      : laborMode === "hourly"
                        ? "La mano de obra se paga por hora, por eso forma parte del costo de lo vendido."
                        : "La mano de obra se paga por pieza producida, por eso forma parte del costo de lo vendido."}{" "}
                    Puedes cambiar el modo en Configuración.
                  </p>
                </Section>
              </div>

              <Section title="Precios y márgenes">
                <div className="grid gap-6 lg:grid-cols-2">
                  <div className="grid gap-4">
                    <FormField label={`Precio de lista (${currency})`} inputMode="decimal" value={draft.retailPrice} onChange={(e) => update({ retailPrice: e.target.value })} disabled={!canEdit} />
                    <SwitchField
                      checked={draft.distributorAuto}
                      onCheckedChange={(v) => update({ distributorAuto: v, distributorPrice: v ? "" : String(preview.distributor || "") })}
                      label="Precio de distribuidor automático"
                      description={`Precio de lista menos ${formatPercent(settings?.distributorMargin ?? 0, 0)} (configurable en Configuración). Los descuentos por distribuidor tienen prioridad.`}
                      disabled={!canEdit}
                    />
                    {!draft.distributorAuto && (
                      <FormField label={`Precio de distribuidor (${currency})`} inputMode="decimal" value={draft.distributorPrice} onChange={(e) => update({ distributorPrice: e.target.value })} disabled={!canEdit} />
                    )}
                    {!draft.id && (
                      <FormField label="Existencia inicial (unidades)" inputMode="decimal" value={draft.openingStock} onChange={(e) => update({ openingStock: e.target.value })} description="Producto terminado que ya tienes en inventario." />
                    )}
                    {draft.id && <SwitchField checked={draft.isActive} onCheckedChange={(v) => update({ isActive: v })} label="Activo" description="Los inactivos no aparecen en ventas ni en el catálogo de distribuidores." disabled={!canEdit} />}
                  </div>

                  <div className="grid content-start gap-3">
                    <MarginCard label="Venta directa (precio de lista)" price={preview.retail} cost={preview.cost.full} currency={currency} />
                    <MarginCard label="Distribuidor" price={preview.distributor} cost={preview.cost.full} currency={currency} />
                    <div className="rounded-lg border p-3">
                      <div className="flex items-end gap-3">
                        <FormField label="Margen objetivo (%)" inputMode="decimal" containerClassName="w-36" value={targetMargin} onChange={(e) => setTargetMargin(e.target.value)} />
                        <div className="pb-1 text-sm">
                          <p className="text-muted-foreground">Precio necesario</p>
                          <p className="font-semibold tabular-nums">{suggested ? formatMoney(suggested, currency) : "—"}</p>
                        </div>
                        {canEdit && suggested && (
                          <Button variant="outline" size="sm" className="mb-1 ml-auto" onClick={() => update({ retailPrice: String(suggested) })}>Usar</Button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </Section>

              {currentProduct && (
                <div className="grid gap-4 md:grid-cols-2">
                  <Section title="Inventario y costo real">
                    <dl className="grid gap-2 text-sm">
                      <CostRow label="Existencia" value={`${formatNumber(currentProduct.currentStock)} unidades`} />
                      <CostRow label="Costo real promedio (de producción)" value={currentProduct.avgUnitCost === null ? "Sin producción registrada" : formatMoney(currentProduct.avgUnitCost, currency)} />
                      <CostRow label="Costo estándar (receta)" value={formatMoney(currentProduct.variableUnitCost, currency)} />
                    </dl>
                  </Section>
                  <Section title="Historial de precios">
                    <ul className="grid gap-1.5 text-sm">
                      {(priceHistory.data ?? []).filter((h) => h.productId === currentProduct.id).slice(-6).reverse().map((h) => (
                        <li key={h.effectiveAt} className="flex justify-between">
                          <span className="text-muted-foreground">{formatDate(h.effectiveAt)}</span>
                          <span className="tabular-nums">{formatMoney(h.retailPrice, currency)}{h.distributorPrice !== null ? ` · dist. ${formatMoney(h.distributorPrice, currency)}` : ""}</span>
                        </li>
                      ))}
                    </ul>
                  </Section>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function CostRow({ label, value, strong, muted }: { label: string; value: string; strong?: boolean; muted?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className={cn("text-muted-foreground", strong && "text-foreground font-medium")}>{label}</dt>
      <dd className={cn("tabular-nums", strong && "font-semibold", muted && "text-muted-foreground")}>{value}</dd>
    </div>
  );
}

function MarginCard({ label, price, cost, currency }: { label: string; price: number; cost: number; currency: string }) {
  const margin = marginOnPrice(price, cost);
  const tone = price <= 0 ? "neutral" : margin < 0 ? "danger" : margin < 0.3 ? "warning" : "success";
  return (
    <div className="flex items-center justify-between rounded-lg border p-3">
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-lg font-semibold tabular-nums">{price > 0 ? formatMoney(price, currency) : "Sin precio"}</p>
      </div>
      <div className="text-right">
        <Badge tone={tone}>{price > 0 ? `Margen ${formatPercent(margin)}` : "—"}</Badge>
        <p className="mt-1 text-xs text-muted-foreground tabular-nums">{price > 0 ? `${formatMoney(price - cost, currency)} por unidad` : ""}</p>
      </div>
    </div>
  );
}
