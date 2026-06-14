import * as React from "react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"

export interface FormFieldProps extends React.ComponentProps<"input"> {
  label?: React.ReactNode;
  description?: React.ReactNode;
  error?: string;
  id?: string;
  containerClassName?: string;
}

export const FormField = React.forwardRef<HTMLInputElement, FormFieldProps>(
  ({ label, description, error, id, containerClassName, className, ...props }, ref) => {
    // Generate a unique ID if one isn't provided, useful for linking label and input
    const generatedId = React.useId();
    const inputId = id || generatedId;

    return (
      <div className={cn("grid gap-2", containerClassName)}>
        {label && <Label htmlFor={inputId}>{label}</Label>}
        <Input
          id={inputId}
          ref={ref}
          className={cn(error && "border-destructive focus-visible:ring-destructive", className)}
          {...props}
        />
        {description && !error && (
          <p className="text-xs text-muted-foreground">{description}</p>
        )}
        {error && (
          <p className="text-xs text-destructive font-medium">{error}</p>
        )}
      </div>
    )
  }
)
FormField.displayName = "FormField"
