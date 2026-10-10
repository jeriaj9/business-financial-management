'use client';

import { CloudOff } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/page";

/** Shown when the user is signed in but their access could not be loaded (network or expired session). */
export function IdentityError() {
  const { refresh, signOut } = useAuth();
  return (
    <div className="mx-auto flex min-h-dvh max-w-lg items-center px-4">
      <EmptyState
        icon={<CloudOff />}
        title="No pudimos cargar tu cuenta"
        description="Revisa tu conexión e inténtalo de nuevo. Si el problema continúa, vuelve a iniciar sesión."
        action={
          <div className="flex flex-wrap justify-center gap-2">
            <Button variant="outline" onClick={() => void refresh()}>Reintentar</Button>
            <Button variant="outline" onClick={() => void signOut()}>Iniciar sesión de nuevo</Button>
          </div>
        }
      />
    </div>
  );
}
