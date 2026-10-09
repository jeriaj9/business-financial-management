import * as React from "react";
import { AlertTriangle, CheckCircle2, Info, Loader2, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export function PageHeader({ title, description, actions, className }: { title: React.ReactNode; description?: React.ReactNode; actions?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between", className)}>
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">{title}</h1>
        {description && <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

type Tone = "neutral" | "positive" | "negative" | "warning" | "brand";

const toneText: Record<Tone, string> = {
  neutral: "text-foreground",
  positive: "text-emerald-400",
  negative: "text-red-400",
  warning: "text-amber-400",
  brand: "text-brand",
};

export function StatCard({
  label,
  value,
  hint,
  tone = "neutral",
  icon,
  className,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  hint?: React.ReactNode;
  tone?: Tone;
  icon?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("rounded-xl border bg-card p-4", className)}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
        {icon && <span className="text-muted-foreground [&_svg]:h-4 [&_svg]:w-4">{icon}</span>}
      </div>
      <p className={cn("mt-2 text-2xl font-semibold tabular-nums whitespace-nowrap", toneText[tone])}>{value}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function Section({ title, description, actions, children, className }: { title?: React.ReactNode; description?: React.ReactNode; actions?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-xl border bg-card", className)}>
      {(title || actions) && (
        <div className="flex flex-col gap-2 border-b px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            {title && <h2 className="text-sm font-semibold">{title}</h2>}
            {description && <p className="text-xs text-muted-foreground">{description}</p>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}

const calloutStyles = {
  info: { box: "border-sky-500/25 bg-sky-500/5", icon: Info, iconClass: "text-sky-400" },
  success: { box: "border-emerald-500/25 bg-emerald-500/5", icon: CheckCircle2, iconClass: "text-emerald-400" },
  warning: { box: "border-amber-500/30 bg-amber-500/5", icon: AlertTriangle, iconClass: "text-amber-400" },
  danger: { box: "border-red-500/30 bg-red-500/5", icon: XCircle, iconClass: "text-red-400" },
};

export function Callout({ tone = "info", title, children, className, action }: { tone?: keyof typeof calloutStyles; title?: React.ReactNode; children?: React.ReactNode; className?: string; action?: React.ReactNode }) {
  const style = calloutStyles[tone];
  const Icon = style.icon;
  return (
    <div className={cn("flex gap-3 rounded-xl border p-3 text-sm", style.box, className)}>
      <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", style.iconClass)} />
      <div className="min-w-0 flex-1">
        {title && <p className="font-medium">{title}</p>}
        {children && <div className={cn("text-muted-foreground", title && "mt-0.5")}>{children}</div>}
      </div>
      {action && <div className="shrink-0 self-center">{action}</div>}
    </div>
  );
}

export function EmptyState({ icon, title, description, action, className }: { icon?: React.ReactNode; title: React.ReactNode; description?: React.ReactNode; action?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-6 py-12 text-center", className)}>
      {icon && <div className="mb-1 text-muted-foreground [&_svg]:h-8 [&_svg]:w-8">{icon}</div>}
      <p className="font-medium">{title}</p>
      {description && <p className="max-w-md text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

export function LoadingState({ label = "Cargando…", className }: { label?: string; className?: string }) {
  return (
    <div className={cn("flex h-[40vh] w-full flex-col items-center justify-center gap-3", className)}>
      <Loader2 className="h-8 w-8 animate-spin text-brand" />
      <p className="text-sm text-muted-foreground">{label}</p>
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <Callout tone="danger" title="No pudimos cargar la información" action={onRetry && <button className="text-sm font-medium underline" onClick={onRetry}>Reintentar</button>}>
      {message}
    </Callout>
  );
}

/** Colors an amount: green when positive, red when negative. */
export function Amount({ value, children, className, invert }: { value: number; children: React.ReactNode; className?: string; invert?: boolean }) {
  const positive = invert ? value < 0 : value > 0;
  const negative = invert ? value > 0 : value < 0;
  return <span className={cn("tabular-nums", positive && "text-emerald-400", negative && "text-red-400", className)}>{children}</span>;
}
