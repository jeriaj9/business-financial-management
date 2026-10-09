'use client';

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { friendlyError } from "@/lib/errors";
import { homeFor, useAuth } from "@/components/auth/AuthProvider";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Callout } from "@/components/ui/page";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next");
  const { user, profile, portalAccounts, loading, refresh } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Already signed in: send the user to the right portal
  useEffect(() => {
    if (!loading && user) router.replace(homeFor(profile, portalAccounts, next));
  }, [loading, user, profile, portalAccounts, next, router]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const { error: authError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (authError) {
      setError(friendlyError(authError));
      setSubmitting(false);
      return;
    }
    await refresh();
    setSubmitting(false);
  };

  return (
    <div className="rounded-2xl border bg-card p-6 shadow-sm sm:p-8">
      <h1 className="text-xl font-semibold">Inicia sesión</h1>
      <p className="mt-1 text-sm text-muted-foreground">Accede al portal de tu negocio o al portal de distribuidores.</p>

      <form onSubmit={onSubmit} className="mt-6 grid gap-4">
        <FormField label="Correo electrónico" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <FormField label="Contraseña" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        {error && <Callout tone="danger">{error}</Callout>}
        <Button type="submit" size="lg" className="h-10 bg-brand text-brand-foreground hover:bg-brand/90" disabled={submitting}>
          {submitting && <Loader2 className="h-4 w-4 animate-spin" />} Entrar
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        ¿Tu negocio aún no tiene cuenta?{" "}
        <Link href="/registro" className="font-medium text-brand hover:underline">
          Crea una gratis
        </Link>
      </p>
      <p className="mt-2 text-center text-xs text-muted-foreground">
        ¿Eres distribuidor? Usa el enlace de invitación que te envió tu proveedor.
      </p>
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
