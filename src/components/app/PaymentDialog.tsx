'use client';

import { useState } from "react";
import { friendlyError } from "@/lib/errors";
import { formatMoney, parseInput } from "@/lib/format";
import { today } from "@/lib/domain/dates";
import { rpc } from "@/lib/data/hooks";
import { AppDialog } from "@/components/ui/app-dialog";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { NativeSelectField } from "@/components/ui/native-select";
import { useToast } from "@/components/ui/toaster";

export const paymentMethods = ["Efectivo", "Transferencia", "Tarjeta", "Cheque", "Otro"].map((m) => ({ value: m, label: m }));

export interface PaymentTarget {
  kind: "invoice" | "purchase";
  id: string;
  number: string;
  balance: number;
  counterparty: string;
}

interface PaymentDialogProps {
  target: PaymentTarget | null;
  currency: string;
  onClose: () => void;
  onDone: () => void;
}

export function PaymentDialog(props: PaymentDialogProps) {
  // Remount the form for each document so it starts from that document's balance
  return <PaymentForm key={props.target ? `${props.target.kind}-${props.target.id}` : "none"} {...props} />;
}

function PaymentForm({ target, currency, onClose, onDone }: PaymentDialogProps) {
  const toast = useToast();
  const [amount, setAmount] = useState(target ? String(Math.round(target.balance * 100) / 100) : "");
  const [date, setDate] = useState(today());
  const [method, setMethod] = useState("Transferencia");
  const [reference, setReference] = useState("");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!target) return;
    const value = parseInput(amount);
    if (value === null || value <= 0) return toast.error("Indica un monto válido.");
    setSaving(true);
    try {
      await rpc("register_payment", {
        p_kind: target.kind,
        p_document_id: target.id,
        p_amount: value,
        p_payment_date: date,
        p_method: method,
        p_reference: reference || null,
      });
      toast.success(target.kind === "invoice" ? "Cobro registrado" : "Pago registrado");
      onDone();
      onClose();
    } catch (err) {
      toast.error("No se pudo registrar", friendlyError(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppDialog
      open={!!target}
      onOpenChange={(o) => !o && onClose()}
      title={target?.kind === "invoice" ? `Registrar cobro · ${target?.number}` : `Registrar pago · ${target?.number}`}
      description={target ? `${target.counterparty} · saldo pendiente ${formatMoney(target.balance, currency)}` : undefined}
      footer={<><Button variant="outline" onClick={onClose}>Cancelar</Button><Button onClick={save} disabled={saving}>{saving ? "Guardando…" : "Registrar"}</Button></>}
    >
      <div className="grid gap-4">
        <div className="grid grid-cols-2 gap-4">
          <FormField label={`Monto (${currency})`} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
          <FormField label="Fecha" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <NativeSelectField label="Método" value={method} onValueChange={setMethod} options={paymentMethods} />
          <FormField label="Referencia" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Nº de transferencia…" />
        </div>
      </div>
    </AppDialog>
  );
}
