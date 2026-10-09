import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset",
  {
    variants: {
      tone: {
        neutral: "bg-muted text-muted-foreground ring-border",
        success: "bg-emerald-500/10 text-emerald-400 ring-emerald-500/20",
        warning: "bg-amber-500/10 text-amber-400 ring-amber-500/25",
        danger: "bg-red-500/10 text-red-400 ring-red-500/25",
        info: "bg-sky-500/10 text-sky-400 ring-sky-500/20",
        brand: "bg-brand/15 text-brand ring-brand/30",
      },
    },
    defaultVariants: { tone: "neutral" },
  }
);

export function Badge({ className, tone, ...props }: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}
