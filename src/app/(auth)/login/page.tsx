'use client';

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { friendlyError } from "@/lib/errors";
import { homeFor, useAuth } from "@/components/auth/AuthProvider";
import { Button, buttonVariants } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Callout, LoadingState } from "@/components/ui/page";
import { cn } from "@/lib/utils";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next");
  const { user, profile, portalAccounts, status, refresh } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Signed in and identity known: send the user to the right portal
  useEffect(() => {
    if (status === "ready" && user) router.replace(homeFor(profile, portalAccounts, next));
  }, [status, user, profile, portalAccounts, next, router]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const { data, error: authError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (authError || !data.user) {
      setError(friendlyError(authError));
      setSubmitting(false);
      return;
    }
    // Load this user's access before routing (the effect above redirects once it is ready)
    await refresh({ id: data.user.id, email: data.user.email });
    setSubmitting(false);
  };

  // Already signed in: wait for the redirect instead of flashing the form
  if (user && status !== "error") return <LoadingState label="Entrando…" />;

  return (
    <div className="rounded-2xl border bg-card p-6 shadow-sm sm:p-8">
      <h1 className="text-xl font-semibold">Inicia sesión</h1>
      <p className="mt-1 text-sm text-muted-foreground">Accede al portal de tu negocio o al portal de distribuidores.</p>

      {status === "error" && user && (
        <Callout tone="warning" className="mt-4">
          No pudimos cargar tu cuenta. Vuelve a iniciar sesión; si el problema continúa, revisa tu conexión.
        </Callout>
      )}

      <form onSubmit={onSubmit} className="mt-6 grid gap-4">
        <FormField label="Correo electrónico" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <FormField label="Contraseña" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        {error && <Callout tone="danger">{error}</Callout>}
        <Button type="submit" size="lg" className="h-10 bg-brand text-brand-foreground hover:bg-brand/90" disabled={submitting}>
          {submitting && <Loader2 className="h-4 w-4 animate-spin" />} Entrar
        </Button>
      </form>

      <div className="mt-6 border-t pt-6 text-center">
        <p className="text-sm text-muted-foreground">¿No tienes cuenta?</p>
        <Link href="/registro" className={cn(buttonVariants({ variant: "outline", size: "lg" }), "mt-3 h-10 w-full")}>
          Crear una cuenta
        </Link>
        <p className="mt-4 text-xs text-muted-foreground">
          ¿Eres distribuidor? Usa el enlace de invitación que te envió tu proveedor.
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
