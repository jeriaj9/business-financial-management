'use client';

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Building2, LogOut } from "lucide-react";
import { useAuth, type PortalAccount } from "@/components/auth/AuthProvider";
import { IdentityError } from "@/components/auth/IdentityError";
import { BrandMark } from "@/components/app/BrandMark";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import { EmptyState, LoadingState } from "@/components/ui/page";
import { es } from "@/i18n/es";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "portal:selected-distributor";

const PortalContext = createContext<PortalAccount | null>(null);

/** The distributor account (producer relationship) currently selected in the portal. */
export function usePortalAccount(): PortalAccount {
  const account = useContext(PortalContext);
  if (!account) throw new Error("usePortalAccount must be used inside PortalShell");
  return account;
}

export function PortalShell({ children }: { children: React.ReactNode }) {
  const { user, profile, portalAccounts, status, signOut } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [selectedId, setSelectedId] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      return window.localStorage.getItem(STORAGE_KEY);
    } catch {
      return null;
    }
  });

  useEffect(() => {
    if (status === "ready" && !user) router.replace(`/login?next=${encodeURIComponent(pathname)}`);
  }, [status, user, router, pathname]);

  const account = useMemo(
    () => portalAccounts.find((a) => a.distributor_id === selectedId) ?? portalAccounts[0] ?? null,
    [portalAccounts, selectedId]
  );

  const select = (id: string) => {
    setSelectedId(id);
    try {
      window.localStorage.setItem(STORAGE_KEY, id);
    } catch {
      // ignore
    }
  };

  if (status === "error" && user) return <IdentityError />;
  if (status !== "ready" || !user) return <LoadingState label="Abriendo tu portal…" className="h-dvh" />;

  if (!account) {
    return (
      <div className="mx-auto flex min-h-dvh max-w-lg items-center px-4">
        <EmptyState
          icon={<Building2 />}
          title="No tienes acceso de distribuidor"
          description="Para entrar al portal necesitas una invitación de tu proveedor. Pídele que te envíe el enlace desde su cuenta."
          action={
            <div className="flex gap-2">
              {profile?.company_id && <Button variant="outline" onClick={() => router.push("/app")}>Ir a mi empresa</Button>}
              <Button variant="outline" onClick={() => signOut()}>Cerrar sesión</Button>
            </div>
          }
        />
      </div>
    );
  }

  return (
    <PortalContext.Provider value={account}>
      <div className="min-h-dvh bg-background">
        <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
            <div className="flex min-w-0 items-center gap-3">
              <BrandMark showName={false} />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{account.company_name}</p>
                <p className="truncate text-xs text-muted-foreground">Portal de distribuidores · {account.distributor_name}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {portalAccounts.length > 1 && (
                <NativeSelect
                  aria-label="Proveedor"
                  className="w-56"
                  value={account.distributor_id}
                  onValueChange={select}
                  options={portalAccounts.map((a) => ({ value: a.distributor_id, label: `${a.company_name} (${a.distributor_name})` }))}
                />
              )}
              {profile?.company_id && <Button variant="ghost" size="sm" onClick={() => router.push("/app")}>Mi empresa</Button>}
              <Button variant="ghost" size="sm" onClick={() => signOut()}><LogOut className="h-4 w-4" /> Salir</Button>
            </div>
          </div>
          <nav className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-4">
            {es.nav.portal.map((item) => {
              const active = item.href === "/distribuidor" ? pathname === item.href : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.key}
                  href={item.href}
                  className={cn(
                    "whitespace-nowrap border-b-2 px-3 py-2 text-sm transition-colors",
                    active ? "border-brand font-medium text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </header>
        <main key={account.distributor_id} className="mx-auto max-w-6xl px-4 py-6 md:py-8">{children}</main>
      </div>
    </PortalContext.Provider>
  );
}
