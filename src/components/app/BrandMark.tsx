import { brand } from "@/config/brand";
import { cn } from "@/lib/utils";

/** Provisional logo: a stylized flame/leaf mark plus the product name. */
export function BrandMark({ className, showName = true, subtitle }: { className?: string; showName?: boolean; subtitle?: string }) {
  return (
    <span className={cn("flex items-center gap-2", className)}>
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand text-brand-foreground">
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M4 18 L9.5 11.5 L13 15 L20 6" />
          <path d="M15 6 h5 v5" />
        </svg>
      </span>
      {showName && (
        <span className="flex min-w-0 flex-col leading-tight">
          <span className="truncate text-base font-semibold tracking-tight">{brand.name}</span>
          {subtitle && <span className="truncate text-xs text-muted-foreground">{subtitle}</span>}
        </span>
      )}
    </span>
  );
}
