'use client';

import { useMemo } from "react";
import { addDays, addMonths, endOfMonth, startOfMonth, today, type ISODate } from "@/lib/domain/dates";
import { NativeSelect } from "@/components/ui/native-select";
import { Input } from "@/components/ui/input";

export type PeriodKey = "this_month" | "last_month" | "last_30" | "last_90" | "this_year" | "last_12m" | "custom";

export interface Period {
  key: PeriodKey;
  from: ISODate;
  to: ISODate;
}

const LABELS: Record<PeriodKey, string> = {
  this_month: "Este mes",
  last_month: "Mes anterior",
  last_30: "Últimos 30 días",
  last_90: "Últimos 90 días",
  this_year: "Este año",
  last_12m: "Últimos 12 meses",
  custom: "Personalizado",
};

export function periodFor(key: PeriodKey, custom?: { from: ISODate; to: ISODate }): Period {
  const t = today();
  switch (key) {
    case "this_month":
      return { key, from: startOfMonth(t), to: t };
    case "last_month": {
      const start = startOfMonth(addMonths(startOfMonth(t), -1));
      return { key, from: start, to: endOfMonth(start) };
    }
    case "last_30":
      return { key, from: addDays(t, -29), to: t };
    case "last_90":
      return { key, from: addDays(t, -89), to: t };
    case "this_year":
      return { key, from: `${t.slice(0, 4)}-01-01`, to: t };
    case "last_12m":
      return { key, from: addDays(addMonths(t, -12), 1), to: t };
    case "custom":
      return { key, from: custom?.from ?? addDays(t, -29), to: custom?.to ?? t };
  }
}

export function PeriodPicker({ value, onChange, options }: { value: Period; onChange: (p: Period) => void; options?: PeriodKey[] }) {
  const keys = useMemo(() => options ?? (["this_month", "last_month", "last_30", "last_90", "this_year", "last_12m", "custom"] as PeriodKey[]), [options]);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <NativeSelect
        aria-label="Período"
        className="w-44"
        value={value.key}
        options={keys.map((k) => ({ value: k, label: LABELS[k] }))}
        onValueChange={(k) => onChange(periodFor(k as PeriodKey, value))}
      />
      {value.key === "custom" && (
        <>
          <Input type="date" aria-label="Desde" className="w-40" value={value.from} max={value.to} onChange={(e) => e.target.value && onChange({ ...value, from: e.target.value })} />
          <span className="text-sm text-muted-foreground">a</span>
          <Input type="date" aria-label="Hasta" className="w-40" value={value.to} min={value.from} onChange={(e) => e.target.value && onChange({ ...value, to: e.target.value })} />
        </>
      )}
    </div>
  );
}
