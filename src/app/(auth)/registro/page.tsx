'use client';

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, MailCheck } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { friendlyError } from "@/lib/errors";
import { brand } from "@/config/brand";
import { useAuth } from "@/components/auth/AuthProvider";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { NativeSelectField } from "@/components/ui/native-select";
import { Callout } from "@/components/ui/page";

const currencies = [
  { value: "DOP", label: "Peso dominicano (DOP)" },
  { value: "USD", label: "Dólar estadounidense (USD)" },
  { value: "MXN", label: "Peso mexicano (MXN)" },
  { value: "COP", label: "Peso colombiano (COP)" },
  { value: "EUR", label: "Euro (EUR)" },
];

export default function RegisterPage() {
  const router = useRouter();
  const { user, profile, loading, refresh } = useAuth();
  const [fullName, setFullName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [currency, setCurrency] = useState<string>(brand.defaultCurrency);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checkEmail, setCheckEmail] = useState(false);

  // Users who already belong to a company go straight to their portal
  useEffect(() => {
    if (!loading && profile?.company_id) router.replace("/app");
  }, [loading, profile, router]);

  const createCompany = async () => {
    const { error: rpcError } = await supabase.rpc("create_company", {
      p_company_name: companyName.trim(),
      p_full_name: fullName.trim(),
      p_currency: currency,
    });
    if (rpcError) throw rpcError;
    await refresh();
    router.replace("/app");
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      if (!user) {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { data: { full_name: fullName.trim() } },
        });
        if (signUpError) throw signUpError;
        if (!data.session) {
          // Email confirmation is enabled: finish the company setup after confirming
          setCheckEmail(true);
          return;
        }
      }
      await createCompany();
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setSubmitting(false);
    }
  };

  if (checkEmail) {
    return (
      <div className="rounded-2xl border bg-card p-6 text-center shadow-sm sm:p-8">
        <MailCheck className="mx-auto h-10 w-10 text-brand" />
        <h1 className="mt-4 text-xl font-semibold">Confirma tu correo</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Te enviamos un enlace a <span className="font-medium text-foreground">{email}</span>. Después de confirmarlo, inicia sesión y
          terminaremos de crear tu empresa.
        </p>
        <Button className="mt-6" variant="outline" onClick={() => router.push("/login")}>
          Ir a iniciar sesión
        </Button>
      </div>
    );
  }

  const signedInWithoutCompany = !loading && !!user && !profile?.company_id;

  return (
    <div className="rounded-2xl border bg-card p-6 shadow-sm sm:p-8">
      <h1 className="text-xl font-semibold">{signedInWithoutCompany ? "Crea tu empresa" : "Crea la cuenta de tu negocio"}</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {signedInWithoutCompany
          ? `Estás conectado como ${user?.email}. Solo falta el nombre de tu empresa.`
          : "Empieza gratis. Tu información queda aislada de cualquier otra empresa."}
      </p>

      <form onSubmit={onSubmit} className="mt-6 grid gap-4">
        <FormField label="Tu nombre" autoComplete="name" required value={fullName} onChange={(e) => setFullName(e.target.value)} />
        <FormField label="Nombre de la empresa" required value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="Ej. Velas del Caribe" />
        <NativeSelectField label="Moneda" options={currencies} value={currency} onValueChange={setCurrency} />
        {!signedInWithoutCompany && (
          <>
            <FormField label="Correo electrónico" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            <FormField
              label="Contraseña"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              description="Mínimo 8 caracteres."
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </>
        )}
        {error && <Callout tone="danger">{error}</Callout>}
        <Button type="submit" size="lg" className="h-10 bg-brand text-brand-foreground hover:bg-brand/90" disabled={submitting}>
          {submitting && <Loader2 className="h-4 w-4 animate-spin" />} {signedInWithoutCompany ? "Crear empresa" : "Crear cuenta"}
        </Button>
      </form>

      {!signedInWithoutCompany && (
        <p className="mt-6 text-center text-sm text-muted-foreground">
          ¿Ya tienes cuenta?{" "}
          <Link href="/login" className="font-medium text-brand hover:underline">
            Inicia sesión
          </Link>
        </p>
      )}
      <p className="mt-2 text-center text-xs text-muted-foreground">¿Te invitaron a un equipo? Abre el enlace de invitación que recibiste.</p>
    </div>
  );
}
