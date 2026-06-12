'use client';

import { usePathname } from 'next/navigation';
import { Sidebar } from "@/components/Sidebar";
import { Header } from "@/components/Header";
import { useAuth } from '@/components/AuthProvider';

export function ClientLayoutWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user, profile, loading } = useAuth();
  
  const isLoginPage = pathname === '/login';

  if (loading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full"></div>
      </div>
    );
  }

  if (isLoginPage) {
    return (
      <main className="flex-1 overflow-y-auto bg-muted/20">
        {children}
      </main>
    );
  }

  // Only show dashboard layout if authenticated
  if (!user) {
    return null; // AuthProvider will redirect
  }

  if (!profile) {
    return (
      <div className="flex h-screen w-full flex-col items-center justify-center bg-background p-4 text-center">
        <h2 className="text-2xl font-bold text-destructive mb-2">Failed to Load Workspace</h2>
        <p className="text-muted-foreground mb-6 max-w-md">We could not load your company profile. This might be due to a temporary database issue or an expired session.</p>
        <button 
          onClick={() => window.location.reload()} 
          className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
        >
          Reload Page
        </button>
      </div>
    );
  }

  if (!profile.company_id) {
    return (
      <div className="flex h-screen w-full flex-col items-center justify-center bg-background p-4 text-center">
        <h2 className="text-2xl font-bold text-destructive mb-2">No Workspace Assigned</h2>
        <p className="text-muted-foreground mb-6 max-w-md">Your account is not linked to any company workspace. Please contact your administrator or register a new company.</p>
      </div>
    );
  }

  return (
    <div className="flex h-dvh w-full overflow-hidden bg-background">
      {/* Desktop Sidebar */}
      <div className="hidden md:flex h-full shrink-0 border-r">
        <Sidebar />
      </div>
      
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <Header />
        <main className="flex-1 overflow-y-auto bg-muted/20 p-4 md:p-6 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
