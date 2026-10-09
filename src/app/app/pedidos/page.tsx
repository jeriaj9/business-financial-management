'use client';

import { useState } from "react";
import { Inbox } from "lucide-react";
import { friendlyError } from "@/lib/errors";
import { formatDate, formatMoney, formatNumber } from "@/lib/format";
import { invalidate, rpc, useCompany, useDistributorOrders, useOpenReceivables } from "@/lib/data/hooks";
import { RowsTable } from "@/components/app/RowsTable";
import { AppDialog } from "@/components/ui/app-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Callout, EmptyState, ErrorState, LoadingState, PageHeader } from "@/components/ui/page";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TextareaField } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toaster";
import { es } from "@/i18n/es";

/* eslint-disable @typescript-eslint/no-explicit-any */
const statusTone: Record<string, "info" | "success" | "danger" | "neutral"> = { submitted: "info", invoiced: "success", rejected: "danger", cancelled: "neutral" };

export default function DistributorOrdersPage() {
  const { companyId, canEdit, currency, settings } = useCompany();
  const orders = useDistributorOrders(companyId);
  const receivables = useOpenReceivables(companyId);
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<any | null>(null);
  const [reason, setReason] = useState("");

  const accept = async (order: any) => {
    setBusy(order.id);
    try {
      await rpc("accept_distributor_order", { p_order_id: order.id });
      toast.success(`Pedido ${order.number} facturado`, "Se descontó el inventario y la factura quedó en cuentas por cobrar.");
      void invalidate("distributor_orders", "distributor_orders_pending", "invoices", "invoice_lines", "receivables", "products", "inventory_transactions");
    } catch (err) {
      toast.error("No se pudo facturar el pedido", friendlyError(err));
    } finally {
      setBusy(null);
    }
  };

  const reject = async () => {
    if (!rejecting) return;
    try {
      await rpc("reject_distributor_order", { p_order_id: rejecting.id, p_reason: reason });
      toast.success("Pedido rechazado", "El distribuidor verá el motivo en su portal.");
      setRejecting(null);
      void invalidate("distributor_orders", "distributor_orders_pending");
    } catch (err) {
      toast.error("No se pudo rechazar", friendlyError(err));
    }
  };

  if (orders.isLoading) return <LoadingState />;
  if (orders.error) return <ErrorState message={friendlyError(orders.error)} onRetry={() => orders.mutate()} />;

  const pending = (orders.data ?? []).filter((o: any) => o.status === "submitted");
  const history = (orders.data ?? []).filter((o: any) => o.status !== "submitted");
  const balanceOf = (distributorId: string) => (receivables.data ?? []).filter((r: any) => r.distributor_id === distributorId).reduce((s: number, r: any) => s + Number(r.balance), 0);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Pedidos de distribuidores" description="Pedidos enviados desde el portal de distribuidores. Al aceptar, se emite la factura con sus precios y condiciones." />

      <Tabs defaultValue="pendientes">
        <TabsList>
          <TabsTrigger value="pendientes">Por revisar ({pending.length})</TabsTrigger>
          <TabsTrigger value="historial">Historial</TabsTrigger>
        </TabsList>

        <TabsContent value="pendientes" className="mt-4 grid gap-4">
          {pending.length === 0 ? (
            <EmptyState icon={<Inbox />} title="No hay pedidos por revisar" description="Cuando un distribuidor envíe un pedido desde su portal, aparecerá aquí." />
          ) : (
            pending.map((o: any) => {
              const shortages = o.distributor_order_lines.filter((l: any) => Number(l.quantity) > Number(l.products?.current_stock ?? 0));
              const balance = balanceOf(o.distributor_id);
              const limit = o.distributors?.credit_limit === null || o.distributors?.credit_limit === undefined ? null : Number(o.distributors.credit_limit);
              const overLimit = limit !== null && balance + Number(o.total) > limit;
              return (
                <div key={o.id} className="rounded-xl border bg-card p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-base font-semibold">{o.distributors?.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {o.number} · enviado {formatDate(o.created_at)}{o.requested_date ? ` · lo necesita el ${formatDate(o.requested_date)}` : ""}
                      </p>
                    </div>
                    <p className="text-xl font-semibold tabular-nums">{formatMoney(Number(o.total), currency)}</p>
                  </div>

                  <div className="mt-3">
                    <RowsTable dense rows={o.distributor_order_lines} rowKey={(l: any) => l.id} columns={[
                      { key: "p", header: "Producto", cell: (l: any) => l.products?.name },
                      { key: "q", header: "Cantidad", align: "right", cell: (l: any) => formatNumber(Number(l.quantity)) },
                      { key: "s", header: "Existencia", align: "right", cell: (l: any) => <span className={Number(l.quantity) > Number(l.products?.current_stock ?? 0) ? "text-red-400" : "text-muted-foreground"}>{formatNumber(Number(l.products?.current_stock ?? 0))}</span> },
                      { key: "price", header: "Precio", align: "right", cell: (l: any) => formatMoney(Number(l.unit_price), currency) },
                      { key: "t", header: "Total", align: "right", cell: (l: any) => formatMoney(Number(l.line_total), currency) },
                    ]} />
                  </div>

                  <div className="mt-3 grid gap-2">
                    {o.notes && <p className="text-sm"><span className="text-muted-foreground">Notas del distribuidor:</span> {o.notes}</p>}
                    {shortages.length > 0 && (
                      <Callout tone={settings?.allowNegativeStock ? "warning" : "danger"}>
                        No hay existencia suficiente de {shortages.map((l: any) => l.products?.name).join(", ")}. {settings?.allowNegativeStock ? "Se facturará igual (inventario negativo permitido)." : "Produce o ajusta el inventario antes de facturar, o rechaza el pedido."}
                      </Callout>
                    )}
                    {overLimit && <Callout tone="warning">Con este pedido el saldo sería {formatMoney(balance + Number(o.total), currency)}, sobre su límite de crédito de {formatMoney(limit!, currency)}.</Callout>}
                  </div>

                  {canEdit && (
                    <div className="mt-4 flex flex-wrap justify-end gap-2">
                      <Button variant="outline" onClick={() => { setRejecting(o); setReason(""); }}>Rechazar</Button>
                      <Button onClick={() => accept(o)} disabled={busy === o.id || (shortages.length > 0 && !settings?.allowNegativeStock)}>{busy === o.id ? "Facturando…" : "Aceptar y facturar"}</Button>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </TabsContent>

        <TabsContent value="historial" className="mt-4">
          <RowsTable
            rows={history}
            rowKey={(o: any) => o.id}
            empty="Sin historial."
            columns={[
              { key: "n", header: "Pedido", cell: (o: any) => <span className="font-medium">{o.number}</span> },
              { key: "d", header: "Distribuidor", cell: (o: any) => o.distributors?.name },
              { key: "date", header: "Fecha", sortValue: (o: any) => o.created_at, cell: (o: any) => formatDate(o.created_at) },
              { key: "t", header: "Total", align: "right", cell: (o: any) => formatMoney(Number(o.total), currency) },
              { key: "s", header: "Estado", cell: (o: any) => <Badge tone={statusTone[o.status]}>{es.orderStatus[o.status]}</Badge> },
              { key: "i", header: "Factura / motivo", cell: (o: any) => <span className="text-xs text-muted-foreground">{o.invoice?.number ?? o.rejection_reason ?? ""}</span> },
            ]}
          />
        </TabsContent>
      </Tabs>

      <AppDialog open={!!rejecting} onOpenChange={(o) => !o && setRejecting(null)} title={`Rechazar ${rejecting?.number ?? ""}`}
        footer={<><Button variant="outline" onClick={() => setRejecting(null)}>Cancelar</Button><Button variant="destructive" onClick={reject}>Rechazar pedido</Button></>}>
        <TextareaField label="Motivo (lo verá el distribuidor)" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ej. Sin existencia de difusores hasta el día 20; vuelve a pedir esa fecha." />
      </AppDialog>
    </div>
  );
}
