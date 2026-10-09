-- Local development seed: a fictional candle & diffuser maker with six months of operations.
-- Loaded by `supabase db reset` (local only). Business data is created through the same RPCs
-- the app uses, so stock, costs and balances are consistent.
--
-- Test users (local only, not real credentials):
--   Business admin:  demo@rinde.test   / demo-rinde-2026
--   Distributor:     norte@rinde.test  / demo-rinde-2026

DO $$
DECLARE
    v_admin UUID := '0d000000-0000-4000-8000-0000000000a1';
    v_dist_user UUID := '0d000000-0000-4000-8000-0000000000d1';
    v_password TEXT := extensions.crypt('demo-rinde-2026', extensions.gen_salt('bf'));
BEGIN
    INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                            raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                            confirmation_token, recovery_token, email_change_token_new, email_change)
    VALUES
        ('00000000-0000-0000-0000-000000000000', v_admin, 'authenticated', 'authenticated', 'demo@rinde.test', v_password, NOW(),
         '{"provider":"email","providers":["email"]}', '{"full_name":"Ana Demo"}', NOW(), NOW(), '', '', '', ''),
        ('00000000-0000-0000-0000-000000000000', v_dist_user, 'authenticated', 'authenticated', 'norte@rinde.test', v_password, NOW(),
         '{"provider":"email","providers":["email"]}', '{"full_name":"Luis Norte"}', NOW(), NOW(), '', '', '', '');

    INSERT INTO auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    VALUES
        (gen_random_uuid(), v_admin, v_admin::TEXT, jsonb_build_object('sub', v_admin::TEXT, 'email', 'demo@rinde.test', 'email_verified', TRUE), 'email', NOW(), NOW(), NOW()),
        (gen_random_uuid(), v_dist_user, v_dist_user::TEXT, jsonb_build_object('sub', v_dist_user::TEXT, 'email', 'norte@rinde.test', 'email_verified', TRUE), 'email', NOW(), NOW(), NOW());
END $$;

-- Helpers for the timeline below: skip future dates and pay documents in full
CREATE FUNCTION pg_temp.invoice(p_data JSONB, p_paid_on DATE DEFAULT NULL, p_method TEXT DEFAULT 'Transferencia', p_share NUMERIC DEFAULT 1)
RETURNS UUID LANGUAGE plpgsql AS $fn$
DECLARE
    v UUID;
BEGIN
    IF (p_data ->> 'issue_date')::DATE > CURRENT_DATE THEN
        RETURN NULL;
    END IF;
    v := create_invoice(p_data);
    IF p_paid_on IS NOT NULL AND p_paid_on <= CURRENT_DATE THEN
        PERFORM register_payment('invoice', v, round((SELECT total FROM invoices WHERE id = v) * p_share, 2), p_paid_on, p_method, NULL, NULL);
    END IF;
    RETURN v;
END;
$fn$;

CREATE FUNCTION pg_temp.purchase(p_data JSONB, p_paid_on DATE DEFAULT NULL)
RETURNS UUID LANGUAGE plpgsql AS $fn$
DECLARE
    v UUID;
BEGIN
    v := create_purchase(p_data);
    IF p_paid_on IS NOT NULL AND p_paid_on <= CURRENT_DATE THEN
        PERFORM register_payment('purchase', v, (SELECT total FROM purchases WHERE id = v), p_paid_on, 'Transferencia', NULL, NULL);
    END IF;
    RETURN v;
END;
$fn$;

DO $$
DECLARE
    v_admin UUID := '0d000000-0000-4000-8000-0000000000a1';
    v_dist_user UUID := '0d000000-0000-4000-8000-0000000000d1';
    v_company UUID;
    v_start DATE := CURRENT_DATE - 182;
    d DATE;
    w INT := 0;
    -- suppliers
    s_ceras UUID; s_esencias UUID; s_envases UUID;
    -- materials
    m_cera UUID; m_lav UUID; m_vai UUID; m_mecha UUID; m_vaso UUID; m_frasco UUID; m_varillas UUID; m_base UUID; m_organza UUID; m_etiqueta UUID;
    -- products
    p_vela_lav UUID; p_vela_vai UUID; p_difusor UUID; p_sachet UUID;
    -- channels / distributors / customers
    ch_direct UUID; ch_dist UUID; ch_online UUID;
    d_norte UUID; d_micasa UUID;
    c_hotel UUID; c_spa UUID;
    v_order UUID;
    v_token TEXT;
    v_wax_cost NUMERIC;
    v_lines JSONB;
    q INT;
BEGIN
    PERFORM setseed(0.42);
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin, 'email', 'demo@rinde.test', 'role', 'authenticated')::TEXT, TRUE);

    v_company := create_company('Aromas del Caribe (demo)', 'Ana Demo', 'DOP');

    UPDATE settings SET
        labor_cost_per_hour = 150,
        indirect_cost_reserve = 0.10,
        distributor_margin = 0.20,
        opening_cash_balance = 180000,
        opening_cash_date = v_start,
        safety_stock_weeks = 1,
        demand_lookback_weeks = 8,
        default_lead_time_days = 10
    WHERE company_id = v_company;

    SELECT id INTO ch_direct FROM sales_channels WHERE company_id = v_company AND kind = 'direct';
    SELECT id INTO ch_dist FROM sales_channels WHERE company_id = v_company AND kind = 'distributor';
    SELECT id INTO ch_online FROM sales_channels WHERE company_id = v_company AND kind = 'online';
    UPDATE sales_channels SET cost_per_order = 450 WHERE id = ch_dist;
    UPDATE sales_channels SET payment_fee_pct = 0.045, cost_per_order = 200, cost_per_unit = 15 WHERE id = ch_online;
    UPDATE sales_channels SET payment_fee_pct = 0.015 WHERE id = ch_direct;

    INSERT INTO suppliers (company_id, name, payment_terms_days, lead_time_days, contact_name, phone) VALUES
        (v_company, 'Ceras del Cibao', 30, 10, 'Ramón Pérez', '809-555-0101') RETURNING id INTO s_ceras;
    INSERT INTO suppliers (company_id, name, payment_terms_days, lead_time_days, contact_name) VALUES
        (v_company, 'Esencias RD', 15, 14, 'Carla Gómez') RETURNING id INTO s_esencias;
    INSERT INTO suppliers (company_id, name, payment_terms_days, lead_time_days) VALUES
        (v_company, 'Envases Industriales', 30, 21) RETURNING id INTO s_envases;

    INSERT INTO materials (company_id, name, category, unit_of_measure, cost_per_unit, current_stock, reorder_point, supplier_id, supplier)
    VALUES (v_company, 'Cera de soya', 'Cera', 'g', 0.45, 0, 20000, s_ceras, 'Ceras del Cibao') RETURNING id INTO m_cera;
    INSERT INTO materials (company_id, name, category, unit_of_measure, cost_per_unit, current_stock, reorder_point, supplier_id, supplier)
    VALUES (v_company, 'Fragancia lavanda', 'Fragancia', 'ml', 2.80, 0, 1500, s_esencias, 'Esencias RD') RETURNING id INTO m_lav;
    INSERT INTO materials (company_id, name, category, unit_of_measure, cost_per_unit, current_stock, reorder_point, supplier_id, supplier)
    VALUES (v_company, 'Fragancia vainilla', 'Fragancia', 'ml', 3.10, 0, 600, s_esencias, 'Esencias RD') RETURNING id INTO m_vai;
    INSERT INTO materials (company_id, name, category, unit_of_measure, cost_per_unit, current_stock, reorder_point, supplier_id, supplier)
    VALUES (v_company, 'Mecha de algodón', 'Insumo', 'unidad', 4, 0, 100, s_ceras, 'Ceras del Cibao') RETURNING id INTO m_mecha;
    INSERT INTO materials (company_id, name, category, unit_of_measure, cost_per_unit, current_stock, reorder_point, supplier_id, supplier)
    VALUES (v_company, 'Vaso de vidrio 8 oz', 'Envase', 'unidad', 38, 0, 100, s_envases, 'Envases Industriales') RETURNING id INTO m_vaso;
    INSERT INTO materials (company_id, name, category, unit_of_measure, cost_per_unit, current_stock, reorder_point, supplier_id, supplier)
    VALUES (v_company, 'Frasco difusor 100 ml', 'Envase', 'unidad', 55, 0, 20, s_envases, 'Envases Industriales') RETURNING id INTO m_frasco;
    INSERT INTO materials (company_id, name, category, unit_of_measure, cost_per_unit, current_stock, reorder_point, supplier_id, supplier)
    VALUES (v_company, 'Varillas de ratán (8)', 'Insumo', 'paquete', 18, 0, 20, s_envases, 'Envases Industriales') RETURNING id INTO m_varillas;
    INSERT INTO materials (company_id, name, category, unit_of_measure, cost_per_unit, current_stock, reorder_point, supplier_id, supplier)
    VALUES (v_company, 'Base para difusor', 'Base', 'ml', 0.35, 0, 1500, s_esencias, 'Esencias RD') RETURNING id INTO m_base;
    INSERT INTO materials (company_id, name, category, unit_of_measure, cost_per_unit, current_stock, reorder_point, supplier_id, supplier)
    VALUES (v_company, 'Bolsita de organza', 'Empaque', 'unidad', 6, 0, 100, s_envases, 'Envases Industriales') RETURNING id INTO m_organza;
    INSERT INTO materials (company_id, name, category, unit_of_measure, cost_per_unit, current_stock, reorder_point, supplier_id, supplier)
    VALUES (v_company, 'Etiqueta impresa', 'Empaque', 'unidad', 3.5, 0, 200, s_envases, 'Envases Industriales') RETURNING id INTO m_etiqueta;

    p_vela_lav := save_product(NULL,
        jsonb_build_object('name', 'Vela de soya lavanda 8 oz', 'sku', 'VEL-LAV-08', 'category', 'Velas', 'batch_size', 24, 'production_time_hours', 3, 'retail_price', 495, 'labor_cost_per_piece', 18,
                           'description', 'Vela de cera de soya en vaso de vidrio, 45 horas de duración.'),
        jsonb_build_array(
            jsonb_build_object('material_id', m_cera, 'quantity', 4800), jsonb_build_object('material_id', m_lav, 'quantity', 384),
            jsonb_build_object('material_id', m_mecha, 'quantity', 24), jsonb_build_object('material_id', m_vaso, 'quantity', 24),
            jsonb_build_object('material_id', m_etiqueta, 'quantity', 24)));
    p_vela_vai := save_product(NULL,
        jsonb_build_object('name', 'Vela de soya vainilla 8 oz', 'sku', 'VEL-VAI-08', 'category', 'Velas', 'batch_size', 24, 'production_time_hours', 3, 'retail_price', 495, 'labor_cost_per_piece', 18,
                           'description', 'Vela de cera de soya con vainilla, en vaso de vidrio.'),
        jsonb_build_array(
            jsonb_build_object('material_id', m_cera, 'quantity', 4800), jsonb_build_object('material_id', m_vai, 'quantity', 384),
            jsonb_build_object('material_id', m_mecha, 'quantity', 24), jsonb_build_object('material_id', m_vaso, 'quantity', 24),
            jsonb_build_object('material_id', m_etiqueta, 'quantity', 24)));
    p_difusor := save_product(NULL,
        jsonb_build_object('name', 'Difusor de varillas lavanda 100 ml', 'sku', 'DIF-LAV-100', 'category', 'Difusores', 'batch_size', 12, 'production_time_hours', 1.5, 'retail_price', 650, 'labor_cost_per_piece', 19,
                           'description', 'Difusor con 8 varillas de ratán, dura 6 a 8 semanas.'),
        jsonb_build_array(
            jsonb_build_object('material_id', m_frasco, 'quantity', 12), jsonb_build_object('material_id', m_base, 'quantity', 1020),
            jsonb_build_object('material_id', m_lav, 'quantity', 180), jsonb_build_object('material_id', m_varillas, 'quantity', 12),
            jsonb_build_object('material_id', m_etiqueta, 'quantity', 12)));
    p_sachet := save_product(NULL,
        jsonb_build_object('name', 'Sachet aromático lavanda', 'sku', 'SAC-LAV', 'category', 'Sachets', 'batch_size', 50, 'production_time_hours', 2, 'retail_price', 120, 'labor_cost_per_piece', 6,
                           'description', 'Bolsita de organza para clósets y gavetas.'),
        jsonb_build_array(
            jsonb_build_object('material_id', m_organza, 'quantity', 50), jsonb_build_object('material_id', m_lav, 'quantity', 250),
            jsonb_build_object('material_id', m_etiqueta, 'quantity', 50)));

    INSERT INTO distributors (company_id, name, contact_name, phone, email, margin_override, payment_terms_days, credit_limit, territory_notes)
    VALUES (v_company, 'Distribuidora Norte', 'Luis Norte', '809-555-0202', 'norte@rinde.test', 0.30, 30, 60000, 'Santiago y Puerto Plata') RETURNING id INTO d_norte;
    INSERT INTO distributors (company_id, name, contact_name, payment_terms_days, territory_notes)
    VALUES (v_company, 'Tiendas Mi Casa', 'Marta Ruiz', 15, 'Pedidos pequeños, entrega semanal') RETURNING id INTO d_micasa;

    INSERT INTO customers (company_id, name, phone) VALUES (v_company, 'Hotel Brisas del Mar', '809-555-0303') RETURNING id INTO c_hotel;
    INSERT INTO customers (company_id, name) VALUES (v_company, 'Spa Serenidad') RETURNING id INTO c_spa;

    -- Six months of operations, week by week
    d := v_start;
    WHILE d <= CURRENT_DATE - 1 LOOP
        -- Purchases every four weeks, only for materials running low (wax gets 20% more expensive ~5 weeks ago)
        IF w % 4 = 0 THEN
            v_wax_cost := CASE WHEN d >= CURRENT_DATE - 35 THEN 0.54 ELSE 0.45 END;
            v_lines := '[]'::JSONB;
            IF (SELECT current_stock FROM materials WHERE id = m_cera) < 65000 THEN
                v_lines := v_lines || jsonb_build_array(jsonb_build_object('material_id', m_cera, 'quantity', 70000, 'unit_cost', v_wax_cost));
            END IF;
            IF (SELECT current_stock FROM materials WHERE id = m_mecha) < 300 THEN
                v_lines := v_lines || jsonb_build_array(jsonb_build_object('material_id', m_mecha, 'quantity', 320, 'unit_cost', 4));
            END IF;
            IF jsonb_array_length(v_lines) > 0 THEN
                PERFORM pg_temp.purchase(jsonb_build_object('supplier_id', s_ceras, 'purchase_date', d, 'lines', v_lines), CASE WHEN d < CURRENT_DATE - 40 THEN d + 28 END);
            END IF;

            v_lines := '[]'::JSONB;
            IF (SELECT current_stock FROM materials WHERE id = m_lav) < 6000 THEN
                v_lines := v_lines || jsonb_build_array(jsonb_build_object('material_id', m_lav, 'quantity', 6500, 'unit_cost', 2.80));
            END IF;
            IF (SELECT current_stock FROM materials WHERE id = m_vai) < 1700 THEN
                v_lines := v_lines || jsonb_build_array(jsonb_build_object('material_id', m_vai, 'quantity', 1800, 'unit_cost', 3.10));
            END IF;
            IF (SELECT current_stock FROM materials WHERE id = m_base) < 6500 THEN
                v_lines := v_lines || jsonb_build_array(jsonb_build_object('material_id', m_base, 'quantity', 6500, 'unit_cost', 0.35));
            END IF;
            IF jsonb_array_length(v_lines) > 0 THEN
                PERFORM pg_temp.purchase(jsonb_build_object('supplier_id', s_esencias, 'purchase_date', d, 'lines', v_lines), CASE WHEN d < CURRENT_DATE - 20 THEN d + 15 END);
            END IF;

            v_lines := '[]'::JSONB;
            IF (SELECT current_stock FROM materials WHERE id = m_vaso) < 300 THEN
                v_lines := v_lines || jsonb_build_array(jsonb_build_object('material_id', m_vaso, 'quantity', 320, 'unit_cost', 38));
            END IF;
            IF (SELECT current_stock FROM materials WHERE id = m_frasco) < 80 THEN
                v_lines := v_lines || jsonb_build_array(jsonb_build_object('material_id', m_frasco, 'quantity', 80, 'unit_cost', 55));
            END IF;
            IF (SELECT current_stock FROM materials WHERE id = m_varillas) < 80 THEN
                v_lines := v_lines || jsonb_build_array(jsonb_build_object('material_id', m_varillas, 'quantity', 80, 'unit_cost', 18));
            END IF;
            IF (SELECT current_stock FROM materials WHERE id = m_organza) < 320 THEN
                v_lines := v_lines || jsonb_build_array(jsonb_build_object('material_id', m_organza, 'quantity', 330, 'unit_cost', 6));
            END IF;
            IF (SELECT current_stock FROM materials WHERE id = m_etiqueta) < 700 THEN
                v_lines := v_lines || jsonb_build_array(jsonb_build_object('material_id', m_etiqueta, 'quantity', 750, 'unit_cost', 3.5));
            END IF;
            IF jsonb_array_length(v_lines) > 0 THEN
                PERFORM pg_temp.purchase(jsonb_build_object('supplier_id', s_envases, 'purchase_date', d, 'lines', v_lines), CASE WHEN d < CURRENT_DATE - 40 THEN d + 30 END);
            END IF;
        END IF;

        -- Production every two weeks when finished stock runs low; wax use creeps ~10% above the recipe lately
        IF w % 2 = 0 THEN
            IF (SELECT current_stock FROM products WHERE id = p_vela_lav) < 110 THEN
                v_order := create_production_order(p_vela_lav, 96, d, NULL);
                PERFORM complete_production_order(v_order, 96, 12,
                    jsonb_build_array(jsonb_build_object('material_id', m_cera, 'actual_quantity', CASE WHEN d >= CURRENT_DATE - 60 THEN 21100 ELSE 19260 END)), d, NULL);
            END IF;
            IF (SELECT current_stock FROM products WHERE id = p_vela_vai) < 45 THEN
                v_order := create_production_order(p_vela_vai, 48, d, NULL);
                PERFORM complete_production_order(v_order, 47, 6, '[]'::JSONB, d, 'Un vaso se rompió');
            END IF;
            IF (SELECT current_stock FROM products WHERE id = p_difusor) < 40 THEN
                v_order := create_production_order(p_difusor, 36, d, NULL);
                PERFORM complete_production_order(v_order, 36, 4.5, '[]'::JSONB, d, NULL);
            END IF;
            IF (SELECT current_stock FROM products WHERE id = p_sachet) < 110 THEN
                v_order := create_production_order(p_sachet, 150, d, NULL);
                PERFORM complete_production_order(v_order, 150, 6, '[]'::JSONB, d, NULL);
            END IF;
        END IF;

        -- Direct sales (paid on the spot)
        FOR i IN 1..3 LOOP
            PERFORM pg_temp.invoice(jsonb_build_object(
                'issue_date', d + (i * 2 - 1), 'channel_id', ch_direct, 'customer_name', 'Consumidor final',
                'lines', jsonb_build_array(
                    jsonb_build_object('product_id', p_vela_lav, 'quantity', 4 + floor(random() * 5)::INT),
                    jsonb_build_object('product_id', p_vela_vai, 'quantity', 2 + floor(random() * 4)::INT),
                    jsonb_build_object('product_id', p_difusor, 'quantity', 1 + floor(random() * 3)::INT))
            ), d + (i * 2 - 1), CASE WHEN random() < 0.5 THEN 'Efectivo' ELSE 'Tarjeta' END);
        END LOOP;

        -- Corporate customers every other week: 15 days to pay, 10% discount
        IF w % 2 = 1 THEN
            PERFORM pg_temp.invoice(jsonb_build_object(
                'issue_date', d + 2, 'channel_id', ch_direct, 'customer_id', CASE WHEN w % 4 = 1 THEN c_hotel ELSE c_spa END, 'due_date', d + 17,
                'lines', jsonb_build_array(
                    jsonb_build_object('product_id', p_difusor, 'quantity', 6, 'discount_pct', 0.10),
                    jsonb_build_object('product_id', p_vela_lav, 'quantity', 10, 'discount_pct', 0.10))
            ), CASE WHEN d + 20 < CURRENT_DATE THEN d + 19 END);
        END IF;

        -- Online orders: mostly single candles, one single sachet (which loses money after delivery)
        FOR i IN 1..4 LOOP
            PERFORM pg_temp.invoice(jsonb_build_object(
                'issue_date', d + i, 'channel_id', ch_online, 'customer_name', 'Pedido en línea',
                'lines', CASE WHEN i = 4
                    THEN jsonb_build_array(jsonb_build_object('product_id', p_sachet, 'quantity', 1))
                    ELSE jsonb_build_array(jsonb_build_object('product_id', CASE WHEN random() < 0.6 THEN p_vela_lav ELSE p_vela_vai END, 'quantity', 1 + floor(random() * 2)::INT))
                END
            ), d + i, 'Tarjeta');
        END LOOP;

        -- Distribuidora Norte: big order every two weeks at 30% off, pays in ~35 days
        IF w % 2 = 0 THEN
            q := 50 + floor(random() * 30)::INT;
            PERFORM pg_temp.invoice(jsonb_build_object(
                'issue_date', d + 3, 'channel_id', ch_dist, 'distributor_id', d_norte,
                'lines', jsonb_build_array(
                    jsonb_build_object('product_id', p_sachet, 'quantity', q),
                    jsonb_build_object('product_id', p_vela_lav, 'quantity', 12),
                    jsonb_build_object('product_id', p_difusor, 'quantity', 6))
            ),
            CASE WHEN d + 38 < CURRENT_DATE THEN d + 35 WHEN d + 26 < CURRENT_DATE THEN d + 25 END,
            'Transferencia',
            CASE WHEN d + 38 < CURRENT_DATE THEN 1 ELSE 0.5 END);
        END IF;

        -- Tiendas Mi Casa: tiny weekly sachet orders (the delivery cost eats the margin)
        PERFORM pg_temp.invoice(jsonb_build_object(
            'issue_date', d + 4, 'channel_id', ch_dist, 'distributor_id', d_micasa,
            'lines', jsonb_build_array(jsonb_build_object('product_id', p_sachet, 'quantity', 4 + floor(random() * 3)::INT))
        ), CASE WHEN d + 30 < CURRENT_DATE THEN d + 18 END, 'Efectivo');

        d := d + 7;
        w := w + 1;
    END LOOP;

    -- Operating expenses by calendar month
    FOR d IN SELECT generate_series(date_trunc('month', v_start)::DATE, CURRENT_DATE, INTERVAL '1 month')::DATE LOOP
        INSERT INTO expenses (company_id, expense_date, category, description, amount, payment_method, is_recurring)
        SELECT v_company, e.dt, e.cat, e.descr, e.amount, e.method, e.recurring
        FROM (VALUES
            (d + 4, 'Alquiler', 'Local de producción', 25000::NUMERIC, 'Transferencia', TRUE),
            (d + 14, 'Salarios', 'Equipo de producción y ventas', 42000::NUMERIC, 'Transferencia', TRUE),
            (d + 9, 'Servicios (luz, agua, internet)', 'Luz, agua e internet', 5500::NUMERIC, 'Transferencia', TRUE),
            (d + 11, 'Publicidad', 'Anuncios en redes sociales', 3000 + round(random() * 4000)::NUMERIC, 'Tarjeta', FALSE)
        ) AS e(dt, cat, descr, amount, method, recurring)
        WHERE e.dt BETWEEN v_start AND CURRENT_DATE;
    END LOOP;

    -- A batch planned for this week and the distributor portal account
    PERFORM create_production_order(p_difusor, 36, CURRENT_DATE + 2, 'Lote para pedido del hotel');

    v_token := create_distributor_invitation(d_norte, 'norte@rinde.test');
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_dist_user, 'email', 'norte@rinde.test', 'role', 'authenticated')::TEXT, TRUE);
    PERFORM accept_invitation(v_token, 'Luis Norte');
    PERFORM portal_submit_order(d_norte, jsonb_build_array(
        jsonb_build_object('product_id', p_sachet, 'quantity', 80),
        jsonb_build_object('product_id', p_difusor, 'quantity', 12)
    ), 'Entregar en el almacén de Santiago, por la mañana.', CURRENT_DATE + 5);

    PERFORM set_config('request.jwt.claims', '', TRUE);

    -- Seeded actions all happened "now": move audit timestamps to the business dates
    UPDATE material_cost_history h SET effective_at = p.purchase_date::TIMESTAMPTZ + INTERVAL '10 hours'
    FROM purchases p WHERE h.reference_id = p.id AND h.company_id = v_company;
    UPDATE material_cost_history SET effective_at = v_start::TIMESTAMPTZ - INTERVAL '30 days' WHERE company_id = v_company AND source = 'initial';
    UPDATE product_price_history SET effective_at = v_start::TIMESTAMPTZ - INTERVAL '30 days' WHERE company_id = v_company;
    UPDATE invoices SET created_at = issue_date::TIMESTAMPTZ + INTERVAL '12 hours' WHERE company_id = v_company;
    UPDATE inventory_transactions t SET created_at = COALESCE(
        (SELECT i.issue_date FROM invoices i WHERE i.id = t.reference_id),
        (SELECT p.purchase_date FROM purchases p WHERE p.id = t.reference_id),
        (SELECT o.completed_date FROM production_orders o WHERE o.id = t.reference_id),
        t.created_at::DATE)::TIMESTAMPTZ + INTERVAL '9 hours'
    WHERE company_id = v_company;
END $$;
