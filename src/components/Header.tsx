'use client';

import { Bell, Search, User, LogOut } from "lucide-react";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import { useAuth } from "@/components/AuthProvider";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuGroup,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function Header() {
  const { profile, signOut } = useAuth();
  const userInitial = profile?.full_name?.charAt(0).toUpperCase() || <User className="h-4 w-4 text-primary" />;

  return (
    <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-4 border-b bg-background px-6">
      <div className="flex flex-1 items-center gap-4">
        <div className="relative w-full max-w-md">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search anywhere..."
            className="w-full bg-muted/40 pl-9"
          />
        </div>
      </div>
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5 text-muted-foreground" />
          <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-destructive" />
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger className="h-8 w-8 rounded-full bg-primary/20 flex items-center justify-center border border-primary/30 text-primary font-bold hover:bg-primary/30 transition-colors">
            {userInitial}
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuGroup>
              <DropdownMenuLabel>
                <div className="flex flex-col space-y-1">
                  <p className="text-sm font-medium leading-none">{profile?.full_name}</p>
                  <p className="text-xs leading-none text-muted-foreground">{profile?.role} account</p>
                </div>
              </DropdownMenuLabel>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={signOut} className="text-destructive cursor-pointer">
              <LogOut className="mr-2 h-4 w-4" />
              <span>Log out</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
