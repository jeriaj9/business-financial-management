'use client';

import { use, useState } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { Loader2, Store, Users } from "lucide-react";
import { supabase, supabaseAuth } from "@/lib/supabase";
import { friendlyError } from "@/lib/errors";
import { useAuth, type SessionUser } from "@/components/auth/AuthProvider";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Callout, LoadingState } from "@/components/ui/page";
import { es } from "@/i18n/es";

interface Preview {
  kind: "member" | "distributor";
  role: string | null;
  company_name: string;
  distributor_name: string | null;
  email: string | null;
  status: "valid" | "accepted" | "expired" | "revoked";
}

export default function InvitationPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const router = useRouter();
  const { user, status, refresh, signOut } = useAuth();
  const [mode, setMode] = useState<"signup" | "login">("signup");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: preview, isLoading } = useSWR(["invitation", token], async () => {
    const { data, error: rpcError } = await supabase.rpc("invitation_preview", { p_token: token });
    if (rpcError) throw rpcError;
    return data as Preview | null;
  });

  // `account` is the user that just signed in here (the auth state may not have caught up yet)
  const accept = async (account?: SessionUser) => {
    const { data, error: rpcError } = await supabase.rpc("accept_invitation", { p_token: token, p_full_name: fullName.trim() || null });
    if (rpcError) throw rpcError;
    await refresh(account);
    router.replace((data as { kind: string }).kind === "distributor" ? "/distribuidor" : "/app");
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      let account: SessionUser | undefined;
      if (!user) {
        if (mode === "signup") {
          const { data, error: signUpError } = await supabaseAuth.signUp({
            email: (preview?.email ?? email).trim(),
            password,
            options: { data: { full_name: fullName.trim() }, emailRedirectTo: `${window.location.origin}/invitacion/${token}` },
          });
          if (signUpError) throw signUpError;
          if (!data.session || !data.user) {
            setError("Te enviamos un correo para confirmar tu cuenta. Confírmalo y vuelve a abrir este enlace.");
            return;
          }
          account = { id: data.user.id, email: data.user.email };
        } else {
          const { data, error: loginError } = await supabaseAuth.signInWithPassword({ email: (preview?.email ?? email).trim(), password });
          if (loginError) throw loginError;
          account = { id: data.user.id, email: data.user.email };
        }
      }
      await accept(account);
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  };

  if (isLoading || status === "loading") return <LoadingState label="Verificando invitación…" />;

  if (!preview || preview.status !== "valid") {
    const reason =
      !preview ? "Este enlace no es válido." :
      preview.status === "accepted" ? "Esta invitación ya fue utilizada." :
      preview.status === "expired" ? "Esta invitación expiró. Pide una nueva a quien te invitó." :
      "Esta invitación fue revocada.";
    return (
      <div className="rounded-2xl border bg-card p-6 shadow-sm sm:p-8">
        <h1 className="text-xl font-semibold">Invitación no disponible</h1>
        <Callout tone="warning" className="mt-4">{reason}</Callout>
        <Button className="mt-6" variant="outline" onClick={() => router.push("/login")}>Ir a iniciar sesión</Button>
      </div>
    );
  }

  const isDistributor = preview.kind === "distributor";

  return (
    <div className="rounded-2xl border bg-card p-6 shadow-sm sm:p-8">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand/15 text-brand">
          {isDistributor ? <Store className="h-5 w-5" /> : <Users className="h-5 w-5" />}
        </span>
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Invitación</p>
          <h1 className="text-lg font-semibold leading-tight">{preview.company_name}</h1>
        </div>
      </div>
      <p className="mt-4 text-sm text-muted-foreground">
        {isDistributor
          ? <>Te invitaron al portal de distribuidores como <span className="font-medium text-foreground">{preview.distributor_name}</span>. Podrás ver precios, hacer pedidos y consultar tu estado de cuenta.</>
          : <>Te invitaron a unirte al equipo con el rol <span className="font-medium text-foreground">{es.roles[preview.role ?? "view"]}</span>.</>}
      </p>

      {user ? (
        <div className="mt-6 grid gap-4">
          <p className="text-sm">Conectado como <span className="font-medium">{user.email}</span>.</p>
          {!isDistributor && <FormField label="Tu nombre" value={fullName} onChange={(e) => setFullName(e.target.value)} />}
          {error && <Callout tone="danger">{error}</Callout>}
          <Button size="lg" className="h-10 bg-brand text-brand-foreground hover:bg-brand/90" disabled={busy} onClick={() => { setBusy(true); setError(null); accept().catch((err) => setError(friendlyError(err))).finally(() => setBusy(false)); }}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} Aceptar invitación
          </Button>
          <button className="text-xs text-muted-foreground underline" onClick={() => signOut(`/invitacion/${token}`)}>Usar otra cuenta</button>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="mt-6 grid gap-4">
          <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1 text-sm">
            {(["signup", "login"] as const).map((m) => (
              <button key={m} type="button" onClick={() => setMode(m)} className={`rounded-md py-1.5 ${mode === m ? "bg-background font-medium" : "text-muted-foreground"}`}>
                {m === "signup" ? "Crear cuenta" : "Ya tengo cuenta"}
              </button>
            ))}
          </div>
          {mode === "signup" && <FormField label="Tu nombre" required value={fullName} onChange={(e) => setFullName(e.target.value)} />}
          <FormField label="Correo electrónico" type="email" required value={preview.email ?? email} disabled={!!preview.email} onChange={(e) => setEmail(e.target.value)} />
          <FormField label="Contraseña" type="password" required minLength={mode === "signup" ? 8 : undefined} value={password} onChange={(e) => setPassword(e.target.value)} />
          {error && <Callout tone="danger">{error}</Callout>}
          <Button type="submit" size="lg" className="h-10 bg-brand text-brand-foreground hover:bg-brand/90" disabled={busy}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} {mode === "signup" ? "Crear cuenta y aceptar" : "Entrar y aceptar"}
          </Button>
        </form>
      )}
    </div>
  );
}
