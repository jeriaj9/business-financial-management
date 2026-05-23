'use client'

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Package,
  Settings,
  Users,
  ShoppingCart,
  Banknote,
  Boxes,
  Receipt
} from "lucide-react";

const navigation = [
  { name: "Dashboard", href: "/", icon: LayoutDashboard },
  { name: "Raw Materials", href: "/materials", icon: Boxes },
  { name: "Products & BOM", href: "/products", icon: Package },
  { name: "Inventory", href: "/inventory", icon: ShoppingCart },
  { name: "Sales", href: "/sales", icon: Banknote },
  { name: "Expenses", href: "/expenses", icon: Receipt },
  { name: "Distributors", href: "/distributors", icon: Users },
  { name: "Settings", href: "/settings", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <div className="flex h-full w-64 flex-col border-r bg-card px-4 py-6">
      <div className="flex items-center gap-2 px-2 mb-8">
        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground font-bold">
          A
        </div>
        <span className="text-xl font-bold tracking-tight">Arelum ERP</span>
      </div>

      <nav className="flex-1 space-y-1">
        {navigation.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
          const Icon = item.icon;
          
          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                "group flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              <Icon className={cn("h-4 w-4", isActive ? "text-primary" : "text-muted-foreground group-hover:text-foreground")} />
              {item.name}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto px-2 pb-4">
        <div className="rounded-lg bg-muted p-4 text-xs">
          <p className="font-semibold mb-1">Arelum Admin</p>
          <p className="text-muted-foreground text-xs">System v1.0.0</p>
        </div>
      </div>
    </div>
  );
}
