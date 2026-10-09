import * as React from "react";
import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";

export function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      className={cn(
        "min-h-20 w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50 dark:bg-input/30",
        className
      )}
      {...props}
    />
  );
}

export function TextareaField({ label, id, containerClassName, ...props }: React.ComponentProps<"textarea"> & { label?: React.ReactNode; containerClassName?: string }) {
  const generated = React.useId();
  const fieldId = id ?? generated;
  return (
    <div className={cn("grid gap-2", containerClassName)}>
      {label && <Label htmlFor={fieldId}>{label}</Label>}
      <Textarea id={fieldId} {...props} />
    </div>
  );
}
