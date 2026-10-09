-- 0008: Business RPCs
--
-- Every function derives the tenant from the caller (auth.uid() -> user_profiles), never from
-- the payload, checks the caller's role, and performs its writes atomically.

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION require_company_role(p_roles TEXT[] DEFAULT ARRAY['admin', 'edit'])
RETURNS UUID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_company UUID;
    v_role TEXT;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Debes iniciar sesión' USING ERRCODE = '28000';
    END IF;

    SELECT company_id, role INTO v_company, v_role FROM user_profiles WHERE id = auth.uid();

    IF v_company IS NULL THEN
        RAISE EXCEPTION 'Tu usuario no pertenece a ninguna empresa' USING ERRCODE = '42501';
    END IF;
    IF NOT (v_role = ANY (p_roles)) THEN
        RAISE EXCEPTION 'No tienes permisos para esta acción' USING ERRCODE = '42501';
    END IF;

    RETURN v_company;
END;
$$;

-- Moves stock and writes the ledger entry. p_quantity is signed (+ in, - out).
CREATE OR REPLACE FUNCTION _move_stock(
    p_company_id UUID,
    p_item_type TEXT,
    p_item_id UUID,
    p_quantity NUMERIC,
    p_transaction_type TEXT,
    p_reference_id UUID,
    p_notes TEXT,
    p_unit_cost NUMERIC,
    p_allow_negative BOOLEAN
)
RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_new_stock NUMERIC;
    v_name TEXT;
BEGIN
    IF p_quantity = 0 THEN
        RETURN NULL;
    END IF;

    IF p_item_type = 'MATERIAL' THEN
        UPDATE materials SET current_stock = current_stock + p_quantity
        WHERE id = p_item_id AND company_id = p_company_id
        RETURNING current_stock, name INTO v_new_stock, v_name;
    ELSIF p_item_type = 'PRODUCT' THEN
        UPDATE products SET current_stock = current_stock + p_quantity
        WHERE id = p_item_id AND company_id = p_company_id
        RETURNING current_stock, name INTO v_new_stock, v_name;
    ELSE
        RAISE EXCEPTION 'Tipo de artículo inválido: %', p_item_type;
    END IF;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Artículo no encontrado en tu empresa' USING ERRCODE = 'P0002';
    END IF;

    IF v_new_stock < 0 AND NOT p_allow_negative THEN
        RAISE EXCEPTION 'Stock insuficiente de "%": faltan % unidades', v_name, trim_scale(round(-v_new_stock, 4))
            USING ERRCODE = 'P0001', HINT = 'insufficient_stock';
    END IF;

    INSERT INTO inventory_transactions (company_id, item_type, item_id, transaction_type, quantity, reference_id, notes, unit_cost)
    VALUES (p_company_id, p_item_type, p_item_id, p_transaction_type, abs(p_quantity), p_reference_id, p_notes, p_unit_cost);

    RETURN v_new_stock;
END;
$$;

CREATE OR REPLACE FUNCTION _allow_negative_stock(p_company_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT COALESCE((SELECT allow_negative_stock FROM settings WHERE company_id = p_company_id), FALSE);
$$;

-- Distributor price resolution: distributor override > product list price > settings default
CREATE OR REPLACE FUNCTION resolve_distributor_price(
    p_retail_price NUMERIC,
    p_product_distributor_price NUMERIC,
    p_distributor_margin_override NUMERIC,
    p_default_distributor_margin NUMERIC
)
RETURNS NUMERIC
LANGUAGE sql
IMMUTABLE
AS $$
    SELECT CASE
        WHEN p_distributor_margin_override IS NOT NULL THEN round(p_retail_price * (1 - p_distributor_margin_override), 2)
        WHEN p_product_distributor_price IS NOT NULL THEN p_product_distributor_price
        ELSE round(p_retail_price * (1 - COALESCE(p_default_distributor_margin, 0)), 2)
    END;
$$;

-- ---------------------------------------------------------------------------
-- Onboarding & team
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION create_company(p_company_name TEXT, p_full_name TEXT, p_currency TEXT DEFAULT 'DOP')
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid UUID := auth.uid();
    v_company UUID;
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'Debes iniciar sesión' USING ERRCODE = '28000';
    END IF;
    IF COALESCE(trim(p_company_name), '') = '' THEN
        RAISE EXCEPTION 'El nombre de la empresa es obligatorio';
    END IF;
    IF EXISTS (SELECT 1 FROM user_profiles WHERE id = v_uid AND company_id IS NOT NULL) THEN
        RAISE EXCEPTION 'Tu usuario ya pertenece a una empresa';
    END IF;

    INSERT INTO companies (name) VALUES (trim(p_company_name)) RETURNING id INTO v_company;

    INSERT INTO user_profiles (id, company_id, role, full_name)
    VALUES (v_uid, v_company, 'admin', NULLIF(trim(p_full_name), ''))
    ON CONFLICT (id) DO UPDATE
        SET company_id = EXCLUDED.company_id,
            role = 'admin',
            full_name = COALESCE(EXCLUDED.full_name, user_profiles.full_name);

    PERFORM seed_company_defaults(v_company, p_currency);
    RETURN v_company;
END;
$$;

CREATE OR REPLACE FUNCTION create_member_invitation(p_role TEXT, p_email TEXT DEFAULT NULL)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_company UUID := require_company_role(ARRAY['admin']);
    v_token TEXT;
BEGIN
    IF p_role NOT IN ('admin', 'edit', 'view') THEN
        RAISE EXCEPTION 'Rol inválido';
    END IF;

    INSERT INTO company_invitations (company_id, kind, role, email)
    VALUES (v_company, 'member', p_role, NULLIF(lower(trim(p_email)), ''))
    RETURNING token INTO v_token;

    RETURN v_token;
END;
$$;

CREATE OR REPLACE FUNCTION create_distributor_invitation(p_distributor_id UUID, p_email TEXT DEFAULT NULL)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_company UUID := require_company_role(ARRAY['admin', 'edit']);
    v_token TEXT;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM distributors WHERE id = p_distributor_id AND company_id = v_company) THEN
        RAISE EXCEPTION 'Distribuidor no encontrado';
    END IF;

    INSERT INTO company_invitations (company_id, kind, distributor_id, email)
    VALUES (v_company, 'distributor', p_distributor_id, NULLIF(lower(trim(p_email)), ''))
    RETURNING token INTO v_token;

    RETURN v_token;
END;
$$;

CREATE OR REPLACE FUNCTION revoke_invitation(p_invitation_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_company UUID := require_company_role(ARRAY['admin', 'edit']);
BEGIN
    UPDATE company_invitations
    SET revoked_at = NOW()
    WHERE id = p_invitation_id AND company_id = v_company AND accepted_at IS NULL AND revoked_at IS NULL
      AND (kind = 'distributor' OR get_auth_role() = 'admin');
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Invitación no encontrada o ya utilizada';
    END IF;
END;
$$;

-- Public: lets the invitation page show who invited you before signing in
CREATE OR REPLACE FUNCTION invitation_preview(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_result JSONB;
BEGIN
    SELECT jsonb_build_object(
        'kind', i.kind,
        'role', i.role,
        'company_name', c.name,
        'distributor_name', d.name,
        'email', i.email,
        'status', CASE
            WHEN i.revoked_at IS NOT NULL THEN 'revoked'
            WHEN i.accepted_at IS NOT NULL THEN 'accepted'
            WHEN i.expires_at < NOW() THEN 'expired'
            ELSE 'valid'
        END
    )
    INTO v_result
    FROM company_invitations i
    JOIN companies c ON c.id = i.company_id
    LEFT JOIN distributors d ON d.id = i.distributor_id
    WHERE i.token = p_token;

    RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION accept_invitation(p_token TEXT, p_full_name TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid UUID := auth.uid();
    v_inv company_invitations%ROWTYPE;
    v_email TEXT := lower(COALESCE(auth.jwt() ->> 'email', ''));
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'Debes iniciar sesión' USING ERRCODE = '28000';
    END IF;

    SELECT * INTO v_inv FROM company_invitations WHERE token = p_token FOR UPDATE;

    IF NOT FOUND OR v_inv.revoked_at IS NOT NULL THEN
        RAISE EXCEPTION 'La invitación no es válida';
    END IF;
    IF v_inv.accepted_at IS NOT NULL THEN
        RAISE EXCEPTION 'Esta invitación ya fue utilizada';
    END IF;
    IF v_inv.expires_at < NOW() THEN
        RAISE EXCEPTION 'La invitación expiró; pide una nueva';
    END IF;
    IF v_inv.email IS NOT NULL AND v_inv.email <> v_email THEN
        RAISE EXCEPTION 'Esta invitación es para otro correo electrónico';
    END IF;

    IF v_inv.kind = 'member' THEN
        IF EXISTS (SELECT 1 FROM user_profiles WHERE id = v_uid AND company_id IS NOT NULL AND company_id <> v_inv.company_id) THEN
            RAISE EXCEPTION 'Tu usuario ya pertenece a otra empresa';
        END IF;

        INSERT INTO user_profiles (id, company_id, role, full_name)
        VALUES (v_uid, v_inv.company_id, v_inv.role, NULLIF(trim(p_full_name), ''))
        ON CONFLICT (id) DO UPDATE
            SET company_id = EXCLUDED.company_id,
                role = EXCLUDED.role,
                full_name = COALESCE(EXCLUDED.full_name, user_profiles.full_name);
    ELSE
        INSERT INTO distributor_users (user_id, distributor_id, company_id)
        VALUES (v_uid, v_inv.distributor_id, v_inv.company_id)
        ON CONFLICT (user_id, distributor_id) DO NOTHING;
    END IF;

    UPDATE company_invitations SET accepted_at = NOW(), accepted_by = v_uid WHERE id = v_inv.id;

    RETURN jsonb_build_object('kind', v_inv.kind, 'company_id', v_inv.company_id, 'distributor_id', v_inv.distributor_id);
END;
$$;

CREATE OR REPLACE FUNCTION list_team_members()
RETURNS TABLE (user_id UUID, full_name TEXT, email TEXT, role TEXT, created_at TIMESTAMPTZ)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_company UUID := require_company_role(ARRAY['admin', 'edit', 'view']);
BEGIN
    RETURN QUERY
    SELECT p.id, p.full_name::TEXT, u.email::TEXT, p.role::TEXT, p.created_at
    FROM user_profiles p
    JOIN auth.users u ON u.id = p.id
    WHERE p.company_id = v_company
    ORDER BY p.created_at;
END;
$$;

CREATE OR REPLACE FUNCTION update_member_role(p_user_id UUID, p_role TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_company UUID := require_company_role(ARRAY['admin']);
BEGIN
    IF p_role NOT IN ('admin', 'edit', 'view') THEN
        RAISE EXCEPTION 'Rol inválido';
    END IF;
    IF p_user_id = auth.uid() THEN
        RAISE EXCEPTION 'No puedes cambiar tu propio rol';
    END IF;
    UPDATE user_profiles SET role = p_role WHERE id = p_user_id AND company_id = v_company;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Usuario no encontrado en tu empresa';
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION remove_member(p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_company UUID := require_company_role(ARRAY['admin']);
BEGIN
    IF p_user_id = auth.uid() THEN
        RAISE EXCEPTION 'No puedes quitarte a ti mismo de la empresa';
    END IF;
    UPDATE user_profiles SET company_id = NULL, role = 'view' WHERE id = p_user_id AND company_id = v_company;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Usuario no encontrado en tu empresa';
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION list_distributor_portal_users()
RETURNS TABLE (id UUID, distributor_id UUID, user_id UUID, email TEXT, created_at TIMESTAMPTZ)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_company UUID := require_company_role(ARRAY['admin', 'edit', 'view']);
BEGIN
    RETURN QUERY
    SELECT du.id, du.distributor_id, du.user_id, u.email::TEXT, du.created_at
    FROM distributor_users du
    JOIN auth.users u ON u.id = du.user_id
    WHERE du.company_id = v_company
    ORDER BY du.created_at;
END;
$$;

CREATE OR REPLACE FUNCTION remove_distributor_portal_user(p_link_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_company UUID := require_company_role(ARRAY['admin', 'edit']);
BEGIN
    DELETE FROM distributor_users WHERE id = p_link_id AND company_id = v_company;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Acceso no encontrado';
    END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- Products & inventory
-- ---------------------------------------------------------------------------
-- Saves product details and its recipe in one transaction.
-- p_data: {name, sku, category, description, batch_size, production_time_hours, retail_price,
--          distributor_price (null = automatic), is_active, opening_stock (new products only)}
-- p_bom:  [{material_id, quantity}]  (quantities per batch)
CREATE OR REPLACE FUNCTION save_product(p_product_id UUID, p_data JSONB, p_bom JSONB)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_company UUID := require_company_role();
    v_id UUID := p_product_id;
    v_item JSONB;
    v_product products%ROWTYPE;
BEGIN
    IF COALESCE(trim(p_data ->> 'name'), '') = '' THEN
        RAISE EXCEPTION 'El nombre del producto es obligatorio';
    END IF;
    IF COALESCE((p_data ->> 'batch_size')::NUMERIC, 1) <= 0 THEN
        RAISE EXCEPTION 'El tamaño de lote debe ser mayor que cero';
    END IF;

    IF v_id IS NULL THEN
        INSERT INTO products (company_id, name, sku, category, description, batch_size, production_time_hours,
                              retail_price, distributor_price, is_active, current_stock)
        VALUES (
            v_company,
            trim(p_data ->> 'name'),
            NULLIF(trim(p_data ->> 'sku'), ''),
            NULLIF(trim(p_data ->> 'category'), ''),
            NULLIF(trim(p_data ->> 'description'), ''),
            COALESCE((p_data ->> 'batch_size')::NUMERIC, 1),
            COALESCE((p_data ->> 'production_time_hours')::NUMERIC, 0),
            COALESCE((p_data ->> 'retail_price')::NUMERIC, 0),
            (p_data ->> 'distributor_price')::NUMERIC,
            COALESCE((p_data ->> 'is_active')::BOOLEAN, TRUE),
            0
        )
        RETURNING id INTO v_id;
    ELSE
        UPDATE products SET
            name = trim(p_data ->> 'name'),
            sku = NULLIF(trim(p_data ->> 'sku'), ''),
            category = NULLIF(trim(p_data ->> 'category'), ''),
            description = NULLIF(trim(p_data ->> 'description'), ''),
            batch_size = COALESCE((p_data ->> 'batch_size')::NUMERIC, batch_size),
            production_time_hours = COALESCE((p_data ->> 'production_time_hours')::NUMERIC, production_time_hours),
            retail_price = COALESCE((p_data ->> 'retail_price')::NUMERIC, retail_price),
            distributor_price = (p_data ->> 'distributor_price')::NUMERIC,
            is_active = COALESCE((p_data ->> 'is_active')::BOOLEAN, is_active)
        WHERE id = v_id AND company_id = v_company;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Producto no encontrado';
        END IF;
    END IF;

    IF p_bom IS NOT NULL THEN
        DELETE FROM bom_items WHERE product_id = v_id;
        FOR v_item IN SELECT * FROM jsonb_array_elements(p_bom) LOOP
            IF NOT EXISTS (SELECT 1 FROM materials WHERE id = (v_item ->> 'material_id')::UUID AND company_id = v_company) THEN
                RAISE EXCEPTION 'Materia prima no encontrada en tu empresa';
            END IF;
            IF COALESCE((v_item ->> 'quantity')::NUMERIC, 0) <= 0 THEN
                RAISE EXCEPTION 'Las cantidades de la receta deben ser mayores que cero';
            END IF;
            INSERT INTO bom_items (company_id, product_id, material_id, quantity)
            VALUES (v_company, v_id, (v_item ->> 'material_id')::UUID, (v_item ->> 'quantity')::NUMERIC);
        END LOOP;
    END IF;

    -- Recompute costs, then store the markup implied by the list price (informational)
    UPDATE products SET updated_at = NOW() WHERE id = v_id;
    SELECT * INTO v_product FROM products WHERE id = v_id;
    UPDATE products
    SET target_margin = CASE WHEN v_product.total_cost > 0 THEN v_product.retail_price / v_product.total_cost - 1 ELSE 0 END
    WHERE id = v_id;

    IF p_product_id IS NULL AND COALESCE((p_data ->> 'opening_stock')::NUMERIC, 0) > 0 THEN
        PERFORM _move_stock(v_company, 'PRODUCT', v_id, (p_data ->> 'opening_stock')::NUMERIC, 'OPENING', NULL,
                            'Inventario inicial', v_product.variable_unit_cost, TRUE);
    END IF;

    RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION adjust_inventory(p_item_type TEXT, p_item_id UUID, p_counted_quantity NUMERIC, p_reason TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_company UUID := require_company_role();
    v_current NUMERIC;
    v_cost NUMERIC;
    v_delta NUMERIC;
BEGIN
    IF p_counted_quantity IS NULL OR p_counted_quantity < 0 THEN
        RAISE EXCEPTION 'La cantidad contada no puede ser negativa';
    END IF;

    IF p_item_type = 'MATERIAL' THEN
        SELECT current_stock, avg_cost INTO v_current, v_cost FROM materials
        WHERE id = p_item_id AND company_id = v_company FOR UPDATE;
    ELSIF p_item_type = 'PRODUCT' THEN
        SELECT current_stock, COALESCE(avg_unit_cost, variable_unit_cost) INTO v_current, v_cost FROM products
        WHERE id = p_item_id AND company_id = v_company FOR UPDATE;
    ELSE
        RAISE EXCEPTION 'Tipo de artículo inválido';
    END IF;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Artículo no encontrado';
    END IF;

    v_delta := p_counted_quantity - v_current;
    IF v_delta = 0 THEN
        RETURN;
    END IF;

    PERFORM _move_stock(
        v_company, p_item_type, p_item_id, v_delta,
        CASE WHEN v_delta > 0 THEN 'ADJUSTMENT_IN' ELSE 'ADJUSTMENT_OUT' END,
        NULL, COALESCE(NULLIF(trim(p_reason), ''), 'Ajuste de inventario'), v_cost, TRUE
    );
END;
$$;

-- ---------------------------------------------------------------------------
-- Sales: invoices and payments
-- ---------------------------------------------------------------------------
-- p_data: {issue_date, due_date?, channel_id, customer_id?, customer_name?, distributor_id?, notes?,
--          lines: [{product_id, quantity, unit_price?, discount_pct?}],
--          payment?: {amount, method?, reference?, payment_date?}}
CREATE OR REPLACE FUNCTION _create_invoice(
    p_company_id UUID,
    p_data JSONB,
    p_source TEXT,
    p_distributor_order_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_settings settings%ROWTYPE;
    v_channel sales_channels%ROWTYPE;
    v_distributor distributors%ROWTYPE;
    v_invoice_id UUID;
    v_number TEXT;
    v_issue DATE := COALESCE((p_data ->> 'issue_date')::DATE, CURRENT_DATE);
    v_due DATE;
    v_terms INTEGER;
    v_line JSONB;
    v_product products%ROWTYPE;
    v_qty NUMERIC;
    v_list NUMERIC;
    v_price NUMERIC;
    v_discount NUMERIC;
    v_line_total NUMERIC;
    v_unit_cost NUMERIC;
    v_subtotal NUMERIC := 0;
    v_total NUMERIC := 0;
    v_cogs NUMERIC := 0;
    v_payment NUMERIC;
    v_customer_name TEXT;
BEGIN
    SELECT * INTO v_settings FROM settings WHERE company_id = p_company_id;

    SELECT * INTO v_channel FROM sales_channels
    WHERE id = (p_data ->> 'channel_id')::UUID AND company_id = p_company_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Selecciona un canal de venta válido';
    END IF;

    IF NULLIF(p_data ->> 'distributor_id', '') IS NOT NULL THEN
        SELECT * INTO v_distributor FROM distributors
        WHERE id = (p_data ->> 'distributor_id')::UUID AND company_id = p_company_id;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Distribuidor no encontrado';
        END IF;
    END IF;

    IF NULLIF(p_data ->> 'customer_id', '') IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM customers WHERE id = (p_data ->> 'customer_id')::UUID AND company_id = p_company_id) THEN
        RAISE EXCEPTION 'Cliente no encontrado';
    END IF;

    IF jsonb_array_length(COALESCE(p_data -> 'lines', '[]'::JSONB)) = 0 THEN
        RAISE EXCEPTION 'La factura debe tener al menos un producto';
    END IF;

    v_terms := COALESCE(v_distributor.payment_terms_days, v_channel.payment_terms_days, v_settings.default_payment_terms_days, 0);
    v_due := COALESCE((p_data ->> 'due_date')::DATE, v_issue + v_terms);
    IF v_due < v_issue THEN
        RAISE EXCEPTION 'La fecha de vencimiento no puede ser anterior a la fecha de la factura';
    END IF;

    v_customer_name := COALESCE(
        NULLIF(trim(p_data ->> 'customer_name'), ''),
        v_distributor.name,
        (SELECT name FROM customers WHERE id = NULLIF(p_data ->> 'customer_id', '')::UUID)
    );

    v_number := next_document_number(p_company_id, 'invoice');

    INSERT INTO invoices (company_id, number, issue_date, due_date, channel_id, customer_id, distributor_id,
                          customer_name, notes, source, distributor_order_id)
    VALUES (p_company_id, v_number, v_issue, v_due, v_channel.id, NULLIF(p_data ->> 'customer_id', '')::UUID,
            v_distributor.id, v_customer_name, NULLIF(trim(p_data ->> 'notes'), ''), p_source, p_distributor_order_id)
    RETURNING id INTO v_invoice_id;

    FOR v_line IN SELECT * FROM jsonb_array_elements(p_data -> 'lines') LOOP
        SELECT * INTO v_product FROM products
        WHERE id = (v_line ->> 'product_id')::UUID AND company_id = p_company_id
        FOR UPDATE;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Producto no encontrado en tu empresa';
        END IF;

        v_qty := (v_line ->> 'quantity')::NUMERIC;
        IF v_qty IS NULL OR v_qty <= 0 THEN
            RAISE EXCEPTION 'La cantidad de "%" debe ser mayor que cero', v_product.name;
        END IF;

        v_list := CASE
            WHEN v_channel.price_basis = 'distributor' OR v_distributor.id IS NOT NULL THEN
                resolve_distributor_price(v_product.retail_price, v_product.distributor_price,
                                          v_distributor.margin_override, v_settings.distributor_margin)
            ELSE v_product.retail_price
        END;
        v_price := COALESCE((v_line ->> 'unit_price')::NUMERIC, v_list);
        v_discount := COALESCE((v_line ->> 'discount_pct')::NUMERIC, 0);
        IF v_price < 0 OR v_discount < 0 OR v_discount > 1 THEN
            RAISE EXCEPTION 'Precio o descuento inválido para "%"', v_product.name;
        END IF;

        v_line_total := round(v_qty * v_price * (1 - v_discount), 2);
        v_unit_cost := COALESCE(v_product.avg_unit_cost, v_product.variable_unit_cost);

        INSERT INTO invoice_lines (company_id, invoice_id, product_id, quantity, list_price, unit_price, discount_pct,
                                   line_total, unit_cost, standard_unit_cost, cogs)
        VALUES (p_company_id, v_invoice_id, v_product.id, v_qty, v_list, v_price, v_discount,
                v_line_total, v_unit_cost, v_product.total_cost, round(v_unit_cost * v_qty, 4));

        PERFORM _move_stock(p_company_id, 'PRODUCT', v_product.id, -v_qty, 'SALE', v_invoice_id,
                            'Factura ' || v_number, v_unit_cost, COALESCE(v_settings.allow_negative_stock, FALSE));

        v_subtotal := v_subtotal + round(v_qty * v_price, 2);
        v_total := v_total + v_line_total;
        v_cogs := v_cogs + round(v_unit_cost * v_qty, 4);
    END LOOP;

    UPDATE invoices
    SET subtotal = v_subtotal, discount_total = v_subtotal - v_total, total = v_total, cogs_total = round(v_cogs, 2)
    WHERE id = v_invoice_id;

    v_payment := (p_data -> 'payment' ->> 'amount')::NUMERIC;
    IF v_payment IS NOT NULL AND v_payment > 0 THEN
        IF v_payment > v_total + 0.01 THEN
            RAISE EXCEPTION 'El pago no puede ser mayor que el total de la factura';
        END IF;
        INSERT INTO payments (company_id, direction, invoice_id, payment_date, amount, method, reference)
        VALUES (p_company_id, 'in', v_invoice_id,
                COALESCE((p_data -> 'payment' ->> 'payment_date')::DATE, v_issue),
                LEAST(v_payment, v_total),
                NULLIF(p_data -> 'payment' ->> 'method', ''),
                NULLIF(p_data -> 'payment' ->> 'reference', ''));
        UPDATE invoices SET amount_paid = LEAST(v_payment, v_total) WHERE id = v_invoice_id;
    END IF;

    RETURN v_invoice_id;
END;
$$;

CREATE OR REPLACE FUNCTION create_invoice(p_data JSONB)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN _create_invoice(require_company_role(), p_data, 'manual', NULL);
END;
$$;

CREATE OR REPLACE FUNCTION _void_invoice(p_company_id UUID, p_invoice_id UUID, p_reason TEXT)
RETURNS invoices
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_invoice invoices%ROWTYPE;
    v_line invoice_lines%ROWTYPE;
BEGIN
    SELECT * INTO v_invoice FROM invoices WHERE id = p_invoice_id AND company_id = p_company_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Factura no encontrada';
    END IF;
    IF v_invoice.status = 'void' THEN
        RAISE EXCEPTION 'La factura ya está anulada';
    END IF;

    FOR v_line IN SELECT * FROM invoice_lines WHERE invoice_id = p_invoice_id AND product_id IS NOT NULL LOOP
        PERFORM _move_stock(p_company_id, 'PRODUCT', v_line.product_id, v_line.quantity, 'SALE_VOID', p_invoice_id,
                            'Anulación ' || v_invoice.number, v_line.unit_cost, TRUE);
    END LOOP;

    UPDATE payments SET voided_at = NOW() WHERE invoice_id = p_invoice_id AND voided_at IS NULL;

    UPDATE invoices
    SET status = 'void', voided_at = NOW(), void_reason = NULLIF(trim(p_reason), ''), amount_paid = 0
    WHERE id = p_invoice_id
    RETURNING * INTO v_invoice;

    RETURN v_invoice;
END;
$$;

CREATE OR REPLACE FUNCTION void_invoice(p_invoice_id UUID, p_reason TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    PERFORM _void_invoice(require_company_role(), p_invoice_id, p_reason);
END;
$$;

-- Corrects an invoice: voids the original and issues a new one in the same transaction
CREATE OR REPLACE FUNCTION replace_invoice(p_invoice_id UUID, p_data JSONB)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_company UUID := require_company_role();
    v_old invoices%ROWTYPE;
    v_new_id UUID;
BEGIN
    v_old := _void_invoice(v_company, p_invoice_id, 'Corregida');
    v_new_id := _create_invoice(v_company, p_data, CASE WHEN v_old.source = 'distributor_order' THEN 'distributor_order' ELSE 'manual' END,
                                v_old.distributor_order_id);
    UPDATE invoices SET replaced_by = v_new_id,
        void_reason = 'Corregida por ' || (SELECT number FROM invoices WHERE id = v_new_id)
    WHERE id = p_invoice_id;
    IF v_old.distributor_order_id IS NOT NULL THEN
        UPDATE distributor_orders SET invoice_id = v_new_id WHERE id = v_old.distributor_order_id;
    END IF;
    RETURN v_new_id;
END;
$$;

-- p_kind: 'invoice' (money in) | 'purchase' (money out)
CREATE OR REPLACE FUNCTION register_payment(
    p_kind TEXT,
    p_document_id UUID,
    p_amount NUMERIC,
    p_payment_date DATE DEFAULT CURRENT_DATE,
    p_method TEXT DEFAULT NULL,
    p_reference TEXT DEFAULT NULL,
    p_notes TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_company UUID := require_company_role();
    v_total NUMERIC;
    v_paid NUMERIC;
    v_status TEXT;
    v_id UUID;
BEGIN
    IF p_amount IS NULL OR p_amount <= 0 THEN
        RAISE EXCEPTION 'El monto debe ser mayor que cero';
    END IF;

    IF p_kind = 'invoice' THEN
        SELECT total, amount_paid, status INTO v_total, v_paid, v_status
        FROM invoices WHERE id = p_document_id AND company_id = v_company FOR UPDATE;
    ELSIF p_kind = 'purchase' THEN
        SELECT total, amount_paid, status INTO v_total, v_paid, v_status
        FROM purchases WHERE id = p_document_id AND company_id = v_company FOR UPDATE;
    ELSE
        RAISE EXCEPTION 'Tipo de documento inválido';
    END IF;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Documento no encontrado';
    END IF;
    IF v_status = 'void' THEN
        RAISE EXCEPTION 'No se pueden registrar pagos en un documento anulado';
    END IF;
    IF p_amount > (v_total - v_paid) + 0.01 THEN
        RAISE EXCEPTION 'El monto excede el saldo pendiente (%)', round(v_total - v_paid, 2);
    END IF;

    INSERT INTO payments (company_id, direction, invoice_id, purchase_id, payment_date, amount, method, reference, notes)
    VALUES (
        v_company,
        CASE WHEN p_kind = 'invoice' THEN 'in' ELSE 'out' END,
        CASE WHEN p_kind = 'invoice' THEN p_document_id END,
        CASE WHEN p_kind = 'purchase' THEN p_document_id END,
        COALESCE(p_payment_date, CURRENT_DATE),
        LEAST(p_amount, v_total - v_paid),
        NULLIF(trim(p_method), ''),
        NULLIF(trim(p_reference), ''),
        NULLIF(trim(p_notes), '')
    )
    RETURNING id INTO v_id;

    IF p_kind = 'invoice' THEN
        UPDATE invoices SET amount_paid = amount_paid + LEAST(p_amount, v_total - v_paid) WHERE id = p_document_id;
    ELSE
        UPDATE purchases SET amount_paid = amount_paid + LEAST(p_amount, v_total - v_paid) WHERE id = p_document_id;
    END IF;

    RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION void_payment(p_payment_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_company UUID := require_company_role();
    v_payment payments%ROWTYPE;
BEGIN
    SELECT * INTO v_payment FROM payments WHERE id = p_payment_id AND company_id = v_company FOR UPDATE;
    IF NOT FOUND OR v_payment.voided_at IS NOT NULL THEN
        RAISE EXCEPTION 'Pago no encontrado o ya anulado';
    END IF;

    UPDATE payments SET voided_at = NOW() WHERE id = p_payment_id;

    IF v_payment.invoice_id IS NOT NULL THEN
        UPDATE invoices SET amount_paid = GREATEST(amount_paid - v_payment.amount, 0) WHERE id = v_payment.invoice_id;
    ELSE
        UPDATE purchases SET amount_paid = GREATEST(amount_paid - v_payment.amount, 0) WHERE id = v_payment.purchase_id;
    END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- Purchases
-- ---------------------------------------------------------------------------
-- p_data: {supplier_id?, purchase_date, due_date?, notes?, lines: [{material_id, quantity, unit_cost}],
--          payment?: {amount, method?, reference?, payment_date?}}
CREATE OR REPLACE FUNCTION create_purchase(p_data JSONB)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_company UUID := require_company_role();
    v_supplier suppliers%ROWTYPE;
    v_id UUID;
    v_number TEXT;
    v_date DATE := COALESCE((p_data ->> 'purchase_date')::DATE, CURRENT_DATE);
    v_line JSONB;
    v_material materials%ROWTYPE;
    v_qty NUMERIC;
    v_cost NUMERIC;
    v_total NUMERIC := 0;
    v_payment NUMERIC;
BEGIN
    IF NULLIF(p_data ->> 'supplier_id', '') IS NOT NULL THEN
        SELECT * INTO v_supplier FROM suppliers WHERE id = (p_data ->> 'supplier_id')::UUID AND company_id = v_company;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Proveedor no encontrado';
        END IF;
    END IF;

    IF jsonb_array_length(COALESCE(p_data -> 'lines', '[]'::JSONB)) = 0 THEN
        RAISE EXCEPTION 'La compra debe tener al menos una materia prima';
    END IF;

    v_number := next_document_number(v_company, 'purchase');

    INSERT INTO purchases (company_id, number, supplier_id, purchase_date, due_date, notes)
    VALUES (v_company, v_number, v_supplier.id, v_date,
            COALESCE((p_data ->> 'due_date')::DATE, v_date + COALESCE(v_supplier.payment_terms_days, 0)),
            NULLIF(trim(p_data ->> 'notes'), ''))
    RETURNING id INTO v_id;

    PERFORM set_config('app.cost_source', 'purchase', TRUE);
    PERFORM set_config('app.cost_reference', v_id::TEXT, TRUE);

    FOR v_line IN SELECT * FROM jsonb_array_elements(p_data -> 'lines') LOOP
        SELECT * INTO v_material FROM materials
        WHERE id = (v_line ->> 'material_id')::UUID AND company_id = v_company
        FOR UPDATE;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Materia prima no encontrada en tu empresa';
        END IF;

        v_qty := (v_line ->> 'quantity')::NUMERIC;
        v_cost := (v_line ->> 'unit_cost')::NUMERIC;
        IF v_qty IS NULL OR v_qty <= 0 OR v_cost IS NULL OR v_cost < 0 THEN
            RAISE EXCEPTION 'Cantidad o costo inválido para "%"', v_material.name;
        END IF;

        INSERT INTO purchase_lines (company_id, purchase_id, material_id, quantity, unit_cost, line_total)
        VALUES (v_company, v_id, v_material.id, v_qty, v_cost, round(v_qty * v_cost, 2));

        -- Moving average for actual cost; last purchase price as the replacement (standard) cost
        UPDATE materials SET
            avg_cost = CASE
                WHEN current_stock <= 0 THEN v_cost
                ELSE (current_stock * avg_cost + v_qty * v_cost) / (current_stock + v_qty)
            END,
            cost_per_unit = v_cost
        WHERE id = v_material.id;

        PERFORM _move_stock(v_company, 'MATERIAL', v_material.id, v_qty, 'PURCHASE', v_id,
                            'Compra ' || v_number, v_cost, TRUE);

        v_total := v_total + round(v_qty * v_cost, 2);
    END LOOP;

    PERFORM set_config('app.cost_source', '', TRUE);
    PERFORM set_config('app.cost_reference', '', TRUE);

    UPDATE purchases SET total = v_total WHERE id = v_id;

    v_payment := (p_data -> 'payment' ->> 'amount')::NUMERIC;
    IF v_payment IS NOT NULL AND v_payment > 0 THEN
        IF v_payment > v_total + 0.01 THEN
            RAISE EXCEPTION 'El pago no puede ser mayor que el total de la compra';
        END IF;
        INSERT INTO payments (company_id, direction, purchase_id, payment_date, amount, method, reference)
        VALUES (v_company, 'out', v_id, COALESCE((p_data -> 'payment' ->> 'payment_date')::DATE, v_date),
                LEAST(v_payment, v_total), NULLIF(p_data -> 'payment' ->> 'method', ''),
                NULLIF(p_data -> 'payment' ->> 'reference', ''));
        UPDATE purchases SET amount_paid = LEAST(v_payment, v_total) WHERE id = v_id;
    END IF;

    RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION void_purchase(p_purchase_id UUID, p_reason TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_company UUID := require_company_role();
    v_purchase purchases%ROWTYPE;
    v_line purchase_lines%ROWTYPE;
BEGIN
    SELECT * INTO v_purchase FROM purchases WHERE id = p_purchase_id AND company_id = v_company FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Compra no encontrada';
    END IF;
    IF v_purchase.status = 'void' THEN
        RAISE EXCEPTION 'La compra ya está anulada';
    END IF;

    FOR v_line IN SELECT * FROM purchase_lines WHERE purchase_id = p_purchase_id LOOP
        PERFORM _move_stock(v_company, 'MATERIAL', v_line.material_id, -v_line.quantity, 'PURCHASE_VOID', p_purchase_id,
                            'Anulación ' || v_purchase.number, v_line.unit_cost, _allow_negative_stock(v_company));
    END LOOP;

    UPDATE payments SET voided_at = NOW() WHERE purchase_id = p_purchase_id AND voided_at IS NULL;
    UPDATE purchases
    SET status = 'void', voided_at = NOW(), void_reason = NULLIF(trim(p_reason), ''), amount_paid = 0
    WHERE id = p_purchase_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- Production
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION create_production_order(
    p_product_id UUID,
    p_planned_quantity NUMERIC,
    p_planned_date DATE DEFAULT CURRENT_DATE,
    p_notes TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_company UUID := require_company_role();
    v_id UUID;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM products WHERE id = p_product_id AND company_id = v_company) THEN
        RAISE EXCEPTION 'Producto no encontrado';
    END IF;
    IF p_planned_quantity IS NULL OR p_planned_quantity <= 0 THEN
        RAISE EXCEPTION 'La cantidad planificada debe ser mayor que cero';
    END IF;

    INSERT INTO production_orders (company_id, number, product_id, planned_date, planned_quantity, notes)
    VALUES (v_company, next_document_number(v_company, 'production'), p_product_id,
            COALESCE(p_planned_date, CURRENT_DATE), p_planned_quantity, NULLIF(trim(p_notes), ''))
    RETURNING id INTO v_id;

    RETURN v_id;
END;
$$;

-- p_consumptions: [{material_id, actual_quantity}]. Recipe materials not listed are consumed at standard.
CREATE OR REPLACE FUNCTION complete_production_order(
    p_order_id UUID,
    p_produced_quantity NUMERIC,
    p_labor_hours NUMERIC DEFAULT NULL,
    p_consumptions JSONB DEFAULT '[]'::JSONB,
    p_completed_date DATE DEFAULT CURRENT_DATE,
    p_notes TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_company UUID := require_company_role();
    v_order production_orders%ROWTYPE;
    v_product products%ROWTYPE;
    v_settings settings%ROWTYPE;
    v_allow_negative BOOLEAN;
    v_row RECORD;
    v_material materials%ROWTYPE;
    v_material_cost NUMERIC := 0;
    v_standard_material_cost NUMERIC := 0;
    v_std_hours NUMERIC;
    v_hours NUMERIC;
    v_labor_cost NUMERIC;
    v_unit_cost NUMERIC;
    v_prev_avg NUMERIC;
    v_new_avg NUMERIC;
BEGIN
    SELECT * INTO v_order FROM production_orders WHERE id = p_order_id AND company_id = v_company FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Orden de producción no encontrada';
    END IF;
    IF v_order.status <> 'planned' THEN
        RAISE EXCEPTION 'La orden ya fue completada o cancelada';
    END IF;
    IF p_produced_quantity IS NULL OR p_produced_quantity <= 0 THEN
        RAISE EXCEPTION 'La cantidad producida debe ser mayor que cero';
    END IF;

    SELECT * INTO v_product FROM products WHERE id = v_order.product_id FOR UPDATE;
    SELECT * INTO v_settings FROM settings WHERE company_id = v_company;
    v_allow_negative := COALESCE(v_settings.allow_negative_stock, FALSE);

    IF v_product.batch_size IS NULL OR v_product.batch_size <= 0 THEN
        RAISE EXCEPTION 'El producto no tiene un tamaño de lote válido';
    END IF;

    -- Standard quantities come from the recipe scaled to what was actually produced
    FOR v_row IN
        WITH recipe AS (
            SELECT b.material_id, SUM(b.quantity) / v_product.batch_size * p_produced_quantity AS standard_quantity
            FROM bom_items b
            WHERE b.product_id = v_product.id
            GROUP BY b.material_id
        ),
        reported AS (
            SELECT (e ->> 'material_id')::UUID AS material_id, SUM((e ->> 'actual_quantity')::NUMERIC) AS actual_quantity
            FROM jsonb_array_elements(COALESCE(p_consumptions, '[]'::JSONB)) e
            GROUP BY 1
        )
        SELECT COALESCE(r.material_id, x.material_id) AS material_id,
               COALESCE(r.standard_quantity, 0) AS standard_quantity,
               COALESCE(x.actual_quantity, r.standard_quantity, 0) AS actual_quantity
        FROM recipe r
        FULL OUTER JOIN reported x ON x.material_id = r.material_id
    LOOP
        IF v_row.actual_quantity < 0 THEN
            RAISE EXCEPTION 'Las cantidades consumidas no pueden ser negativas';
        END IF;

        SELECT * INTO v_material FROM materials WHERE id = v_row.material_id AND company_id = v_company FOR UPDATE;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Materia prima no encontrada en tu empresa';
        END IF;

        INSERT INTO production_consumptions (company_id, production_order_id, material_id, standard_quantity,
                                             actual_quantity, standard_price, unit_cost, actual_cost)
        VALUES (v_company, v_order.id, v_material.id, v_row.standard_quantity, v_row.actual_quantity,
                v_material.cost_per_unit, v_material.avg_cost, v_row.actual_quantity * v_material.avg_cost);

        IF v_row.actual_quantity > 0 THEN
            PERFORM _move_stock(v_company, 'MATERIAL', v_material.id, -v_row.actual_quantity, 'PRODUCTION_USAGE',
                                v_order.id, 'Producción ' || v_order.number, v_material.avg_cost, v_allow_negative);
        END IF;

        v_material_cost := v_material_cost + v_row.actual_quantity * v_material.avg_cost;
        v_standard_material_cost := v_standard_material_cost + v_row.standard_quantity * v_material.cost_per_unit;
    END LOOP;

    v_std_hours := COALESCE(v_product.production_time_hours, 0) / v_product.batch_size * p_produced_quantity;
    v_hours := COALESCE(p_labor_hours, v_std_hours);
    IF v_hours < 0 THEN
        RAISE EXCEPTION 'Las horas de mano de obra no pueden ser negativas';
    END IF;
    v_labor_cost := v_hours * COALESCE(v_settings.labor_cost_per_hour, 0);

    v_unit_cost := (v_material_cost + CASE WHEN COALESCE(v_settings.labor_is_variable, FALSE) THEN v_labor_cost ELSE 0 END)
                   / p_produced_quantity;

    v_prev_avg := COALESCE(v_product.avg_unit_cost, v_product.variable_unit_cost);
    v_new_avg := CASE
        WHEN v_product.current_stock <= 0 THEN v_unit_cost
        ELSE (v_product.current_stock * v_prev_avg + p_produced_quantity * v_unit_cost) / (v_product.current_stock + p_produced_quantity)
    END;

    UPDATE products SET avg_unit_cost = v_new_avg WHERE id = v_product.id;

    PERFORM _move_stock(v_company, 'PRODUCT', v_product.id, p_produced_quantity, 'PRODUCTION_OUTPUT', v_order.id,
                        'Producción ' || v_order.number, v_unit_cost, TRUE);

    UPDATE production_orders SET
        status = 'completed',
        produced_quantity = p_produced_quantity,
        completed_date = COALESCE(p_completed_date, CURRENT_DATE),
        labor_hours = v_hours,
        labor_cost = v_labor_cost,
        standard_labor_hours = v_std_hours,
        standard_labor_cost = v_std_hours * COALESCE(v_settings.labor_cost_per_hour, 0),
        material_cost = v_material_cost,
        standard_material_cost = v_standard_material_cost,
        standard_unit_cost = v_product.variable_unit_cost,
        actual_unit_cost = v_unit_cost,
        notes = COALESCE(NULLIF(trim(p_notes), ''), notes)
    WHERE id = v_order.id;
END;
$$;

CREATE OR REPLACE FUNCTION cancel_production_order(p_order_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_company UUID := require_company_role();
BEGIN
    UPDATE production_orders SET status = 'cancelled', cancelled_at = NOW()
    WHERE id = p_order_id AND company_id = v_company AND status = 'planned';
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Solo se pueden cancelar órdenes planificadas';
    END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- Distributor orders (business side)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION accept_distributor_order(p_order_id UUID, p_issue_date DATE DEFAULT CURRENT_DATE)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_company UUID := require_company_role();
    v_order distributor_orders%ROWTYPE;
    v_channel_id UUID;
    v_invoice_id UUID;
BEGIN
    SELECT * INTO v_order FROM distributor_orders WHERE id = p_order_id AND company_id = v_company FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Pedido no encontrado';
    END IF;
    IF v_order.status <> 'submitted' THEN
        RAISE EXCEPTION 'Este pedido ya fue procesado';
    END IF;

    SELECT id INTO v_channel_id FROM sales_channels
    WHERE company_id = v_company AND kind = 'distributor' AND is_active
    ORDER BY created_at LIMIT 1;

    IF v_channel_id IS NULL THEN
        INSERT INTO sales_channels (company_id, name, kind, price_basis, payment_terms_days)
        VALUES (v_company, 'Distribuidores', 'distributor', 'distributor', 30)
        ON CONFLICT (company_id, name) DO UPDATE SET is_active = TRUE
        RETURNING id INTO v_channel_id;
    END IF;

    v_invoice_id := _create_invoice(
        v_company,
        jsonb_build_object(
            'issue_date', COALESCE(p_issue_date, CURRENT_DATE),
            'channel_id', v_channel_id,
            'distributor_id', v_order.distributor_id,
            'notes', 'Pedido ' || v_order.number,
            'lines', (
                SELECT jsonb_agg(jsonb_build_object('product_id', l.product_id, 'quantity', l.quantity, 'unit_price', l.unit_price))
                FROM distributor_order_lines l WHERE l.order_id = v_order.id
            )
        ),
        'distributor_order',
        v_order.id
    );

    UPDATE distributor_orders
    SET status = 'invoiced', invoice_id = v_invoice_id, reviewed_by = auth.uid(), reviewed_at = NOW()
    WHERE id = v_order.id;

    RETURN v_invoice_id;
END;
$$;

CREATE OR REPLACE FUNCTION reject_distributor_order(p_order_id UUID, p_reason TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_company UUID := require_company_role();
BEGIN
    IF COALESCE(trim(p_reason), '') = '' THEN
        RAISE EXCEPTION 'Indica el motivo del rechazo para que el distribuidor lo vea';
    END IF;
    UPDATE distributor_orders
    SET status = 'rejected', rejection_reason = trim(p_reason), reviewed_by = auth.uid(), reviewed_at = NOW()
    WHERE id = p_order_id AND company_id = v_company AND status = 'submitted';
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Pedido no encontrado o ya procesado';
    END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- Retire the legacy sales RPCs
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS process_sale(JSONB, JSONB);
DROP FUNCTION IF EXISTS reverse_sale(TEXT, UUID, JSONB);

-- ---------------------------------------------------------------------------
-- Execution grants: internal helpers are not callable from clients; the public API is
-- callable by signed-in users only (each function checks the caller's company and role).
-- ---------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION require_company_role(TEXT[]) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION _move_stock(UUID, TEXT, UUID, NUMERIC, TEXT, UUID, TEXT, NUMERIC, BOOLEAN) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION _allow_negative_stock(UUID) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION _create_invoice(UUID, JSONB, TEXT, UUID) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION _void_invoice(UUID, UUID, TEXT) FROM PUBLIC, anon, authenticated;

DO $$
DECLARE
    f TEXT;
BEGIN
    FOREACH f IN ARRAY ARRAY[
        'create_company(TEXT, TEXT, TEXT)',
        'create_member_invitation(TEXT, TEXT)',
        'create_distributor_invitation(UUID, TEXT)',
        'revoke_invitation(UUID)',
        'accept_invitation(TEXT, TEXT)',
        'list_team_members()',
        'update_member_role(UUID, TEXT)',
        'remove_member(UUID)',
        'list_distributor_portal_users()',
        'remove_distributor_portal_user(UUID)',
        'save_product(UUID, JSONB, JSONB)',
        'adjust_inventory(TEXT, UUID, NUMERIC, TEXT)',
        'create_invoice(JSONB)',
        'void_invoice(UUID, TEXT)',
        'replace_invoice(UUID, JSONB)',
        'register_payment(TEXT, UUID, NUMERIC, DATE, TEXT, TEXT, TEXT)',
        'void_payment(UUID)',
        'create_purchase(JSONB)',
        'void_purchase(UUID, TEXT)',
        'create_production_order(UUID, NUMERIC, DATE, TEXT)',
        'complete_production_order(UUID, NUMERIC, NUMERIC, JSONB, DATE, TEXT)',
        'cancel_production_order(UUID)',
        'accept_distributor_order(UUID, DATE)',
        'reject_distributor_order(UUID, TEXT)'
    ] LOOP
        EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', f);
        EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', f);
    END LOOP;
END $$;

-- Anyone holding an invitation link may preview it before signing in
GRANT EXECUTE ON FUNCTION invitation_preview(TEXT) TO anon, authenticated;
