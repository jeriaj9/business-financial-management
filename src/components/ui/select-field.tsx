import * as React from "react"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"

export interface SelectOption {
  value: string;
  label: React.ReactNode;
  disabled?: boolean;
}

export interface SelectFieldProps extends Omit<React.ComponentPropsWithoutRef<typeof Select>, 'value' | 'onValueChange'> {
  label?: React.ReactNode;
  options: SelectOption[];
  placeholder?: string;
  description?: React.ReactNode;
  error?: string;
  id?: string;
  containerClassName?: string;
  triggerClassName?: string;
  value?: string;
  onValueChange?: (value: string) => void;
}

export function SelectField({
  label,
  options,
  placeholder,
  description,
  error,
  id,
  containerClassName,
  triggerClassName,
  value,
  onValueChange,
  ...props
}: SelectFieldProps) {
  const generatedId = React.useId();
  const selectId = id || generatedId;

  return (
    <div className={cn("grid gap-2", containerClassName)}>
      {label && <Label htmlFor={selectId}>{label}</Label>}
      <Select
        value={value}
        onValueChange={(v: any) => onValueChange?.(v)}
        {...props}
      >
        <SelectTrigger
          id={selectId}
          className={cn(
            error && "border-destructive focus:ring-destructive",
            triggerClassName
          )}
        >
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value} disabled={option.disabled}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {description && !error && (
        <p className="text-xs text-muted-foreground">{description}</p>
      )}
      {error && (
        <p className="text-xs text-destructive font-medium">{error}</p>
      )}
    </div>
  )
}
