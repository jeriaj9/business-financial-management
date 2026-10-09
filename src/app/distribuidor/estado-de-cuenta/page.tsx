'use client';

import { Printer } from "lucide-react";
import { friendlyError } from "@/lib/errors";
import { formatDate, formatMoney, formatNumber, formatPercent } from "@/lib/format";
import { usePortalStatement } from "@/lib/data/portal";
import { usePortalAccount } from "@/components/portal/PortalShell";
import { RowsTable } from "@/components/app/RowsTable";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ErrorState, LoadingState, Section, StatCard } from "@/components/ui/page";
import { es } from "@/i18n/es";

const tone = { paid: "success", partial: "info", pending: "neutral", overdue: "danger" } as const;

export default function StatementPage() {
  const account = usePortalAccount();
  const statement = usePortalStatement(account.distributor_id);
  const currency = account.currency;

  if (statement.isLoading) return <LoadingState />;
  if (statement.error) return <ErrorState message={friendlyError(statement.error)} onRetry={() => statement.mutate()} />;
  const { summary, invoices, payments } = statement.data!;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Estado de cuenta</h1>
          <p className="text-sm text-muted-foreground">{account.distributor_name} con {account.company_name} · al {formatDate(new Date().toISOString())}</p>
        </div>
        <Button variant="outline" onClick={() => window.print()} className="print:hidden"><Printer className="h-4 w-4" /> Imprimir</Button>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Facturado" value={formatMoney(summary.total_invoiced, currency)} />
        <StatCard label="Pagado" value={formatMoney(summary.total_paid, currency)} />
        <StatCard label="Saldo" value={formatMoney(summary.balance, currency)} tone="brand" />
        <StatCard label="Vencido" value={formatMoney(summary.overdue, currency)} tone={summary.overdue > 0 ? "negative" : "positive"} />
      </div>

      <Section title="Facturas">
        <RowsTable
          rows={invoices}
          rowKey={(i) => i.id}
          empty="Sin facturas."
          columns={[
            { key: "n", header: "Factura", cell: (i) => (
              <details>
                <summary className="cursor-pointer font-medium">{i.number}</summary>
                <ul className="mt-2 grid gap-0.5 text-xs text-muted-foreground">
                  {i.lines.map((l, idx) => (
                    <li key={idx}>{formatNumber(Number(l.quantity))} × {l.product_name} a {formatMoney(Number(l.unit_price), currency)}{Number(l.discount_pct) > 0 ? ` (−${formatPercent(Number(l.discount_pct), 0)})` : ""}</li>
                  ))}
                </ul>
              </details>
            ) },
            { key: "d", header: "Fecha", cell: (i) => formatDate(i.issue_date) },
            { key: "v", header: "Vence", cell: (i) => <span className={i.payment_status === "overdue" ? "text-red-400" : undefined}>{formatDate(i.due_date)}</span> },
            { key: "t", header: "Total", align: "right", cell: (i) => formatMoney(Number(i.total), currency) },
            { key: "p", header: "Pagado", align: "right", cell: (i) => formatMoney(Number(i.amount_paid), currency) },
            { key: "b", header: "Saldo", align: "right", cell: (i) => formatMoney(Number(i.balance), currency) },
            { key: "s", header: "Estado", cell: (i) => <Badge tone={tone[i.payment_status]}>{es.paymentStatus[i.payment_status]}</Badge> },
          ]}
        />
      </Section>

      <Section title="Pagos recibidos">
        <RowsTable
          dense
          rows={payments}
          rowKey={(p) => `${p.payment_date}-${p.invoice_number}-${p.amount}`}
          empty="Sin pagos registrados."
          columns={[
            { key: "d", header: "Fecha", cell: (p) => formatDate(p.payment_date) },
            { key: "i", header: "Factura", cell: (p) => p.invoice_number },
            { key: "m", header: "Método", cell: (p) => [p.method, p.reference].filter(Boolean).join(" · ") || "—" },
            { key: "a", header: "Monto", align: "right", cell: (p) => formatMoney(Number(p.amount), currency) },
          ]}
        />
      </Section>
    </div>
  );
}
