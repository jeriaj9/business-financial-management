-- 0009: Distributor portal API
--
-- Distributor users have no direct table access. Everything they see goes through these
-- functions, which only return what a distributor should see (their prices, their orders,
-- their account) and never internal costs or margins.

CREATE OR REPLACE FUNCTION _require_distributor_access(p_distributor_id UUID)
RETURNS UUID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_company UUID;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Debes iniciar sesión' USING ERRCODE = '28000';
    END IF;

    SELECT du.company_id INTO v_company
    FROM distributor_users du
    JOIN distributors d ON d.id = du.distributor_id
    WHERE du.user_id = auth.uid() AND du.distributor_id = p_distributor_id AND d.is_active;

    IF v_company IS NULL THEN
        RAISE EXCEPTION 'No tienes acceso a esta cuenta de distribuidor' USING ERRCODE = '42501';
    END IF;
    RETURN v_company;
END;
$$;

CREATE OR REPLACE FUNCTION portal_accounts()
RETURNS TABLE (distributor_id UUID, distributor_name TEXT, company_id UUID, company_name TEXT, currency TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT d.id, d.name::TEXT, c.id, c.name::TEXT, COALESCE(s.currency, 'DOP')::TEXT
    FROM distributor_users du
    JOIN distributors d ON d.id = du.distributor_id AND d.is_active
    JOIN companies c ON c.id = du.company_id
    LEFT JOIN settings s ON s.company_id = c.id
    WHERE du.user_id = auth.uid()
    ORDER BY c.name, d.name;
$$;

CREATE OR REPLACE FUNCTION portal_catalog(p_distributor_id UUID)
RETURNS TABLE (
    product_id UUID,
    name TEXT,
    sku TEXT,
    category TEXT,
    description TEXT,
    unit_price NUMERIC,
    suggested_retail_price NUMERIC,
    available BOOLEAN
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_company UUID := _require_distributor_access(p_distributor_id);
BEGIN
    RETURN QUERY
    SELECT
        p.id,
        p.name::TEXT,
        p.sku::TEXT,
        p.category::TEXT,
        p.description,
        resolve_distributor_price(p.retail_price, p.distributor_price, d.margin_override, s.distributor_margin),
        p.retail_price,
        p.current_stock > 0
    FROM products p
    JOIN distributors d ON d.id = p_distributor_id
    LEFT JOIN settings s ON s.company_id = v_company
    WHERE p.company_id = v_company AND p.is_active AND p.retail_price > 0
    ORDER BY p.category NULLS LAST, p.name;
END;
$$;

-- p_lines: [{product_id, quantity}]. Prices are resolved on the server, never trusted from the client.
CREATE OR REPLACE FUNCTION portal_submit_order(
    p_distributor_id UUID,
    p_lines JSONB,
    p_notes TEXT DEFAULT NULL,
    p_requested_date DATE DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_company UUID := _require_distributor_access(p_distributor_id);
    v_distributor distributors%ROWTYPE;
    v_default_margin NUMERIC;
    v_order_id UUID;
    v_line JSONB;
    v_product products%ROWTYPE;
    v_qty NUMERIC;
    v_price NUMERIC;
    v_total NUMERIC := 0;
BEGIN
    IF jsonb_array_length(COALESCE(p_lines, '[]'::JSONB)) = 0 THEN
        RAISE EXCEPTION 'El pedido debe tener al menos un producto';
    END IF;

    SELECT * INTO v_distributor FROM distributors WHERE id = p_distributor_id;
    SELECT distributor_margin INTO v_default_margin FROM settings WHERE company_id = v_company;

    INSERT INTO distributor_orders (company_id, distributor_id, number, requested_date, notes)
    VALUES (v_company, p_distributor_id, next_document_number(v_company, 'distributor_order'),
            p_requested_date, NULLIF(trim(p_notes), ''))
    RETURNING id INTO v_order_id;

    FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
        SELECT * INTO v_product FROM products
        WHERE id = (v_line ->> 'product_id')::UUID AND company_id = v_company AND is_active AND retail_price > 0;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Uno de los productos ya no está disponible en el catálogo';
        END IF;

        v_qty := (v_line ->> 'quantity')::NUMERIC;
        IF v_qty IS NULL OR v_qty <= 0 OR v_qty <> trunc(v_qty) THEN
            RAISE EXCEPTION 'La cantidad de "%" debe ser un número entero mayor que cero', v_product.name;
        END IF;

        v_price := resolve_distributor_price(v_product.retail_price, v_product.distributor_price,
                                             v_distributor.margin_override, v_default_margin);

        INSERT INTO distributor_order_lines (company_id, order_id, product_id, quantity, unit_price, line_total)
        VALUES (v_company, v_order_id, v_product.id, v_qty, v_price, round(v_qty * v_price, 2));

        v_total := v_total + round(v_qty * v_price, 2);
    END LOOP;

    UPDATE distributor_orders SET total = v_total WHERE id = v_order_id;
    RETURN v_order_id;
END;
$$;

CREATE OR REPLACE FUNCTION portal_cancel_order(p_order_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_distributor UUID;
BEGIN
    SELECT distributor_id INTO v_distributor FROM distributor_orders WHERE id = p_order_id;
    IF v_distributor IS NULL THEN
        RAISE EXCEPTION 'Pedido no encontrado';
    END IF;
    PERFORM _require_distributor_access(v_distributor);

    UPDATE distributor_orders SET status = 'cancelled'
    WHERE id = p_order_id AND status = 'submitted';
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Solo puedes cancelar pedidos que aún no han sido procesados';
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION portal_orders(p_distributor_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_company UUID := _require_distributor_access(p_distributor_id);
BEGIN
    RETURN COALESCE((
        SELECT jsonb_agg(
            jsonb_build_object(
                'id', o.id,
                'number', o.number,
                'status', o.status,
                'created_at', o.created_at,
                'requested_date', o.requested_date,
                'notes', o.notes,
                'total', o.total,
                'rejection_reason', o.rejection_reason,
                'invoice_number', i.number,
                'lines', (
                    SELECT COALESCE(jsonb_agg(jsonb_build_object(
                        'product_name', p.name, 'sku', p.sku, 'quantity', l.quantity,
                        'unit_price', l.unit_price, 'line_total', l.line_total
                    ) ORDER BY p.name), '[]'::JSONB)
                    FROM distributor_order_lines l JOIN products p ON p.id = l.product_id
                    WHERE l.order_id = o.id
                )
            ) ORDER BY o.created_at DESC
        )
        FROM distributor_orders o
        LEFT JOIN invoices i ON i.id = o.invoice_id
        WHERE o.distributor_id = p_distributor_id AND o.company_id = v_company
    ), '[]'::JSONB);
END;
$$;

CREATE OR REPLACE FUNCTION portal_statement(p_distributor_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_company UUID := _require_distributor_access(p_distributor_id);
    v_distributor distributors%ROWTYPE;
    v_invoices JSONB;
    v_payments JSONB;
    v_invoiced NUMERIC;
    v_paid NUMERIC;
    v_overdue NUMERIC;
BEGIN
    SELECT * INTO v_distributor FROM distributors WHERE id = p_distributor_id;

    SELECT
        COALESCE(SUM(total), 0),
        COALESCE(SUM(amount_paid), 0),
        COALESCE(SUM(total - amount_paid) FILTER (WHERE due_date < CURRENT_DATE AND total - amount_paid > 0.009), 0)
    INTO v_invoiced, v_paid, v_overdue
    FROM invoices
    WHERE distributor_id = p_distributor_id AND company_id = v_company AND status = 'issued';

    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', i.id,
        'number', i.number,
        'issue_date', i.issue_date,
        'due_date', i.due_date,
        'total', i.total,
        'amount_paid', i.amount_paid,
        'balance', i.total - i.amount_paid,
        'payment_status', CASE
            WHEN i.total - i.amount_paid <= 0.009 THEN 'paid'
            WHEN i.due_date < CURRENT_DATE THEN 'overdue'
            WHEN i.amount_paid > 0 THEN 'partial'
            ELSE 'pending'
        END,
        'lines', (
            SELECT COALESCE(jsonb_agg(jsonb_build_object(
                'product_name', COALESCE(p.name, l.description), 'quantity', l.quantity,
                'unit_price', l.unit_price, 'discount_pct', l.discount_pct, 'line_total', l.line_total
            )), '[]'::JSONB)
            FROM invoice_lines l LEFT JOIN products p ON p.id = l.product_id
            WHERE l.invoice_id = i.id
        )
    ) ORDER BY i.issue_date DESC, i.number DESC), '[]'::JSONB)
    INTO v_invoices
    FROM invoices i
    WHERE i.distributor_id = p_distributor_id AND i.company_id = v_company AND i.status = 'issued';

    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'payment_date', pm.payment_date,
        'amount', pm.amount,
        'method', pm.method,
        'reference', pm.reference,
        'invoice_number', i.number
    ) ORDER BY pm.payment_date DESC), '[]'::JSONB)
    INTO v_payments
    FROM payments pm
    JOIN invoices i ON i.id = pm.invoice_id
    WHERE i.distributor_id = p_distributor_id AND i.company_id = v_company AND pm.voided_at IS NULL;

    RETURN jsonb_build_object(
        'summary', jsonb_build_object(
            'total_invoiced', v_invoiced,
            'total_paid', v_paid,
            'balance', v_invoiced - v_paid,
            'overdue', v_overdue,
            'credit_limit', v_distributor.credit_limit,
            'available_credit', CASE WHEN v_distributor.credit_limit IS NULL THEN NULL
                                     ELSE GREATEST(v_distributor.credit_limit - (v_invoiced - v_paid), 0) END,
            'payment_terms_days', v_distributor.payment_terms_days
        ),
        'invoices', v_invoices,
        'payments', v_payments
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION _require_distributor_access(UUID) FROM PUBLIC, anon, authenticated;

DO $$
DECLARE
    f TEXT;
BEGIN
    FOREACH f IN ARRAY ARRAY[
        'portal_accounts()',
        'portal_catalog(UUID)',
        'portal_submit_order(UUID, JSONB, TEXT, DATE)',
        'portal_cancel_order(UUID)',
        'portal_orders(UUID)',
        'portal_statement(UUID)'
    ] LOOP
        EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', f);
        EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', f);
    END LOOP;
END $$;
