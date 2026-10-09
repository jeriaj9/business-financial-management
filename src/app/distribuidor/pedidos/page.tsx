'use client';

import Link from "next/link";
import { friendlyError } from "@/lib/errors";
import { formatDate, formatMoney, formatNumber } from "@/lib/format";
import { portalCall, usePortalOrders } from "@/lib/data/portal";
import { usePortalAccount } from "@/components/portal/PortalShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Callout, EmptyState, ErrorState, LoadingState } from "@/components/ui/page";
import { useToast } from "@/components/ui/toaster";
import { es } from "@/i18n/es";

const orderTone = { submitted: "info", invoiced: "success", rejected: "danger", cancelled: "neutral" } as const;

export default function PortalOrdersPage() {
  const account = usePortalAccount();
  const orders = usePortalOrders(account.distributor_id);
  const toast = useToast();
  const currency = account.currency;

  const cancel = async (id: string, number: string) => {
    if (!window.confirm(`¿Cancelar el pedido ${number}?`)) return;
    try {
      await portalCall("portal_cancel_order", { p_order_id: id });
      toast.success("Pedido cancelado");
      void orders.mutate();
    } catch (err) {
      toast.error("No se pudo cancelar", friendlyError(err));
    }
  };

  if (orders.isLoading) return <LoadingState />;
  if (orders.error) return <ErrorState message={friendlyError(orders.error)} onRetry={() => orders.mutate()} />;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Mis pedidos</h1>
        <p className="text-sm text-muted-foreground">Sigue el estado de cada pedido. Los pedidos enviados se pueden cancelar mientras no hayan sido procesados.</p>
      </div>
      {(orders.data ?? []).length === 0 ? (
        <EmptyState title="Aún no tienes pedidos" description="Haz tu primer pedido desde el catálogo." action={<Link href="/distribuidor/catalogo"><Button>Ir al catálogo</Button></Link>} />
      ) : (
        (orders.data ?? []).map((o) => (
          <div key={o.id} className="rounded-xl border bg-card p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="font-semibold">{o.number}</p>
                <p className="text-xs text-muted-foreground">Enviado {formatDate(o.created_at)}{o.requested_date ? ` · para el ${formatDate(o.requested_date)}` : ""}</p>
              </div>
              <div className="flex items-center gap-3">
                <span className="font-semibold tabular-nums">{formatMoney(Number(o.total), currency)}</span>
                <Badge tone={orderTone[o.status]}>{es.orderStatus[o.status]}</Badge>
              </div>
            </div>
            <ul className="mt-3 grid gap-1 text-sm">
              {o.lines.map((l, i) => (
                <li key={i} className="flex justify-between gap-2">
                  <span>{formatNumber(Number(l.quantity))} × {l.product_name}</span>
                  <span className="tabular-nums text-muted-foreground">{formatMoney(Number(l.line_total), currency)}</span>
                </li>
              ))}
            </ul>
            {o.status === "invoiced" && o.invoice_number && <p className="mt-3 text-sm text-emerald-400">Facturado en {o.invoice_number}. Lo verás en tu estado de cuenta.</p>}
            {o.status === "rejected" && <Callout tone="danger" className="mt-3" title="Pedido rechazado">{o.rejection_reason}</Callout>}
            {o.notes && <p className="mt-2 text-xs text-muted-foreground">Tus notas: {o.notes}</p>}
            {o.status === "submitted" && (
              <div className="mt-3 flex justify-end">
                <Button variant="ghost" size="sm" onClick={() => cancel(o.id, o.number)}>Cancelar pedido</Button>
              </div>
            )}
          </div>
        ))
      )}
    </div>
  );
}
