'use client';

import * as React from "react";
import { CheckCircle2, X, XCircle, Info } from "lucide-react";
import { cn } from "@/lib/utils";

type ToastTone = "success" | "error" | "info";
interface ToastItem {
  id: number;
  title: string;
  description?: string;
  tone: ToastTone;
}

const ToastContext = React.createContext<(t: Omit<ToastItem, "id">) => void>(() => {});

export function Toaster({ children }: { children: React.ReactNode }) {
  const [items, setItems] = React.useState<ToastItem[]>([]);
  const push = React.useCallback((t: Omit<ToastItem, "id">) => {
    const id = Date.now() + Math.random();
    setItems((prev) => [...prev.slice(-3), { ...t, id }]);
    setTimeout(() => setItems((prev) => prev.filter((i) => i.id !== id)), t.tone === "error" ? 7000 : 4000);
  }, []);

  return (
    <ToastContext.Provider value={push}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-[min(92vw,380px)] flex-col gap-2">
        {items.map((t) => {
          const Icon = t.tone === "success" ? CheckCircle2 : t.tone === "error" ? XCircle : Info;
          return (
            <div
              key={t.id}
              role={t.tone === "error" ? "alert" : "status"}
              className={cn(
                "pointer-events-auto flex gap-3 rounded-xl border bg-popover p-3 text-sm shadow-lg animate-in fade-in slide-in-from-bottom-2",
                t.tone === "error" && "border-red-500/30",
                t.tone === "success" && "border-emerald-500/30"
              )}
            >
              <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", t.tone === "error" ? "text-red-400" : t.tone === "success" ? "text-emerald-400" : "text-sky-400")} />
              <div className="min-w-0 flex-1">
                <p className="font-medium">{t.title}</p>
                {t.description && <p className="mt-0.5 text-muted-foreground">{t.description}</p>}
              </div>
              <button aria-label="Cerrar" className="text-muted-foreground hover:text-foreground" onClick={() => setItems((prev) => prev.filter((i) => i.id !== t.id))}>
                <X className="h-4 w-4" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const push = React.useContext(ToastContext);
  return React.useMemo(
    () => ({
      success: (title: string, description?: string) => push({ title, description, tone: "success" }),
      error: (title: string, description?: string) => push({ title, description, tone: "error" }),
      info: (title: string, description?: string) => push({ title, description, tone: "info" }),
    }),
    [push]
  );
}
