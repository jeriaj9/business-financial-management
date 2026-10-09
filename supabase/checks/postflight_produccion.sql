-- Verificación posterior (solo lectura) después de aplicar las migraciones 0006–0011.
--
-- Confirma que la seguridad quedó cerrada y que las ventas anteriores se migraron completas.
-- Pégala en el SQL Editor del proyecto de producción. Todo en "OK" = migración correcta.

BEGIN TRANSACTION READ ONLY;

WITH checks(orden, verificacion, estado, detalle) AS (
    SELECT 1, 'Migraciones registradas',
        CASE WHEN to_regclass('supabase_migrations.schema_migrations') IS NULL THEN 'REVISAR' ELSE 'OK' END,
        CASE WHEN to_regclass('supabase_migrations.schema_migrations') IS NULL
             THEN 'No hay historial de la CLI (aplicadas a mano): confirma que corriste 0006 a 0011.'
             ELSE COALESCE((xpath('/row/v/text()', query_to_xml(
                 'SELECT string_agg(version, '', '' ORDER BY version) AS v FROM supabase_migrations.schema_migrations', FALSE, TRUE, '')))[1]::TEXT, '(ninguna)')
        END

    UNION ALL
    SELECT 2, 'Tablas nuevas presentes',
        CASE WHEN COUNT(*) = 0 THEN 'OK' ELSE 'REVISAR' END,
        COALESCE('Faltan: ' || string_agg(t, ', '), 'Las 18 tablas existen')
    FROM (VALUES ('document_sequences'), ('sales_channels'), ('customers'), ('suppliers'), ('material_cost_history'),
                 ('product_price_history'), ('invoices'), ('invoice_lines'), ('purchases'), ('purchase_lines'),
                 ('payments'), ('production_orders'), ('production_consumptions'), ('distributor_users'),
                 ('company_invitations'), ('distributor_orders'), ('distributor_order_lines'), ('legacy_sales')) x(t)
    WHERE to_regclass('public.' || t) IS NULL

    UNION ALL
    SELECT 3, 'RLS activo en todas las tablas públicas',
        CASE WHEN COUNT(*) = 0 THEN 'OK' ELSE 'REVISAR' END,
        COALESCE('Sin RLS: ' || string_agg(c.relname, ', '), 'Todas con RLS')
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity

    UNION ALL
    SELECT 4, 'Acceso anónimo a tablas',
        CASE WHEN COUNT(*) = 0 THEN 'OK' ELSE 'REVISAR' END,
        COALESCE(string_agg(DISTINCT table_name, ', '), 'Sin permisos para anon')
    FROM information_schema.role_table_grants
    WHERE table_schema = 'public' AND grantee = 'anon'

    UNION ALL
    SELECT 5, 'Funciones de ventas antiguas eliminadas',
        CASE WHEN COUNT(*) = 0 THEN 'OK' ELSE 'REVISAR' END,
        COALESCE(string_agg(p.oid::REGPROCEDURE::TEXT, ', '), 'process_sale y reverse_sale ya no existen')
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname IN ('process_sale', 'reverse_sale')

    UNION ALL
    SELECT 6, 'Políticas inseguras eliminadas',
        CASE WHEN COUNT(*) = 0 THEN 'OK' ELSE 'REVISAR' END,
        COALESCE(string_agg(policyname, ', '), 'No quedan')
    FROM pg_policies
    WHERE schemaname = 'public' AND policyname IN ('Users can insert their own profile', 'Anyone can create a company')

    UNION ALL
    SELECT 7, 'Funciones nuevas sin acceso anónimo',
        CASE WHEN COUNT(*) = 0 THEN 'OK' ELSE 'REVISAR' END,
        COALESCE(string_agg(p.proname, ', '), 'Solo invitation_preview es pública')
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('create_invoice', 'void_invoice', 'replace_invoice', 'register_payment', 'create_purchase',
                        'complete_production_order', 'adjust_inventory', 'save_product', 'accept_invitation',
                        'portal_catalog', 'portal_submit_order', 'portal_statement')
      AND has_function_privilege('anon', p.oid, 'EXECUTE')

    UNION ALL
    SELECT 8, 'Ventas anteriores migradas a facturas',
        CASE WHEN l.lines = i.lines AND round(l.total, 2) = round(i.total, 2) THEN 'OK' ELSE 'REVISAR' END,
        'Antes: ' || l.lines || ' líneas por ' || round(l.total, 2) || ' · Ahora: ' || i.lines || ' líneas por ' || round(i.total, 2)
    FROM (SELECT COUNT(*) AS lines, COALESCE(SUM(total_revenue), 0) AS total FROM legacy_sales WHERE company_id IS NOT NULL AND quantity > 0) l,
         (SELECT COUNT(*) AS lines, COALESCE(SUM(l.line_total), 0) AS total
          FROM invoice_lines l JOIN invoices v ON v.id = l.invoice_id WHERE v.source = 'legacy') i

    UNION ALL
    SELECT 9, 'Cada empresa con su configuración y canales',
        CASE WHEN COUNT(*) = 0 THEN 'OK' ELSE 'REVISAR' END,
        COALESCE('Incompletas: ' || string_agg(c.name, ', '), 'Todas completas')
    FROM companies c
    WHERE (SELECT COUNT(*) FROM settings s WHERE s.company_id = c.id) <> 1
       OR NOT EXISTS (SELECT 1 FROM sales_channels ch WHERE ch.company_id = c.id AND ch.kind = 'direct')
       OR NOT EXISTS (SELECT 1 FROM sales_channels ch WHERE ch.company_id = c.id AND ch.kind = 'distributor')

    UNION ALL
    SELECT 10, 'Productos con receta y costo calculado',
        CASE WHEN COUNT(*) = 0 THEN 'OK' ELSE 'REVISAR' END,
        COALESCE('Costo en cero: ' || string_agg(p.name, ', '), 'Todos con costo')
    FROM products p
    WHERE EXISTS (SELECT 1 FROM bom_items b WHERE b.product_id = p.id) AND p.total_cost <= 0

    UNION ALL
    SELECT 11, 'Productos sin precio de lista (informativo)', 'OK',
        COALESCE((SELECT string_agg(name, ', ') FROM products WHERE COALESCE(retail_price, 0) = 0), '—')

    UNION ALL
    SELECT 12, 'Modo de mano de obra por empresa (informativo)', 'OK',
        (SELECT string_agg(c.name || ': ' || s.labor_payment_mode, ', ') FROM settings s JOIN companies c ON c.id = s.company_id)

    UNION ALL
    SELECT 13, 'Resumen (informativo)', 'OK',
        (SELECT COUNT(*) FROM invoices)::TEXT || ' facturas, '
        || (SELECT COUNT(*) FROM invoices WHERE status = 'issued' AND balance > 0.009)::TEXT || ' por cobrar, '
        || (SELECT COUNT(*) FROM customers)::TEXT || ' clientes, '
        || (SELECT COUNT(*) FROM suppliers)::TEXT || ' proveedores, '
        || (SELECT COUNT(*) FROM sales_channels)::TEXT || ' canales'
)
SELECT verificacion, estado, detalle FROM checks ORDER BY orden;

ROLLBACK;
