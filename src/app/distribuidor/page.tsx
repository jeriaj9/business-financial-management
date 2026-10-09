'use client';

import Link from "next/link";
import { ArrowRight, ShoppingCart } from "lucide-react";
import { friendlyError } from "@/lib/errors";
import { formatDate, formatMoney } from "@/lib/format";
import { usePortalOrders, usePortalStatement } from "@/lib/data/portal";
import { usePortalAccount } from "@/components/portal/PortalShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Callout, ErrorState, LoadingState, Section, StatCard } from "@/components/ui/page";
import { es } from "@/i18n/es";

const orderTone = { submitted: "info", invoiced: "success", rejected: "danger", cancelled: "neutral" } as const;

export default function PortalHome() {
  const account = usePortalAccount();
  const statement = usePortalStatement(account.distributor_id);
  const orders = usePortalOrders(account.distributor_id);
  const currency = account.currency;

  if (statement.isLoading || orders.isLoading) return <LoadingState />;
  if (statement.error) return <ErrorState message={friendlyError(statement.error)} onRetry={() => statement.mutate()} />;

  const s = statement.data!.summary;
  const dueSoon = statement.data!.invoices.filter((i) => i.balance > 0.009).sort((a, b) => a.due_date.localeCompare(b.due_date)).slice(0, 4);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Hola, {account.distributor_name}</h1>
          <p className="text-sm text-muted-foreground">Tu cuenta con {account.company_name}.</p>
        </div>
        <Link href="/distribuidor/catalogo"><Button className="bg-brand text-brand-foreground hover:bg-brand/90"><ShoppingCart className="h-4 w-4" /> Hacer un pedido</Button></Link>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Saldo pendiente" value={formatMoney(s.balance, currency)} />
        <StatCard label="Vencido" value={formatMoney(s.overdue, currency)} tone={s.overdue > 0 ? "negative" : "positive"} />
        <StatCard label="Crédito disponible" value={s.available_credit === null ? "Sin límite" : formatMoney(s.available_credit, currency)} hint={s.credit_limit !== null ? `Límite ${formatMoney(s.credit_limit, currency)}` : undefined} />
        <StatCard label="Plazo de pago" value={`${s.payment_terms_days} días`} />
      </div>

      {s.overdue > 0 && <Callout tone="warning">Tienes {formatMoney(s.overdue, currency)} vencido. Ponte al día para que tus próximos pedidos se procesen sin demora.</Callout>}

      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Pedidos recientes" actions={<Link href="/distribuidor/pedidos" className="flex items-center gap-1 text-sm text-brand hover:underline">Ver todos <ArrowRight className="h-3.5 w-3.5" /></Link>}>
          {(orders.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">Aún no has hecho pedidos desde el portal.</p>
          ) : (
            <ul className="grid gap-2">
              {(orders.data ?? []).slice(0, 4).map((o) => (
                <li key={o.id} className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm">
                  <div>
                    <p className="font-medium">{o.number}</p>
                    <p className="text-xs text-muted-foreground">{formatDate(o.created_at)} · {o.lines.length} producto{o.lines.length === 1 ? "" : "s"}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="tabular-nums">{formatMoney(Number(o.total), currency)}</span>
                    <Badge tone={orderTone[o.status]}>{es.orderStatus[o.status]}</Badge>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="Próximos vencimientos" actions={<Link href="/distribuidor/estado-de-cuenta" className="flex items-center gap-1 text-sm text-brand hover:underline">Estado de cuenta <ArrowRight className="h-3.5 w-3.5" /></Link>}>
          {dueSoon.length === 0 ? (
            <p className="text-sm text-muted-foreground">No tienes facturas pendientes. ¡Al día!</p>
          ) : (
            <ul className="grid gap-2">
              {dueSoon.map((i) => (
                <li key={i.id} className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm">
                  <div>
                    <p className="font-medium">{i.number}</p>
                    <p className={`text-xs ${i.payment_status === "overdue" ? "text-red-400" : "text-muted-foreground"}`}>Vence {formatDate(i.due_date)}</p>
                  </div>
                  <span className="tabular-nums">{formatMoney(Number(i.balance), currency)}</span>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>
    </div>
  );
}
