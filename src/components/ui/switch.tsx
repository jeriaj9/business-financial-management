import * as React from "react";
import { cn } from "@/lib/utils";

export interface SwitchFieldProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label: React.ReactNode;
  description?: React.ReactNode;
  disabled?: boolean;
  className?: string;
}

/** Accessible toggle built on a native checkbox. */
export function SwitchField({ checked, onCheckedChange, label, description, disabled, className }: SwitchFieldProps) {
  const id = React.useId();
  return (
    <div className={cn("flex items-start justify-between gap-4", className)}>
      <label htmlFor={id} className="grid gap-1 cursor-pointer">
        <span className="text-sm font-medium leading-none">{label}</span>
        {description && <span className="text-xs text-muted-foreground">{description}</span>}
      </label>
      <label htmlFor={id} className={cn("relative inline-flex shrink-0", disabled ? "cursor-not-allowed" : "cursor-pointer")}>
        <input
          id={id}
          type="checkbox"
          role="switch"
          className="peer sr-only"
          checked={checked}
          disabled={disabled}
          onChange={(e) => onCheckedChange(e.target.checked)}
        />
        <span
          aria-hidden
          className="h-5 w-9 rounded-full bg-input transition-colors peer-checked:bg-brand peer-focus-visible:ring-3 peer-focus-visible:ring-ring/50 peer-disabled:opacity-50"
        />
        <span
          aria-hidden
          className="pointer-events-none absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-background shadow transition-transform peer-checked:translate-x-4"
        />
      </label>
    </div>
  );
}
