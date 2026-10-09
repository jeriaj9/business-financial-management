import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  Calculator,
  CalendarClock,
  Check,
  Factory,
  FileText,
  Lock,
  Minus,
  Search,
  ShieldCheck,
  Store,
  TrendingUp,
  Users,
  X,
} from "lucide-react";
import { brand } from "@/config/brand";
import { landing as t } from "@/i18n/landing.es";
import { BrandMark } from "@/components/app/BrandMark";

const featureIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  rentabilidad: BarChart3,
  costos: TrendingUp,
  produccion: Factory,
  simulador: Calculator,
  plan: CalendarClock,
  informe: FileText,
};

const trustIcons = [Lock, FileText, Users, Search];

function CompareCell({ value, highlight }: { value: string; highlight?: boolean }) {
  if (value === "Sí") return <span className="inline-flex items-center gap-1 font-medium text-emerald-400"><Check className="h-4 w-4" /> Sí</span>;
  if (value === "No") return <span className="inline-flex items-center gap-1 text-muted-foreground"><X className="h-4 w-4" /> No</span>;
  if (value === "—") return <Minus className="mx-auto h-4 w-4 text-muted-foreground" />;
  return <span className={highlight ? "font-medium text-emerald-400" : "text-muted-foreground"}>{value}</span>;
}

/** Illustrative product preview built with markup (no screenshots), using the example figures from the copy. */
function HeroPreview() {
  const rows = [
    { name: "Vela lavanda", direct: "52%", dist: "31%", online: "44%" },
    { name: "Difusor de varillas", direct: "48%", dist: "27%", online: "39%" },
    { name: "Sachet", direct: "61%", dist: "−9%", online: "35%" },
  ];
  return (
    <div className="relative">
      <div aria-hidden className="absolute -inset-6 rounded-[2rem] bg-[radial-gradient(ellipse_at_center,var(--brand)_0%,transparent_70%)] opacity-20 blur-2xl" />
      <div className="relative rounded-2xl border bg-card/90 p-4 shadow-2xl backdrop-blur sm:p-5">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold">Margen por producto y canal</p>
          <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">Últimos 90 días</span>
        </div>
        <div className="mt-3 overflow-hidden rounded-lg border text-xs">
          <div className="grid grid-cols-[1.4fr_1fr_1fr_1fr] bg-muted/50 px-3 py-2 text-muted-foreground">
            <span>Producto</span><span className="text-right">Directa</span><span className="text-right">Distrib.</span><span className="text-right">Online</span>
          </div>
          {rows.map((r) => (
            <div key={r.name} className="grid grid-cols-[1.4fr_1fr_1fr_1fr] border-t px-3 py-2">
              <span className="truncate">{r.name}</span>
              <span className="text-right text-emerald-400">{r.direct}</span>
              <span className={`text-right ${r.dist.startsWith("−") ? "font-semibold text-red-400" : "text-amber-400"}`}>{r.dist}</span>
              <span className="text-right text-emerald-400">{r.online}</span>
            </div>
          ))}
        </div>
        <div className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs">
          <p className="font-medium text-amber-400">La cera subió 20%</p>
          <p className="mt-0.5 text-muted-foreground">Vela lavanda perdió 5.5 puntos de margen. Precio que lo restaura: <span className="font-medium text-foreground">RD$453</span>.</p>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
          <div className="rounded-lg border p-2"><p className="text-muted-foreground">Contribución</p><p className="mt-0.5 font-semibold">RD$184,300</p></div>
          <div className="rounded-lg border p-2"><p className="text-muted-foreground">Caja mínima</p><p className="mt-0.5 font-semibold">RD$12,400</p></div>
          <div className="rounded-lg border p-2"><p className="text-muted-foreground">Pedidos nuevos</p><p className="mt-0.5 font-semibold text-brand">3</p></div>
        </div>
        <p className="mt-3 text-center text-[10px] text-muted-foreground">Vista ilustrativa con datos de ejemplo</p>
      </div>
    </div>
  );
}

export default function LandingPage() {
  return (
    <div className="min-h-dvh bg-background text-foreground">
      {/* Navigation */}
      <header className="sticky top-0 z-40 border-b border-transparent bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <Link href="/" aria-label={brand.name}><BrandMark /></Link>
          <nav className="hidden items-center gap-6 text-sm text-muted-foreground md:flex">
            <a href="#que-resuelve" className="hover:text-foreground">{t.nav.features}</a>
            <a href="#como-funciona" className="hover:text-foreground">{t.nav.how}</a>
            <a href="#distribuidores" className="hover:text-foreground">{t.nav.distributors}</a>
            <a href="#comparacion" className="hover:text-foreground">{t.nav.compare}</a>
            <a href="#preguntas" className="hover:text-foreground">{t.nav.faq}</a>
          </nav>
          <div className="flex items-center gap-2">
            <Link href="/login" className="rounded-lg px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground">{t.nav.login}</Link>
            <Link href="/registro" className="rounded-lg bg-brand px-3 py-1.5 text-sm font-medium text-brand-foreground hover:bg-brand/90">{t.nav.signup}</Link>
          </div>
        </div>
      </header>

      <main>
        {/* Hero */}
        <section className="relative overflow-hidden">
          <div aria-hidden className="pointer-events-none absolute inset-x-0 -top-40 h-[520px] bg-[radial-gradient(ellipse_at_top,var(--brand)_0%,transparent_60%)] opacity-[0.12]" />
          <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-4 pb-20 pt-14 sm:px-6 lg:grid-cols-[1.1fr_1fr] lg:pt-24">
            <div>
              <p className="inline-flex items-center gap-2 rounded-full border border-brand/30 bg-brand/10 px-3 py-1 text-xs font-medium text-brand">{t.hero.eyebrow}</p>
              <h1 className="mt-5 text-4xl font-semibold leading-[1.1] tracking-tight sm:text-5xl lg:text-6xl">{t.hero.title}</h1>
              <p className="mt-5 max-w-xl text-lg leading-relaxed text-muted-foreground">{t.hero.subtitle}</p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link href="/registro" className="inline-flex items-center gap-2 rounded-xl bg-brand px-5 py-3 text-sm font-semibold text-brand-foreground shadow-lg shadow-brand/20 hover:bg-brand/90">
                  {t.hero.primary} <ArrowRight className="h-4 w-4" />
                </Link>
                <a href="#como-funciona" className="inline-flex items-center rounded-xl border px-5 py-3 text-sm font-medium hover:bg-muted">{t.hero.secondary}</a>
              </div>
              <p className="mt-4 text-sm text-muted-foreground">{t.hero.note}</p>
            </div>
            <HeroPreview />
          </div>
        </section>

        {/* Problem */}
        <section className="border-y bg-card/40">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
            <h2 className="max-w-2xl text-2xl font-semibold tracking-tight sm:text-3xl">{t.problem.title}</h2>
            <ul className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              {t.problem.items.map((item) => (
                <li key={item.tool} className="rounded-xl border bg-background p-4">
                  <p className="text-sm font-semibold">{item.tool}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{item.pain}</p>
                </li>
              ))}
            </ul>
            <p className="mt-6 max-w-3xl text-base text-muted-foreground">{t.problem.conclusion}</p>
          </div>
        </section>

        {/* Features */}
        <section id="que-resuelve" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-20 sm:px-6">
          <div className="max-w-2xl">
            <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">{t.features.title}</h2>
            <p className="mt-3 text-lg text-muted-foreground">{t.features.subtitle}</p>
          </div>
          <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {t.features.items.map((f) => {
              const Icon = featureIcons[f.key] ?? BarChart3;
              return (
                <article key={f.key} className="flex flex-col rounded-2xl border bg-card p-6">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand/15 text-brand"><Icon className="h-5 w-5" /></span>
                  <h3 className="mt-4 text-lg font-semibold leading-snug">{f.title}</h3>
                  <p className="mt-2 flex-1 text-sm leading-relaxed text-muted-foreground">{f.body}</p>
                  <p className="mt-4 rounded-lg bg-muted/60 p-3 text-xs leading-relaxed text-muted-foreground">{f.example}</p>
                </article>
              );
            })}
          </div>
        </section>

        {/* How it works */}
        <section id="como-funciona" className="scroll-mt-20 border-y bg-card/40">
          <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
            <h2 className="text-3xl font-semibold tracking-tight">{t.how.title}</h2>
            <ol className="mt-10 grid gap-6 md:grid-cols-3">
              {t.how.steps.map((step, i) => (
                <li key={step.title} className="relative rounded-2xl border bg-background p-6">
                  <span className="text-sm font-semibold text-brand">Paso {i + 1}</span>
                  <h3 className="mt-2 text-lg font-semibold">{step.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{step.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Distributors */}
        <section id="distribuidores" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-20 sm:px-6">
          <div className="grid items-center gap-10 lg:grid-cols-2">
            <div>
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand/15 text-brand"><Store className="h-5 w-5" /></span>
              <h2 className="mt-4 text-3xl font-semibold tracking-tight">{t.distributors.title}</h2>
              <p className="mt-3 text-lg leading-relaxed text-muted-foreground">{t.distributors.body}</p>
            </div>
            <ul className="grid gap-3">
              {t.distributors.points.map((p) => (
                <li key={p} className="flex items-start gap-3 rounded-xl border bg-card p-4 text-sm">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" /> {p}
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Comparison */}
        <section id="comparacion" className="scroll-mt-20 border-y bg-card/40">
          <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
            <h2 className="text-3xl font-semibold tracking-tight">{t.compare.title}</h2>
            <div className="mt-8 overflow-x-auto rounded-2xl border bg-background">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b">
                    {t.compare.columns.map((c, i) => (
                      <th key={i} scope="col" className={`px-4 py-3 font-medium ${i === 0 ? "text-left" : "text-center"} ${i === 3 ? "bg-brand/10 text-brand" : "text-muted-foreground"}`}>
                        {i === 3 ? brand.name : c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {t.compare.rows.map((row) => (
                    <tr key={row.label} className="border-b last:border-0">
                      <th scope="row" className="px-4 py-3 text-left font-normal">{row.label}</th>
                      {row.values.map((v, i) => (
                        <td key={i} className={`px-4 py-3 text-center ${i === 2 ? "bg-brand/5" : ""}`}><CompareCell value={v} highlight={i === 2} /></td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">{t.compare.footnote}</p>
          </div>
        </section>

        {/* Audience + trust */}
        <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
          <div className="grid gap-12 lg:grid-cols-2">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight">{t.audience.title}</h2>
              <ul className="mt-6 flex flex-wrap gap-2">
                {t.audience.items.map((a) => <li key={a} className="rounded-full border px-3 py-1.5 text-sm">{a}</li>)}
              </ul>
              <p className="mt-4 text-sm text-muted-foreground">{t.audience.note}</p>
            </div>
            <div>
              <h2 className="flex items-center gap-2 text-2xl font-semibold tracking-tight"><ShieldCheck className="h-6 w-6 text-brand" /> {t.trust.title}</h2>
              <ul className="mt-6 grid gap-4 sm:grid-cols-2">
                {t.trust.items.map((item, i) => {
                  const Icon = trustIcons[i] ?? Lock;
                  return (
                    <li key={item.title}>
                      <p className="flex items-center gap-2 text-sm font-semibold"><Icon className="h-4 w-4 text-muted-foreground" /> {item.title}</p>
                      <p className="mt-1 text-sm text-muted-foreground">{item.body}</p>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section id="preguntas" className="scroll-mt-20 border-t bg-card/40">
          <div className="mx-auto max-w-3xl px-4 py-20 sm:px-6">
            <h2 className="text-3xl font-semibold tracking-tight">{t.faq.title}</h2>
            <div className="mt-8 grid gap-3">
              {t.faq.items.map((item) => (
                <details key={item.q} className="group rounded-xl border bg-background p-4">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium">
                    {item.q}
                    <span className="text-muted-foreground transition-transform group-open:rotate-45" aria-hidden>+</span>
                  </summary>
                  <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{item.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* Final CTA */}
        <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
          <div className="relative overflow-hidden rounded-3xl border bg-card px-6 py-14 text-center sm:px-12">
            <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_bottom,var(--brand)_0%,transparent_65%)] opacity-15" />
            <h2 className="relative text-3xl font-semibold tracking-tight sm:text-4xl">{t.cta.title}</h2>
            <p className="relative mx-auto mt-3 max-w-xl text-muted-foreground">{t.cta.body}</p>
            <div className="relative mt-8 flex flex-wrap justify-center gap-3">
              <Link href="/registro" className="inline-flex items-center gap-2 rounded-xl bg-brand px-5 py-3 text-sm font-semibold text-brand-foreground hover:bg-brand/90">{t.cta.primary} <ArrowRight className="h-4 w-4" /></Link>
              <Link href="/login" className="inline-flex items-center rounded-xl border px-5 py-3 text-sm font-medium hover:bg-muted">{t.cta.secondary}</Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-8 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="flex items-center gap-3">
            <BrandMark showName={false} />
            <span>{brand.name} · {brand.tagline}</span>
          </div>
          <div className="flex gap-4">
            <Link href="/login" className="hover:text-foreground">Iniciar sesión</Link>
            <Link href="/registro" className="hover:text-foreground">Crear cuenta</Link>
            <Link href="/distribuidor" className="hover:text-foreground">Portal de distribuidores</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
