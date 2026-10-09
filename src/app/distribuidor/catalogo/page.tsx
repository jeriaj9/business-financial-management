'use client';

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Minus, Plus, ShoppingCart, Trash2 } from "lucide-react";
import { friendlyError } from "@/lib/errors";
import { formatMoney, formatPercent } from "@/lib/format";
import { addDays, today } from "@/lib/domain/dates";
import { portalCall, usePortalCatalog, usePortalStatement } from "@/lib/data/portal";
import { invalidate } from "@/lib/data/hooks";
import { usePortalAccount } from "@/components/portal/PortalShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Callout, EmptyState, ErrorState, LoadingState } from "@/components/ui/page";
import { TextareaField } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toaster";

type Cart = Record<string, number>;

export default function CatalogPage() {
  const account = usePortalAccount();
  const router = useRouter();
  const toast = useToast();
  const catalog = usePortalCatalog(account.distributor_id);
  const statement = usePortalStatement(account.distributor_id);
  const cartKey = `portal:cart:${account.distributor_id}`;
  const currency = account.currency;

  const [cart, setCart] = useState<Cart>(() => {
    if (typeof window === "undefined") return {};
    try {
      const saved = window.localStorage.getItem(cartKey);
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [notes, setNotes] = useState("");
  const [requestedDate, setRequestedDate] = useState("");
  const [sending, setSending] = useState(false);

  // Keep the cart across visits on this device
  useEffect(() => {
    try {
      window.localStorage.setItem(cartKey, JSON.stringify(cart));
    } catch {
      // ignore
    }
  }, [cart, cartKey]);

  const items = useMemo(() => catalog.data ?? [], [catalog.data]);
  const categories = useMemo(() => [...new Set(items.map((i) => i.category).filter(Boolean))] as string[], [items]);
  const visible = items.filter((i) => (!category || i.category === category) && `${i.name} ${i.sku ?? ""}`.toLowerCase().includes(search.toLowerCase()));
  const lines = items.filter((i) => (cart[i.product_id] ?? 0) > 0).map((i) => ({ ...i, quantity: cart[i.product_id] }));
  const total = lines.reduce((s, l) => s + l.quantity * l.unit_price, 0);
  const retailValue = lines.reduce((s, l) => s + l.quantity * l.suggested_retail_price, 0);
  const available = statement.data?.summary.available_credit ?? null;

  const setQty = (productId: string, qty: number) => setCart((c) => {
    const next = { ...c };
    if (qty > 0) next[productId] = Math.floor(qty);
    else delete next[productId];
    return next;
  });

  const submit = async () => {
    if (lines.length === 0) return;
    setSending(true);
    try {
      await portalCall("portal_submit_order", {
        p_distributor_id: account.distributor_id,
        p_lines: lines.map((l) => ({ product_id: l.product_id, quantity: l.quantity })),
        p_notes: notes || null,
        p_requested_date: requestedDate || null,
      });
      setCart({});
      setNotes("");
      toast.success("Pedido enviado", `${account.company_name} lo revisará y te avisará por este portal.`);
      void invalidate("portal_orders");
      router.push("/distribuidor/pedidos");
    } catch (err) {
      toast.error("No se pudo enviar el pedido", friendlyError(err));
    } finally {
      setSending(false);
    }
  };

  if (catalog.isLoading) return <LoadingState label="Cargando catálogo…" />;
  if (catalog.error) return <ErrorState message={friendlyError(catalog.error)} onRetry={() => catalog.mutate()} />;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <div className="flex flex-col gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Catálogo</h1>
          <p className="text-sm text-muted-foreground">Precios para {account.distributor_name}. El margen sugerido usa el precio de venta al público recomendado.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Input type="search" className="max-w-xs" placeholder="Buscar producto…" value={search} onChange={(e) => setSearch(e.target.value)} />
          {categories.length > 1 && <NativeSelect className="w-44" aria-label="Categoría" value={category} onValueChange={setCategory} options={[{ value: "", label: "Todas las categorías" }, ...categories.map((c) => ({ value: c, label: c }))]} />}
        </div>

        {items.length === 0 ? (
          <EmptyState title="El catálogo está vacío" description="Tu proveedor aún no tiene productos publicados." />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {visible.map((item) => {
              const qty = cart[item.product_id] ?? 0;
              const margin = item.suggested_retail_price > 0 ? (item.suggested_retail_price - item.unit_price) / item.suggested_retail_price : 0;
              return (
                <div key={item.product_id} className="flex flex-col rounded-xl border bg-card p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium leading-tight">{item.name}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">{[item.sku, item.category].filter(Boolean).join(" · ")}</p>
                    </div>
                    {item.available ? <Badge tone="success">Disponible</Badge> : <Badge tone="warning">Bajo pedido</Badge>}
                  </div>
                  {item.description && <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">{item.description}</p>}
                  <div className="mt-3 flex items-end justify-between">
                    <div>
                      <p className="text-lg font-semibold tabular-nums">{formatMoney(item.unit_price, currency)}</p>
                      <p className="text-xs text-muted-foreground">PVP sugerido {formatMoney(item.suggested_retail_price, currency)} · tu margen {formatPercent(margin, 0)}</p>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center gap-2">
                    {qty > 0 ? (
                      <>
                        <Button variant="outline" size="icon-sm" aria-label="Menos" onClick={() => setQty(item.product_id, qty - 1)}><Minus className="h-4 w-4" /></Button>
                        <Input aria-label={`Cantidad de ${item.name}`} inputMode="numeric" className="w-16 text-center" value={qty} onChange={(e) => setQty(item.product_id, Number(e.target.value.replace(/\D/g, "")) || 0)} />
                        <Button variant="outline" size="icon-sm" aria-label="Más" onClick={() => setQty(item.product_id, qty + 1)}><Plus className="h-4 w-4" /></Button>
                        <span className="ml-auto text-sm tabular-nums">{formatMoney(qty * item.unit_price, currency)}</span>
                      </>
                    ) : (
                      <Button variant="outline" className="w-full" onClick={() => setQty(item.product_id, 1)}><Plus className="h-4 w-4" /> Agregar</Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Cart */}
      <aside className="lg:sticky lg:top-32 lg:self-start">
        <div className="rounded-xl border bg-card p-4">
          <div className="flex items-center gap-2">
            <ShoppingCart className="h-4 w-4 text-brand" />
            <h2 className="font-semibold">Tu pedido</h2>
          </div>
          {lines.length === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">Agrega productos del catálogo.</p>
          ) : (
            <div className="mt-4 grid gap-3">
              <ul className="grid gap-2 text-sm">
                {lines.map((l) => (
                  <li key={l.product_id} className="flex items-center justify-between gap-2">
                    <span className="min-w-0 truncate">{l.quantity} × {l.name}</span>
                    <span className="flex items-center gap-1 tabular-nums">
                      {formatMoney(l.quantity * l.unit_price, currency)}
                      <Button variant="ghost" size="icon-xs" aria-label={`Quitar ${l.name}`} onClick={() => setQty(l.product_id, 0)}><Trash2 className="h-3 w-3" /></Button>
                    </span>
                  </li>
                ))}
              </ul>
              <div className="border-t pt-3 text-sm">
                <div className="flex justify-between font-semibold"><span>Total</span><span className="tabular-nums">{formatMoney(total, currency)}</span></div>
                <p className="mt-1 text-xs text-muted-foreground">Vendido a precio sugerido: {formatMoney(retailValue, currency)} (ganancia potencial {formatMoney(retailValue - total, currency)}).</p>
              </div>
              {available !== null && total > available && (
                <Callout tone="warning">El pedido supera tu crédito disponible ({formatMoney(available, currency)}). Tu proveedor puede pedirte un pago antes de procesarlo.</Callout>
              )}
              <FormField label="¿Para cuándo lo necesitas?" type="date" min={addDays(today(), 1)} value={requestedDate} onChange={(e) => setRequestedDate(e.target.value)} />
              <TextareaField label="Notas para el proveedor" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Dirección de entrega, horario…" />
              <Button className="bg-brand text-brand-foreground hover:bg-brand/90" disabled={sending} onClick={submit}>{sending ? "Enviando…" : "Enviar pedido"}</Button>
              <p className="text-xs text-muted-foreground">Los precios finales se confirman al facturar. No se descuenta nada hasta que tu proveedor acepte el pedido.</p>
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}
