'use client';

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import useSWR from "swr";
import { LogOut, Menu, Store, User } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { BrandMark } from "@/components/app/BrandMark";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LoadingState } from "@/components/ui/page";
import { es } from "@/i18n/es";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";

function usePendingOrders(companyId?: string | null) {
  return useSWR(companyId ? ["distributor_orders_pending", companyId] : null, async ([, id]) => {
    const { count } = await supabase
      .from("distributor_orders")
      .select("id", { count: "exact", head: true })
      .eq("company_id", id)
      .eq("status", "submitted");
    return count ?? 0;
  }, { refreshInterval: 60_000 });
}

function Nav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { profile } = useAuth();
  const { data: pending } = usePendingOrders(profile?.company_id);

  return (
    <nav className="flex-1 space-y-5 overflow-y-auto pb-4">
      {es.nav.business.map((group) => (
        <div key={group.section}>
          <p className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">{group.section}</p>
          <div className="space-y-0.5">
            {group.items.map((item) => {
              const active = item.href === "/app" ? pathname === "/app" : pathname === item.href || pathname.startsWith(item.href + "/");
              return (
                <Link
                  key={item.key}
                  href={item.href}
                  onClick={onNavigate}
                  className={cn(
                    "flex items-center justify-between rounded-md px-3 py-1.5 text-sm transition-colors",
                    active ? "bg-brand/10 font-medium text-brand" : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                >
                  <span>{item.label}</span>
                  {item.key === "pedidos" && pending ? (
                    <span className="rounded-full bg-brand px-1.5 text-[11px] font-semibold text-brand-foreground">{pending}</span>
                  ) : null}
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const { profile } = useAuth();
  return (
    <div className="flex h-full w-64 flex-col gap-6 bg-card px-3 py-5">
      <Link href="/app" onClick={onNavigate} className="px-2">
        <BrandMark subtitle={profile?.companies?.name ?? undefined} />
      </Link>
      <Nav onNavigate={onNavigate} />
    </div>
  );
}

export function BusinessShell({ children }: { children: React.ReactNode }) {
  const { user, profile, portalAccounts, loading, signOut } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    } else if (!profile?.company_id) {
      router.replace(portalAccounts.length > 0 ? "/distribuidor" : "/registro");
    }
  }, [loading, user, profile, portalAccounts, router, pathname]);

  if (loading || !user || !profile?.company_id) {
    return <LoadingState label="Preparando tu espacio de trabajo…" className="h-dvh" />;
  }

  return (
    <div className="flex h-dvh w-full overflow-hidden bg-background">
      <aside className="hidden h-full shrink-0 border-r md:flex">
        <SidebarContent />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center justify-between gap-3 border-b bg-background/95 px-4 backdrop-blur md:px-6">
          <div className="flex items-center gap-3">
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger className="inline-flex h-9 w-9 items-center justify-center rounded-md hover:bg-muted md:hidden" aria-label="Abrir menú">
                <Menu className="h-5 w-5" />
              </SheetTrigger>
              <SheetContent side="left" className="w-64 p-0">
                <SheetTitle className="sr-only">Menú</SheetTitle>
                <SidebarContent onNavigate={() => setMobileOpen(false)} />
              </SheetContent>
            </Sheet>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{profile.companies?.name}</p>
              <p className="text-xs text-muted-foreground">{es.roles[profile.role]}</p>
            </div>
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger className="flex h-9 w-9 items-center justify-center rounded-full border border-brand/30 bg-brand/15 text-sm font-semibold text-brand" aria-label="Menú de usuario">
              {profile.full_name?.charAt(0).toUpperCase() || <User className="h-4 w-4" />}
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-60">
              <DropdownMenuGroup>
                <DropdownMenuLabel>
                  <p className="text-sm font-medium">{profile.full_name || "Usuario"}</p>
                  <p className="truncate text-xs text-muted-foreground">{user.email}</p>
                </DropdownMenuLabel>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              {portalAccounts.length > 0 && (
                <DropdownMenuItem onClick={() => router.push("/distribuidor")}>
                  <Store className="mr-2 h-4 w-4" /> Portal de distribuidor
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={() => signOut()} className="text-red-400">
                <LogOut className="mr-2 h-4 w-4" /> {es.common.signOut}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </header>

        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-7xl p-4 md:p-6 lg:p-8">{children}</div>
        </main>
      </div>
    </div>
  );
}
