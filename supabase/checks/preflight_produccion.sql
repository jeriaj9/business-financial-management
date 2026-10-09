-- Verificación previa (solo lectura) antes de aplicar las migraciones 0006–0011 en producción.
--
-- Compara el esquema real con lo que crean las migraciones 0001–0005 del repositorio y busca
-- datos que harían fallar las migraciones nuevas. No modifica nada: corre dentro de una
-- transacción de solo lectura que se revierte al final.
--
-- Cómo usarla: pégala completa en el SQL Editor de Supabase (proyecto de producción) y ejecútala.
-- Devuelve una sola tabla. Todo en "OK" = se puede aplicar. Cualquier "REVISAR" = compártelo
-- antes de aplicar (en especial si aparece algo creado a mano, que sería la migración 0004).

BEGIN TRANSACTION READ ONLY;

WITH
expected_tables(t) AS (
    VALUES ('settings'), ('materials'), ('products'), ('bom_items'), ('distributors'), ('sales'),
           ('expenses'), ('inventory_transactions'), ('companies'), ('user_profiles')
),
expected_columns(t, c) AS (
    SELECT 'settings', unnest(ARRAY['id','labor_cost_per_hour','distributor_margin','promotional_discount','indirect_cost_reserve','currency','updated_at','company_id'])
    UNION ALL SELECT 'materials', unnest(ARRAY['id','name','category','supplier','unit_of_measure','cost_per_unit','current_stock','reorder_point','notes','created_at','updated_at','company_id'])
    UNION ALL SELECT 'products', unnest(ARRAY['id','sku','name','category','description','batch_size','production_time_hours','calculated_material_cost','calculated_labor_cost','calculated_indirect_cost','total_cost','target_margin','retail_price','distributor_price','promotional_price','current_stock','created_at','updated_at','company_id'])
    UNION ALL SELECT 'bom_items', unnest(ARRAY['id','product_id','material_id','quantity','is_optional','created_at','company_id'])
    UNION ALL SELECT 'distributors', unnest(ARRAY['id','name','contact_name','email','phone','pricing_tier','margin_override','outstanding_balance','territory_notes','created_at','company_id'])
    UNION ALL SELECT 'sales', unnest(ARRAY['id','invoice_number','sale_date','channel','customer_name','distributor_id','product_id','quantity','unit_price','discount','total_revenue','cogs','gross_profit','payment_status','created_at','company_id'])
    UNION ALL SELECT 'expenses', unnest(ARRAY['id','expense_date','category','description','vendor','amount','payment_method','notes','created_at','company_id'])
    UNION ALL SELECT 'inventory_transactions', unnest(ARRAY['id','item_type','item_id','transaction_type','quantity','reference_id','notes','created_at','company_id'])
    UNION ALL SELECT 'companies', unnest(ARRAY['id','name','created_at'])
    UNION ALL SELECT 'user_profiles', unnest(ARRAY['id','company_id','role','full_name','created_at'])
),
expected_functions(f) AS (
    VALUES ('get_auth_company_id'), ('get_auth_role'), ('process_sale'), ('reverse_sale'),
           -- Supabase's documented helper that enables RLS on new public tables (event trigger "ensure_rls")
           ('rls_auto_enable')
),
new_objects(t) AS (
    VALUES ('document_sequences'), ('sales_channels'), ('customers'), ('suppliers'), ('material_cost_history'),
           ('product_price_history'), ('invoices'), ('invoice_lines'), ('purchases'), ('purchase_lines'),
           ('payments'), ('production_orders'), ('production_consumptions'), ('distributor_users'),
           ('company_invitations'), ('distributor_orders'), ('distributor_order_lines'), ('legacy_sales')
),
public_tables AS (
    SELECT table_name AS t FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
),
checks(orden, verificacion, estado, detalle) AS (
    -- Migration history recorded by the Supabase CLI (if it was used)
    SELECT 1, 'Historial de migraciones (CLI)',
        CASE WHEN to_regclass('supabase_migrations.schema_migrations') IS NULL THEN 'REVISAR' ELSE 'OK' END,
        CASE WHEN to_regclass('supabase_migrations.schema_migrations') IS NULL
             THEN 'No existe: las migraciones se aplicaron a mano. Antes de "supabase db push" hay que marcar 0001–0005 como aplicadas (ver README).'
             ELSE 'Versiones registradas: ' || COALESCE((xpath('/row/v/text()', query_to_xml(
                 'SELECT string_agg(version, '', '' ORDER BY version) AS v FROM supabase_migrations.schema_migrations', FALSE, TRUE, '')))[1]::TEXT, '(ninguna)')
        END

    -- Schema created outside the repository (a manual "0004" would show up here)
    UNION ALL
    SELECT 2, 'Tablas que no están en 0001–0005',
        CASE WHEN COUNT(*) = 0 THEN 'OK' ELSE 'REVISAR' END,
        COALESCE(string_agg(t, ', '), '—')
    FROM public_tables WHERE t NOT IN (SELECT t FROM expected_tables) AND t NOT IN (SELECT t FROM new_objects)

    UNION ALL
    SELECT 3, 'Columnas que no están en 0001–0005',
        CASE WHEN COUNT(*) = 0 THEN 'OK' ELSE 'REVISAR' END,
        COALESCE(string_agg(c.table_name || '.' || c.column_name, ', '), '—')
    FROM information_schema.columns c
    WHERE c.table_schema = 'public' AND c.table_name IN (SELECT t FROM expected_tables)
      AND (c.table_name, c.column_name) NOT IN (SELECT t, c FROM expected_columns)

    UNION ALL
    SELECT 4, 'Columnas esperadas que faltan',
        CASE WHEN COUNT(*) = 0 THEN 'OK' ELSE 'REVISAR' END,
        COALESCE(string_agg(e.t || '.' || e.c, ', '), '—')
    FROM expected_columns e
    WHERE NOT EXISTS (SELECT 1 FROM information_schema.columns c WHERE c.table_schema = 'public' AND c.table_name = e.t AND c.column_name = e.c)

    UNION ALL
    SELECT 5, 'Funciones que no están en 0001–0005',
        CASE WHEN COUNT(*) = 0 THEN 'OK' ELSE 'REVISAR' END,
        COALESCE(string_agg(p.oid::REGPROCEDURE::TEXT, ', '), '—')
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    LEFT JOIN pg_depend d ON d.objid = p.oid AND d.deptype = 'e'
    WHERE n.nspname = 'public' AND d.objid IS NULL AND p.proname NOT IN (SELECT f FROM expected_functions)

    UNION ALL
    SELECT 5, 'Event triggers (informativo)',
        CASE WHEN COUNT(*) FILTER (WHERE evtfoid::REGPROC::TEXT <> 'rls_auto_enable') = 0 THEN 'OK' ELSE 'REVISAR' END,
        COALESCE(string_agg(evtname || ' → ' || evtfoid::REGPROC::TEXT || CASE WHEN evtenabled = 'D' THEN ' (desactivado)' ELSE '' END, ', '), '—')
    FROM pg_event_trigger
    WHERE evtfoid::REGPROC::TEXT NOT LIKE 'extensions.%' AND evtfoid::REGPROC::TEXT NOT LIKE 'pgsodium.%'
      AND evtname NOT IN ('issue_graphql_placeholder', 'issue_pg_cron_access', 'issue_pg_graphql_access', 'issue_pg_net_access',
                          'pgrst_ddl_watch', 'pgrst_drop_watch', 'pgsodium_trg_mask_update')

    UNION ALL
    SELECT 6, 'Triggers en tablas públicas',
        CASE WHEN COUNT(*) = 0 THEN 'OK' ELSE 'REVISAR' END,
        COALESCE(string_agg(event_object_table || '.' || trigger_name, ', '), '—')
    FROM information_schema.triggers WHERE trigger_schema = 'public'

    UNION ALL
    SELECT 7, 'Políticas RLS que no están en 0002',
        CASE WHEN COUNT(*) = 0 THEN 'OK' ELSE 'REVISAR' END,
        COALESCE(string_agg(tablename || ': ' || policyname, '; '), '—')
    FROM pg_policies
    WHERE schemaname = 'public'
      AND policyname NOT LIKE 'Company isolation %'
      AND policyname NOT IN ('Users can view their own company', 'Anyone can create a company', 'Admins can update company',
                             'Users can view company profiles', 'Users can insert their own profile', 'Admins can update roles')

    UNION ALL
    SELECT 8, 'Tablas nuevas que ya existen',
        CASE WHEN COUNT(*) = 0 THEN 'OK' ELSE 'REVISAR' END,
        COALESCE(string_agg(t, ', '), '—')
    FROM public_tables WHERE t IN (SELECT t FROM new_objects)

    -- Data that would make the new migrations fail or need attention
    UNION ALL
    SELECT 9, 'SKU repetidos dentro de una empresa',
        CASE WHEN COUNT(*) = 0 THEN 'OK' ELSE 'REVISAR' END,
        COALESCE(string_agg(DISTINCT sku, ', '), '—')
    FROM (SELECT company_id, sku FROM products WHERE COALESCE(trim(sku), '') <> '' GROUP BY 1, 2 HAVING COUNT(*) > 1) d

    UNION ALL
    SELECT 10, 'Descuentos de distribuidor fuera de 0–99 %',
        CASE WHEN COUNT(*) = 0 THEN 'OK' ELSE 'REVISAR' END,
        COALESCE(string_agg(name || ' (' || margin_override || ')', ', '), '—')
    FROM distributors WHERE margin_override IS NOT NULL AND (margin_override < 0 OR margin_override >= 1)

    UNION ALL
    SELECT 11, 'Ventas sin empresa (no se migran)',
        CASE WHEN COUNT(*) = 0 THEN 'OK' ELSE 'REVISAR' END,
        COUNT(*)::TEXT || ' filas'
    FROM sales WHERE company_id IS NULL

    UNION ALL
    SELECT 12, 'Líneas de venta con cantidad 0 o negativa (no se migran)',
        CASE WHEN COUNT(*) = 0 THEN 'OK' ELSE 'REVISAR' END,
        COUNT(*)::TEXT || ' filas'
    FROM sales WHERE quantity <= 0

    UNION ALL
    SELECT 13, 'Usuarios con rol desconocido (pasarán a solo lectura)',
        CASE WHEN COUNT(*) = 0 THEN 'OK' ELSE 'REVISAR' END,
        COUNT(*)::TEXT || ' usuarios'
    FROM user_profiles WHERE role IS NULL OR role NOT IN ('admin', 'edit', 'view')

    UNION ALL
    SELECT 14, 'Empresas con más de una fila de configuración (se conserva la más reciente)',
        CASE WHEN COUNT(*) = 0 THEN 'OK' ELSE 'REVISAR' END,
        COUNT(*)::TEXT || ' empresas'
    FROM (SELECT company_id FROM settings WHERE company_id IS NOT NULL GROUP BY 1 HAVING COUNT(*) > 1) d

    UNION ALL
    SELECT 15, 'Canales de venta usados en ventas (informativo)', 'OK',
        COALESCE((SELECT string_agg(channel || ' (' || n || ')', ', ') FROM (SELECT channel, COUNT(*) n FROM sales GROUP BY 1 ORDER BY 2 DESC) x), '—')

    UNION ALL
    SELECT 16, 'Volumen a migrar (informativo)', 'OK',
        (SELECT COUNT(*) FROM companies)::TEXT || ' empresas, '
        || (SELECT COUNT(*) FROM sales)::TEXT || ' líneas de venta, '
        || (SELECT COUNT(*) FROM products)::TEXT || ' productos, '
        || (SELECT COUNT(*) FROM materials)::TEXT || ' materias primas'
)
SELECT verificacion, estado, detalle FROM checks ORDER BY orden;

ROLLBACK;
