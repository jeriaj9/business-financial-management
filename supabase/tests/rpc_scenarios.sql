-- End-to-end checks for tenancy, permissions and the business RPCs.
-- Runs inside a transaction and rolls back, so it leaves no data behind.
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/rpc_scenarios.sql
\set ON_ERROR_STOP 1
BEGIN;

CREATE FUNCTION pg_temp.login(p_uid TEXT, p_email TEXT) RETURNS VOID LANGUAGE sql AS $$
    SELECT set_config('request.jwt.claims', json_build_object('sub', p_uid, 'email', p_email, 'role', 'authenticated')::TEXT, TRUE);
$$;

CREATE FUNCTION pg_temp.expect_error(p_sql TEXT, p_like TEXT) RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
    BEGIN
        EXECUTE p_sql;
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM NOT ILIKE p_like THEN
            RAISE EXCEPTION 'Expected error like "%" but got "%" for: %', p_like, SQLERRM, p_sql;
        END IF;
        RETURN;
    END;
    RAISE EXCEPTION 'Expected error like "%" but the statement succeeded: %', p_like, p_sql;
END;
$$;

CREATE FUNCTION pg_temp.check(p_ok BOOLEAN, p_message TEXT) RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
    IF p_ok IS DISTINCT FROM TRUE THEN
        RAISE EXCEPTION 'CHECK FAILED: %', p_message;
    END IF;
END;
$$;

INSERT INTO auth.users (id, email) VALUES
    ('11111111-1111-1111-1111-111111111111', 'admin.a@test.local'),
    ('22222222-2222-2222-2222-222222222222', 'editor.a@test.local'),
    ('33333333-3333-3333-3333-333333333333', 'viewer.a@test.local'),
    ('44444444-4444-4444-4444-444444444444', 'admin.b@test.local'),
    ('55555555-5555-5555-5555-555555555555', 'dist.a@test.local'),
    ('66666666-6666-6666-6666-666666666666', 'intruso@test.local');

SET ROLE authenticated;

-- ---------------------------------------------------------------- onboarding
SELECT pg_temp.login('44444444-4444-4444-4444-444444444444', 'admin.b@test.local');
SELECT create_company('Empresa B', 'Admin B') AS company_b \gset

SELECT pg_temp.login('11111111-1111-1111-1111-111111111111', 'admin.a@test.local');
SELECT create_company('Velas A', 'Admin A') AS company_a \gset
SELECT pg_temp.expect_error($$SELECT create_company('Otra', 'X')$$, '%ya pertenece%');
SELECT pg_temp.check((SELECT count(*) FROM sales_channels) = 3, 'new company gets 3 default channels');
SELECT pg_temp.check((SELECT count(*) FROM settings) = 1, 'new company gets its settings row');

-- Intruder cannot attach themselves to company A
SELECT pg_temp.login('66666666-6666-6666-6666-666666666666', 'intruso@test.local');
SELECT pg_temp.expect_error(
    format($$INSERT INTO user_profiles (id, company_id, role) VALUES ('66666666-6666-6666-6666-666666666666', %L, 'admin')$$, :'company_a'),
    '%row-level security%'
);
SELECT pg_temp.expect_error($$INSERT INTO companies (name) VALUES ('hack')$$, '%row-level security%');
SELECT pg_temp.check((SELECT count(*) FROM products) = 0, 'user without company sees no products');

-- Team invitations
SELECT pg_temp.login('11111111-1111-1111-1111-111111111111', 'admin.a@test.local');
SELECT create_member_invitation('edit', 'editor.a@test.local') AS editor_token \gset
SELECT create_member_invitation('view', NULL) AS viewer_token \gset

SELECT pg_temp.login('66666666-6666-6666-6666-666666666666', 'intruso@test.local');
SELECT pg_temp.expect_error(format('SELECT accept_invitation(%L)', :'editor_token'), '%otro correo%');

SELECT pg_temp.login('22222222-2222-2222-2222-222222222222', 'editor.a@test.local');
SELECT accept_invitation(:'editor_token', 'Editor A');
SELECT pg_temp.expect_error(format('SELECT accept_invitation(%L)', :'editor_token'), '%ya fue utilizada%');

SELECT pg_temp.login('33333333-3333-3333-3333-333333333333', 'viewer.a@test.local');
SELECT accept_invitation(:'viewer_token', 'Viewer A');
SELECT pg_temp.check((SELECT role FROM user_profiles WHERE id = auth.uid()) = 'view', 'viewer joined with view role');

-- ---------------------------------------------------------------- master data
SELECT pg_temp.login('22222222-2222-2222-2222-222222222222', 'editor.a@test.local');
INSERT INTO suppliers (company_id, name, payment_terms_days, lead_time_days) VALUES (:'company_a', 'Ceras SRL', 15, 10);
SELECT id AS supplier_id FROM suppliers WHERE name = 'Ceras SRL' \gset
INSERT INTO materials (company_id, name, category, unit_of_measure, cost_per_unit, current_stock, reorder_point, supplier_id)
VALUES (:'company_a', 'Cera de soya', 'Cera', 'g', 0.5, 5000, 1000, :'supplier_id');
INSERT INTO materials (company_id, name, category, unit_of_measure, cost_per_unit, current_stock, reorder_point)
VALUES (:'company_a', 'Fragancia lavanda', 'Fragancia', 'ml', 3, 500, 100);
SELECT id AS wax_id FROM materials WHERE name = 'Cera de soya' \gset
SELECT id AS frag_id FROM materials WHERE name = 'Fragancia lavanda' \gset
SELECT pg_temp.check((SELECT count(*) FROM inventory_transactions WHERE transaction_type = 'OPENING') = 2, 'opening stock is recorded in the ledger');

-- Stock cannot be edited directly
SELECT pg_temp.expect_error(format('UPDATE materials SET current_stock = 1 WHERE id = %L', :'wax_id'), '%permission denied%');
SELECT pg_temp.expect_error($$INSERT INTO inventory_transactions (company_id, item_type, item_id, transaction_type, quantity) VALUES (gen_random_uuid(), 'PRODUCT', gen_random_uuid(), 'IN', 1)$$, '%permission denied%');

SELECT save_product(NULL,
    jsonb_build_object('name', 'Vela lavanda', 'sku', 'VEL-001', 'category', 'Velas', 'batch_size', 10,
                       'production_time_hours', 2, 'retail_price', 400),
    jsonb_build_array(jsonb_build_object('material_id', :'wax_id', 'quantity', 2000),
                      jsonb_build_object('material_id', :'frag_id', 'quantity', 100))
) AS candle_id \gset

-- material 130/u, labor 2h*100/10 = 20/u (fixed by default), overhead 10% = 15 -> full 165, variable 130
SELECT pg_temp.check((SELECT round(total_cost, 2) = 165 AND round(variable_unit_cost, 2) = 130 FROM products WHERE id = :'candle_id'),
                     'product full and variable cost computed from recipe');
SELECT pg_temp.check((SELECT count(*) FROM product_price_history WHERE product_id = :'candle_id') = 1, 'initial price recorded');

-- A manual cost change is recorded and flows into the product cost
UPDATE materials SET cost_per_unit = 0.6 WHERE id = :'wax_id';
SELECT pg_temp.check((SELECT source = 'manual' AND new_cost = 0.6 AND previous_cost = 0.5 FROM material_cost_history
                      WHERE material_id = :'wax_id' ORDER BY effective_at DESC, new_cost DESC LIMIT 1), 'manual cost change recorded');
SELECT pg_temp.check((SELECT round(variable_unit_cost, 2) = 150 FROM products WHERE id = :'candle_id'), 'product cost follows material cost');

-- The same SKU can exist in another company
SELECT pg_temp.login('44444444-4444-4444-4444-444444444444', 'admin.b@test.local');
SELECT save_product(NULL, '{"name":"Otra vela","sku":"VEL-001","batch_size":1,"retail_price":10}'::JSONB, '[]'::JSONB) AS product_b \gset
SELECT pg_temp.expect_error(
    format($$SELECT save_product(NULL, '{"name":"X","batch_size":1}'::JSONB, jsonb_build_array(jsonb_build_object('material_id', %L, 'quantity', 1)))$$, :'wax_id'),
    '%no encontrada%'
);

-- ---------------------------------------------------------------- purchases
SELECT pg_temp.login('22222222-2222-2222-2222-222222222222', 'editor.a@test.local');
SELECT create_purchase(jsonb_build_object(
    'supplier_id', :'supplier_id', 'purchase_date', '2026-09-01',
    'lines', jsonb_build_array(jsonb_build_object('material_id', :'wax_id', 'quantity', 5000, 'unit_cost', 0.7))
)) AS purchase_id \gset

-- avg = (5000*0.5 + 5000*0.7) / 10000 = 0.6 ; replacement cost = 0.7
SELECT pg_temp.check((SELECT current_stock = 10000 AND round(avg_cost, 4) = 0.6 AND cost_per_unit = 0.7 FROM materials WHERE id = :'wax_id'),
                     'purchase updates stock, moving average and replacement cost');
SELECT pg_temp.check((SELECT due_date = '2026-09-16' AND total = 3500 AND number = 'COM-00001' FROM purchases WHERE id = :'purchase_id'),
                     'purchase totals, numbering and supplier terms');
SELECT pg_temp.check((SELECT count(*) FROM material_cost_history WHERE material_id = :'wax_id' AND source = 'purchase' AND reference_id = :'purchase_id') = 1,
                     'purchase cost change recorded with its reference');

SELECT register_payment('purchase', :'purchase_id', 1000, '2026-09-05', 'Transferencia');
SELECT pg_temp.check((SELECT amount_paid = 1000 FROM purchases WHERE id = :'purchase_id'), 'purchase partial payment');
SELECT pg_temp.expect_error(format('SELECT register_payment(%L, %L, 99999)', 'purchase', :'purchase_id'), '%excede%');

-- ---------------------------------------------------------------- production
SELECT create_production_order(:'candle_id', 20, '2026-09-10') AS order_id \gset
-- standard for 20 units: wax 4000 g, fragrance 200 ml; report 10% extra wax (waste)
SELECT complete_production_order(:'order_id', 20, 5,
    jsonb_build_array(jsonb_build_object('material_id', :'wax_id', 'actual_quantity', 4400)), '2026-09-11');

SELECT pg_temp.check((SELECT current_stock = 5600 FROM materials WHERE id = :'wax_id'), 'wax consumed at actual quantity');
SELECT pg_temp.check((SELECT current_stock = 300 FROM materials WHERE id = :'frag_id'), 'unlisted recipe material consumed at standard');
SELECT pg_temp.check((SELECT current_stock = 20 FROM products WHERE id = :'candle_id'), 'finished goods added');
-- actual material: 4400*0.6 + 200*3 = 3240 -> 162/u (labor fixed, not in unit cost)
SELECT pg_temp.check((SELECT round(actual_unit_cost, 2) = 162 AND round(material_cost, 2) = 3240
                             AND round(standard_material_cost, 2) = 3400 AND labor_hours = 5 AND standard_labor_hours = 4
                      FROM production_orders WHERE id = :'order_id'), 'production actual vs standard recorded');
SELECT pg_temp.check((SELECT round(avg_unit_cost, 2) = 162 FROM products WHERE id = :'candle_id'), 'product average actual cost');
SELECT pg_temp.expect_error(format('SELECT cancel_production_order(%L)', :'order_id'), '%planificadas%');

-- ---------------------------------------------------------------- sales
SELECT id AS direct_channel FROM sales_channels WHERE kind = 'direct' \gset
SELECT id AS dist_channel FROM sales_channels WHERE kind = 'distributor' \gset

SELECT create_invoice(jsonb_build_object(
    'issue_date', '2026-09-15', 'channel_id', :'direct_channel', 'customer_name', 'Ana',
    'lines', jsonb_build_array(jsonb_build_object('product_id', :'candle_id', 'quantity', 5, 'discount_pct', 0.1)),
    'payment', jsonb_build_object('amount', 500, 'method', 'Efectivo')
)) AS invoice_id \gset

SELECT pg_temp.check((SELECT total = 1800 AND subtotal = 2000 AND discount_total = 200 AND cogs_total = 810
                             AND amount_paid = 500 AND number = 'FAC-00001' AND due_date = '2026-09-15'
                      FROM invoices WHERE id = :'invoice_id'), 'invoice totals, discount, COGS at actual average cost, payment');
SELECT pg_temp.check((SELECT current_stock = 15 FROM products WHERE id = :'candle_id'), 'sale reduces stock');
SELECT pg_temp.expect_error(
    format($$SELECT create_invoice(jsonb_build_object('channel_id', %L, 'lines', jsonb_build_array(jsonb_build_object('product_id', %L, 'quantity', 100))))$$,
           :'direct_channel', :'candle_id'),
    '%Stock insuficiente%'
);
SELECT pg_temp.expect_error(
    format($$SELECT create_invoice(jsonb_build_object('channel_id', %L, 'lines', jsonb_build_array(jsonb_build_object('product_id', %L, 'quantity', 1))))$$,
           :'direct_channel', :'product_b'),
    '%Producto no encontrado%'
);

-- Correcting an invoice voids the original and issues a new one atomically
SELECT replace_invoice(:'invoice_id', jsonb_build_object(
    'issue_date', '2026-09-15', 'channel_id', :'direct_channel', 'customer_name', 'Ana',
    'lines', jsonb_build_array(jsonb_build_object('product_id', :'candle_id', 'quantity', 4))
)) AS invoice2_id \gset
SELECT pg_temp.check((SELECT status = 'void' AND replaced_by = :'invoice2_id' AND amount_paid = 0 FROM invoices WHERE id = :'invoice_id'), 'original invoice voided');
SELECT pg_temp.check((SELECT count(*) = 1 FROM payments WHERE invoice_id = :'invoice_id' AND voided_at IS NOT NULL), 'payments of voided invoice are voided');
SELECT pg_temp.check((SELECT current_stock = 16 FROM products WHERE id = :'candle_id'), 'stock restored then re-issued (20 - 4)');

-- Viewers cannot write
SELECT pg_temp.login('33333333-3333-3333-3333-333333333333', 'viewer.a@test.local');
SELECT pg_temp.expect_error(format('SELECT void_invoice(%L, %L)', :'invoice2_id', 'x'), '%permisos%');
SELECT pg_temp.check((SELECT count(*) FROM invoices) = 2, 'viewer can read company invoices');

-- Other tenants see nothing and cannot act
SELECT pg_temp.login('44444444-4444-4444-4444-444444444444', 'admin.b@test.local');
SELECT pg_temp.check((SELECT count(*) FROM invoices) = 0, 'company B cannot read company A invoices');
SELECT pg_temp.check((SELECT count(*) FROM materials) = 0, 'company B cannot read company A materials');
SELECT pg_temp.expect_error(format('SELECT void_invoice(%L, %L)', :'invoice2_id', 'x'), '%no encontrada%');
SELECT pg_temp.expect_error(format('SELECT adjust_inventory(%L, %L, 0, %L)', 'PRODUCT', :'candle_id', 'x'), '%no encontrado%');

-- Anonymous callers cannot reach the API at all
RESET ROLE;
SET ROLE anon;
SELECT set_config('request.jwt.claims', '', TRUE);
SELECT pg_temp.expect_error(format('SELECT create_invoice(%L::JSONB)', '{}'), '%permission denied%');
SELECT pg_temp.expect_error('SELECT count(*) FROM invoices', '%permission denied%');
RESET ROLE;
SET ROLE authenticated;

-- ---------------------------------------------------------------- inventory adjustment
SELECT pg_temp.login('22222222-2222-2222-2222-222222222222', 'editor.a@test.local');
SELECT adjust_inventory('MATERIAL', :'frag_id', 280, 'Conteo físico');
SELECT pg_temp.check((SELECT current_stock = 280 FROM materials WHERE id = :'frag_id'), 'adjustment sets counted stock');
SELECT pg_temp.check((SELECT quantity = 20 FROM inventory_transactions WHERE item_id = :'frag_id' AND transaction_type = 'ADJUSTMENT_OUT'), 'adjustment ledger entry');

-- ---------------------------------------------------------------- distributor portal
INSERT INTO distributors (company_id, name, margin_override, payment_terms_days, credit_limit)
VALUES (:'company_a', 'Distribuidora Norte', 0.3, 30, 10000);
INSERT INTO distributors (company_id, name) VALUES (:'company_a', 'Distribuidora Sur');
SELECT id AS dist_id FROM distributors WHERE name = 'Distribuidora Norte' \gset
SELECT id AS dist2_id FROM distributors WHERE name = 'Distribuidora Sur' \gset
SELECT create_distributor_invitation(:'dist_id', 'dist.a@test.local') AS dist_token \gset

RESET ROLE;
SET ROLE anon;
SELECT pg_temp.check((SELECT invitation_preview(:'dist_token') ->> 'distributor_name') = 'Distribuidora Norte', 'anon can preview an invitation');
RESET ROLE;
SET ROLE authenticated;

SELECT pg_temp.login('55555555-5555-5555-5555-555555555555', 'dist.a@test.local');
SELECT accept_invitation(:'dist_token');
SELECT pg_temp.check((SELECT count(*) FROM portal_accounts()) = 1, 'distributor sees its account');
SELECT pg_temp.check((SELECT count(*) FROM products) = 0, 'distributor cannot read the products table (costs stay private)');
SELECT pg_temp.check((SELECT count(*) FROM invoices) = 0, 'distributor cannot read invoices table directly');
-- 30% off 400 retail = 280
SELECT pg_temp.check((SELECT unit_price = 280 AND available FROM portal_catalog(:'dist_id') WHERE product_id = :'candle_id'), 'catalog shows distributor price');
SELECT pg_temp.expect_error(format('SELECT * FROM portal_catalog(%L)', :'dist2_id'), '%No tienes acceso%');

SELECT portal_submit_order(:'dist_id', jsonb_build_array(jsonb_build_object('product_id', :'candle_id', 'quantity', 3, 'unit_price', 1)), 'Entregar el lunes') AS dist_order_id \gset
SELECT pg_temp.check((portal_orders(:'dist_id') -> 0 ->> 'total')::NUMERIC = 840, 'order priced on the server, client price ignored');
SELECT portal_submit_order(:'dist_id', jsonb_build_array(jsonb_build_object('product_id', :'candle_id', 'quantity', 1))) AS dist_order2_id \gset
SELECT portal_cancel_order(:'dist_order2_id');

SELECT pg_temp.login('22222222-2222-2222-2222-222222222222', 'editor.a@test.local');
SELECT accept_distributor_order(:'dist_order_id', '2026-09-20') AS dist_invoice_id \gset
SELECT pg_temp.check((SELECT total = 840 AND distributor_id = :'dist_id' AND channel_id = :'dist_channel' AND due_date = '2026-10-20' AND source = 'distributor_order'
                      FROM invoices WHERE id = :'dist_invoice_id'), 'accepted order becomes an invoice with distributor terms');
SELECT pg_temp.expect_error(format('SELECT reject_distributor_order(%L, %L)', :'dist_order2_id', 'x'), '%ya procesado%');
SELECT register_payment('invoice', :'dist_invoice_id', 300, '2026-09-25', 'Transferencia');

SELECT pg_temp.login('55555555-5555-5555-5555-555555555555', 'dist.a@test.local');
SELECT pg_temp.check((portal_statement(:'dist_id') -> 'summary' ->> 'balance')::NUMERIC = 540, 'statement balance');
SELECT pg_temp.check((portal_statement(:'dist_id') -> 'summary' ->> 'available_credit')::NUMERIC = 9460, 'available credit');
SELECT pg_temp.check((portal_orders(:'dist_id') -> 0 ->> 'status') IN ('invoiced', 'cancelled'), 'order statuses visible');
SELECT pg_temp.check(NOT (portal_statement(:'dist_id')::TEXT ILIKE '%cogs%' OR portal_statement(:'dist_id')::TEXT ILIKE '%unit_cost%'), 'statement exposes no costs');

-- The distributor link can be removed by the company
SELECT pg_temp.login('11111111-1111-1111-1111-111111111111', 'admin.a@test.local');
SELECT id AS link_id FROM list_distributor_portal_users() LIMIT 1 \gset
SELECT remove_distributor_portal_user(:'link_id');
SELECT pg_temp.login('55555555-5555-5555-5555-555555555555', 'dist.a@test.local');
SELECT pg_temp.expect_error(format('SELECT portal_statement(%L)', :'dist_id'), '%No tienes acceso%');

-- ---------------------------------------------------------------- labor paid per piece
SELECT pg_temp.login('11111111-1111-1111-1111-111111111111', 'admin.a@test.local');
UPDATE settings SET labor_payment_mode = 'piece';
SELECT save_product(:'candle_id',
    jsonb_build_object('name', 'Vela lavanda', 'sku', 'VEL-001', 'category', 'Velas', 'batch_size', 10,
                       'production_time_hours', 2, 'retail_price', 400, 'labor_cost_per_piece', 12),
    NULL);
-- materials at replacement cost (2000 g x 0.7 + 100 ml x 3) / 10 = 170, plus 12 per piece
SELECT pg_temp.check((SELECT round(calculated_labor_cost, 2) = 12 AND round(variable_unit_cost, 2) = 182 FROM products WHERE id = :'candle_id'),
                     'piece rate drives labor cost and cost of goods sold');
SELECT create_production_order(:'candle_id', 10, '2026-09-21') AS piece_order \gset
SELECT complete_production_order(:'piece_order', 10, NULL, '[]'::JSONB, '2026-09-21');
-- actual: (2000 g x 0.6 avg + 100 ml x 3) + 10 x 12 = 1620 -> 162 per unit
SELECT pg_temp.check((SELECT labor_cost = 120 AND standard_labor_cost = 120 AND labor_in_unit_cost AND round(actual_unit_cost, 2) = 162
                      FROM production_orders WHERE id = :'piece_order'), 'piece-paid production includes labor in its unit cost');
UPDATE settings SET labor_payment_mode = 'salary';
SELECT pg_temp.check((SELECT round(variable_unit_cost, 2) = 170 FROM products WHERE id = :'candle_id'), 'back to salary removes labor from cost of goods sold');

-- ---------------------------------------------------------------- team management
SELECT pg_temp.login('11111111-1111-1111-1111-111111111111', 'admin.a@test.local');
SELECT pg_temp.check((SELECT count(*) FROM list_team_members()) = 3, 'admin lists 3 team members with emails');
SELECT update_member_role('33333333-3333-3333-3333-333333333333', 'edit');
SELECT pg_temp.expect_error($$SELECT update_member_role('11111111-1111-1111-1111-111111111111', 'view')$$, '%propio rol%');
SELECT pg_temp.login('22222222-2222-2222-2222-222222222222', 'editor.a@test.local');
SELECT pg_temp.expect_error($$SELECT update_member_role('33333333-3333-3333-3333-333333333333', 'admin')$$, '%permisos%');
UPDATE settings SET labor_cost_per_hour = 1;
SELECT pg_temp.check((SELECT labor_cost_per_hour = 100 FROM settings), 'editors cannot change settings');

RESET ROLE;
\echo 'ALL RPC SCENARIOS PASSED'
ROLLBACK;
