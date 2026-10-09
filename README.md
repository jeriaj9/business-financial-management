# Rinde (nombre provisional)

Plataforma multiempresa para pequeños productores que fabrican lo que venden: costos por receta,
producción, compras, ventas y distribuidores conectados, con análisis para decidir.

- **Landing** (`/`): propuesta de valor y diferenciación.
- **Portal de negocio** (`/app`): resumen, rentabilidad por producto/canal/cliente, impacto de
  costos, simulador, plan de producción/compras con caja a 13 semanas, informe del mes, y la
  operación diaria (ventas, pedidos, producción, compras, inventario, gastos, configuración).
- **Portal de distribuidores** (`/distribuidor`): catálogo con sus precios, pedidos y estado de cuenta.

El nombre y la descripción se cambian en `src/config/brand.ts`. Los textos compartidos están en `src/i18n/`.

## Arquitectura

| Capa | Dónde | Qué hace |
|---|---|---|
| Base de datos | `supabase/migrations/` | Esquema, RLS por empresa y funciones RPC atómicas. Toda escritura de inventario o documentos financieros pasa por RPC; los documentos se anulan, no se borran. |
| Motores de cálculo | `src/lib/domain/` | Funciones puras (sin I/O): costeo, rentabilidad, impacto de costos, producción, simulador, planificación y caja, informe mensual. |
| Datos | `src/lib/data/` | Hooks SWR y conversión de filas a tipos del dominio. |
| Interfaz | `src/app/` | `(marketing)`, `(auth)`, `app/` (negocio) y `distribuidor/`. |

La empresa siempre se deriva del usuario autenticado (`auth.uid()`), nunca de lo que envía el navegador.
Los distribuidores no tienen acceso directo a tablas: solo a funciones `portal_*` que nunca exponen costos.

### Mano de obra

Cada empresa elige en **Configuración → Costeo y precios** cómo paga la producción:

- **Salario fijo**: horas × tarifa sirve para fijar precios, pero no entra al costo de lo vendido (el salario va en Gastos).
- **Por hora trabajada**: horas × tarifa entra al costo de lo vendido; las horas reales salen de cada orden de producción.
- **Por pieza producida**: cada producto tiene su pago por unidad, que entra al costo de lo vendido.

## Desarrollo local

Requisitos: Node 20.9+ y Docker Desktop.

```bash
npm ci
npx supabase start          # levanta Postgres, Auth y API locales
npx supabase db reset       # aplica migraciones y carga supabase/seed.sql
npm run dev
```

`.env.local` (no se versiona) debe apuntar a la instancia local:

```bash
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<ANON_KEY de "npx supabase status">
```

`supabase/seed.sql` crea una empresa ficticia con seis meses de operación y dos usuarios de prueba
(administrador y distribuidor); las credenciales están al inicio de ese archivo. Solo se usa en local.

## Pruebas

```bash
npm test                     # 46 pruebas unitarias de los motores (Vitest)
npm run lint
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -f supabase/tests/rpc_scenarios.sql
```

`rpc_scenarios.sql` recorre aislamiento entre empresas, roles, invitaciones, compras, producción,
ventas, correcciones, portal de distribuidores y modos de mano de obra. Corre en una transacción y
no deja datos.

## Aplicar en producción

Las migraciones 0006–0011 cambian el modelo de datos y migran las ventas existentes a facturas.

1. **Respaldo**: descarga un respaldo del proyecto (Supabase → Database → Backups, o `pg_dump`).
2. **Verificación previa**: ejecuta `supabase/checks/preflight_produccion.sql` en el SQL Editor del
   proyecto de producción. Es de solo lectura. Todo debe salir `OK`; si algo sale `REVISAR`
   (por ejemplo, objetos creados a mano), resuélvelo antes de seguir.
3. **Historial de migraciones**: si la verificación indica que no existe el historial de la CLI y
   el esquema coincide con 0001–0005, márcalas como aplicadas:

   ```bash
   npx supabase link --project-ref <ref-del-proyecto>
   npx supabase migration repair --status applied 0001 0002 0003 0005
   ```

4. **Aplicar**: `npx supabase db push` (no ejecuta `seed.sql`). Alternativa: pegar 0006 a 0011 en
   orden en el SQL Editor.
5. **Auth**: en Supabase → Authentication → URL Configuration, agrega la URL del sitio y
   `https://<dominio>/invitacion/*` a las URLs de redirección (las usan los enlaces de invitación
   cuando la confirmación por correo está activa).
6. **Desplegar la web** con las mismas variables de entorno. Las rutas antiguas en inglés
   (`/sales`, `/products`, …) redirigen a las nuevas.

### Después de migrar (por empresa)

- **Configuración → Costeo**: elige el modo de pago de mano de obra. Al pasar a «Por pieza», revisa
  la tarifa de cada producto (se inicializa con la mano de obra por unidad que tenía).
- **Configuración → Canales**: carga comisiones, cargos de pago y costos de envío por canal.
- **Configuración → Caja**: saldo inicial y fecha, para la proyección de caja.
- **Distribuidores**: revisa descuentos, plazos y límites de crédito; invita a cada uno al portal.
- **Equipo**: los usuarios existentes mantienen su rol; los nuevos entran solo por invitación.

Las ventas migradas quedan como facturas con origen «legacy». Su costo de lo vendido es el que se
guardó en su momento (que incluía mano de obra y reserva de indirectos), así que los márgenes de
meses anteriores a la migración no son totalmente comparables con los nuevos.
