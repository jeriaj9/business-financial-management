import * as React from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";

export interface NativeOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface NativeSelectProps extends Omit<React.ComponentProps<"select">, "onChange"> {
  options: NativeOption[];
  placeholder?: string;
  onValueChange?: (value: string) => void;
}

/** Lightweight select for dense forms and line editors. */
export function NativeSelect({ options, placeholder, className, onValueChange, value, ...props }: NativeSelectProps) {
  return (
    <span className={cn("relative block", className)}>
      <select
        value={value ?? ""}
        onChange={(e) => onValueChange?.(e.target.value)}
        className="h-8 w-full appearance-none rounded-lg border border-input bg-transparent pl-2.5 pr-8 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50 dark:bg-input/30 [&>option]:bg-popover [&>option]:text-popover-foreground"
        {...props}
      >
        {placeholder !== undefined && (
          <option value="" disabled={props.required}>
            {placeholder}
          </option>
        )}
        {options.map((o) => (
          <option key={o.value} value={o.value} disabled={o.disabled}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 top-2 h-4 w-4 text-muted-foreground" />
    </span>
  );
}

export function NativeSelectField({ label, description, id, containerClassName, ...props }: NativeSelectProps & { label?: React.ReactNode; description?: React.ReactNode; containerClassName?: string }) {
  const generated = React.useId();
  const fieldId = id ?? generated;
  return (
    <div className={cn("grid gap-2", containerClassName)}>
      {label && <Label htmlFor={fieldId}>{label}</Label>}
      <NativeSelect id={fieldId} {...props} />
      {description && <p className="text-xs text-muted-foreground">{description}</p>}
    </div>
  );
}
