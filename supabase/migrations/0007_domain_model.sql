-- 0007: Domain model for the profitability platform
--
-- Adds the records the platform needs to connect its modules:
--   * sales channels with their costs, customers, suppliers
--   * invoices with lines and payments (replaces the flat `sales` table, migrated below)
--   * purchases that update material cost and stock
--   * production orders that consume materials and produce finished goods (standard vs actual)
--   * cost and price history (the basis for cost-impact alerts and variance explanations)
--   * distributor portal users, invitations and distributor orders
--
-- Principles:
--   * Stock balances and financial documents change only through RPCs (0008/0009), never
--     directly from the browser. Records are voided, not deleted.
--   * Product "full cost" (materials + labor + overhead reserve) drives pricing.
--     "Variable cost" (materials, plus labor only when it is paid per unit) drives COGS,
--     so fixed payroll and overhead recorded as expenses are not counted twice.

-- ---------------------------------------------------------------------------
-- Settings
-- ---------------------------------------------------------------------------
ALTER TABLE settings
  ADD COLUMN IF NOT EXISTS labor_is_variable BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS allow_negative_stock BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS opening_cash_balance NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS opening_cash_date DATE,
  ADD COLUMN IF NOT EXISTS default_payment_terms_days INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS safety_stock_weeks NUMERIC NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS demand_lookback_weeks INTEGER NOT NULL DEFAULT 8,
  ADD COLUMN IF NOT EXISTS default_lead_time_days INTEGER NOT NULL DEFAULT 7;

-- ---------------------------------------------------------------------------
-- Document numbering
-- ---------------------------------------------------------------------------
CREATE TABLE document_sequences (
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    doc_type TEXT NOT NULL,
    prefix TEXT NOT NULL,
    next_value BIGINT NOT NULL DEFAULT 1,
    PRIMARY KEY (company_id, doc_type)
);

CREATE OR REPLACE FUNCTION next_document_number(p_company_id UUID, p_doc_type TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_prefix TEXT;
    v_value BIGINT;
BEGIN
    INSERT INTO document_sequences (company_id, doc_type, prefix, next_value)
    VALUES (
        p_company_id,
        p_doc_type,
        CASE p_doc_type
            WHEN 'invoice' THEN 'FAC'
            WHEN 'purchase' THEN 'COM'
            WHEN 'production' THEN 'OP'
            WHEN 'distributor_order' THEN 'PED'
            ELSE upper(left(p_doc_type, 3))
        END,
        2
    )
    ON CONFLICT (company_id, doc_type)
    DO UPDATE SET next_value = document_sequences.next_value + 1
    RETURNING prefix, next_value - 1 INTO v_prefix, v_value;

    RETURN v_prefix || '-' || lpad(v_value::TEXT, 5, '0');
END;
$$;

-- ---------------------------------------------------------------------------
-- Sales channels
-- ---------------------------------------------------------------------------
CREATE TABLE sales_channels (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    kind TEXT NOT NULL DEFAULT 'direct' CHECK (kind IN ('direct', 'distributor', 'online', 'wholesale', 'other')),
    price_basis TEXT NOT NULL DEFAULT 'retail' CHECK (price_basis IN ('retail', 'distributor')),
    commission_pct NUMERIC NOT NULL DEFAULT 0 CHECK (commission_pct >= 0 AND commission_pct < 1),
    payment_fee_pct NUMERIC NOT NULL DEFAULT 0 CHECK (payment_fee_pct >= 0 AND payment_fee_pct < 1),
    cost_per_order NUMERIC NOT NULL DEFAULT 0 CHECK (cost_per_order >= 0),
    cost_per_unit NUMERIC NOT NULL DEFAULT 0 CHECK (cost_per_unit >= 0),
    payment_terms_days INTEGER NOT NULL DEFAULT 0 CHECK (payment_terms_days >= 0),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (company_id, name)
);

-- ---------------------------------------------------------------------------
-- Customers & suppliers
-- ---------------------------------------------------------------------------
CREATE TABLE customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    tax_id TEXT,
    email TEXT,
    phone TEXT,
    address TEXT,
    notes TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_customers_company ON customers (company_id);

CREATE TABLE suppliers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    tax_id TEXT,
    contact_name TEXT,
    email TEXT,
    phone TEXT,
    payment_terms_days INTEGER NOT NULL DEFAULT 0 CHECK (payment_terms_days >= 0),
    lead_time_days INTEGER NOT NULL DEFAULT 7 CHECK (lead_time_days >= 0),
    notes TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (company_id, name)
);

-- ---------------------------------------------------------------------------
-- Materials: supplier link, moving average cost, lead time
-- ---------------------------------------------------------------------------
ALTER TABLE materials
  ADD COLUMN IF NOT EXISTS supplier_id UUID REFERENCES suppliers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS avg_cost NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS lead_time_days INTEGER CHECK (lead_time_days IS NULL OR lead_time_days >= 0),
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;

INSERT INTO suppliers (company_id, name)
SELECT DISTINCT company_id, trim(supplier)
FROM materials
WHERE company_id IS NOT NULL AND COALESCE(trim(supplier), '') <> ''
ON CONFLICT (company_id, name) DO NOTHING;

UPDATE materials m
SET supplier_id = s.id
FROM suppliers s
WHERE s.company_id = m.company_id AND s.name = trim(m.supplier);

UPDATE materials SET avg_cost = cost_per_unit;

-- ---------------------------------------------------------------------------
-- Distributors: commercial terms
-- ---------------------------------------------------------------------------
ALTER TABLE distributors
  ADD COLUMN IF NOT EXISTS payment_terms_days INTEGER NOT NULL DEFAULT 30 CHECK (payment_terms_days >= 0),
  ADD COLUMN IF NOT EXISTS credit_limit NUMERIC CHECK (credit_limit IS NULL OR credit_limit >= 0),
  ADD COLUMN IF NOT EXISTS tax_id TEXT,
  ADD COLUMN IF NOT EXISTS address TEXT,
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE distributors ADD CONSTRAINT distributors_margin_override_check
  CHECK (margin_override IS NULL OR (margin_override >= 0 AND margin_override < 1));

-- ---------------------------------------------------------------------------
-- Products: stored list prices, variable vs full cost, actual average cost
-- ---------------------------------------------------------------------------
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS variable_unit_cost NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS avg_unit_cost NUMERIC,
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;

-- NULL distributor_price means "derive it from the retail price and the distributor margin"
ALTER TABLE products ALTER COLUMN distributor_price DROP NOT NULL;
ALTER TABLE products ALTER COLUMN distributor_price DROP DEFAULT;
UPDATE products SET distributor_price = NULL WHERE distributor_price = 0;

-- Product costs are always derived from the recipe, material costs and settings
CREATE OR REPLACE FUNCTION trg_products_compute_costs()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_batch NUMERIC := COALESCE(NEW.batch_size, 0);
    v_batch_material NUMERIC;
    v_rate NUMERIC;
    v_reserve NUMERIC;
    v_labor_variable BOOLEAN;
BEGIN
    SELECT COALESCE(SUM(b.quantity * m.cost_per_unit), 0)
    INTO v_batch_material
    FROM bom_items b
    JOIN materials m ON m.id = b.material_id
    WHERE b.product_id = NEW.id;

    SELECT labor_cost_per_hour, indirect_cost_reserve, labor_is_variable
    INTO v_rate, v_reserve, v_labor_variable
    FROM settings
    WHERE company_id = NEW.company_id;

    IF v_batch > 0 THEN
        NEW.calculated_material_cost := v_batch_material / v_batch;
        NEW.calculated_labor_cost := COALESCE(NEW.production_time_hours, 0) * COALESCE(v_rate, 0) / v_batch;
    ELSE
        NEW.calculated_material_cost := 0;
        NEW.calculated_labor_cost := 0;
    END IF;

    NEW.calculated_indirect_cost := (NEW.calculated_material_cost + NEW.calculated_labor_cost) * COALESCE(v_reserve, 0);
    NEW.total_cost := NEW.calculated_material_cost + NEW.calculated_labor_cost + NEW.calculated_indirect_cost;
    NEW.variable_unit_cost := NEW.calculated_material_cost
        + CASE WHEN COALESCE(v_labor_variable, FALSE) THEN NEW.calculated_labor_cost ELSE 0 END;
    RETURN NEW;
END;
$$;

CREATE TRIGGER products_compute_costs
BEFORE INSERT OR UPDATE ON products
FOR EACH ROW EXECUTE FUNCTION trg_products_compute_costs();

-- Touching a product re-runs the cost trigger above
CREATE OR REPLACE FUNCTION trg_bom_items_touch_product()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF TG_OP IN ('UPDATE', 'DELETE') THEN
        UPDATE products SET updated_at = NOW() WHERE id = OLD.product_id;
    END IF;
    IF TG_OP IN ('INSERT', 'UPDATE') THEN
        UPDATE products SET updated_at = NOW() WHERE id = NEW.product_id;
    END IF;
    RETURN NULL;
END;
$$;

CREATE TRIGGER bom_items_touch_product
AFTER INSERT OR UPDATE OR DELETE ON bom_items
FOR EACH ROW EXECUTE FUNCTION trg_bom_items_touch_product();

CREATE OR REPLACE FUNCTION trg_settings_touch_products()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NEW.labor_cost_per_hour IS DISTINCT FROM OLD.labor_cost_per_hour
       OR NEW.indirect_cost_reserve IS DISTINCT FROM OLD.indirect_cost_reserve
       OR NEW.labor_is_variable IS DISTINCT FROM OLD.labor_is_variable THEN
        UPDATE products SET updated_at = NOW() WHERE company_id = NEW.company_id;
    END IF;
    RETURN NULL;
END;
$$;

CREATE TRIGGER settings_touch_products
AFTER UPDATE ON settings
FOR EACH ROW EXECUTE FUNCTION trg_settings_touch_products();

-- ---------------------------------------------------------------------------
-- Cost & price history
-- ---------------------------------------------------------------------------
CREATE TABLE material_cost_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    material_id UUID NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
    effective_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    previous_cost NUMERIC,
    new_cost NUMERIC NOT NULL,
    source TEXT NOT NULL CHECK (source IN ('initial', 'manual', 'purchase')),
    reference_id UUID,
    created_by UUID DEFAULT auth.uid()
);
CREATE INDEX idx_material_cost_history ON material_cost_history (company_id, material_id, effective_at);

INSERT INTO material_cost_history (company_id, material_id, effective_at, previous_cost, new_cost, source, created_by)
SELECT company_id, id, COALESCE(created_at, NOW()), NULL, cost_per_unit, 'initial', NULL
FROM materials
WHERE company_id IS NOT NULL;

CREATE OR REPLACE FUNCTION trg_materials_before_write()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF TG_OP = 'INSERT' AND COALESCE(NEW.avg_cost, 0) = 0 THEN
        NEW.avg_cost := NEW.cost_per_unit;
    END IF;
    NEW.updated_at := NOW();
    RETURN NEW;
END;
$$;

CREATE TRIGGER materials_before_write
BEFORE INSERT OR UPDATE ON materials
FOR EACH ROW EXECUTE FUNCTION trg_materials_before_write();

CREATE OR REPLACE FUNCTION trg_materials_after_write()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        INSERT INTO material_cost_history (company_id, material_id, previous_cost, new_cost, source)
        VALUES (NEW.company_id, NEW.id, NULL, NEW.cost_per_unit, 'initial');

        IF COALESCE(NEW.current_stock, 0) <> 0 THEN
            INSERT INTO inventory_transactions (company_id, item_type, item_id, transaction_type, quantity, notes, unit_cost)
            VALUES (NEW.company_id, 'MATERIAL', NEW.id, 'OPENING', NEW.current_stock, 'Inventario inicial', NEW.cost_per_unit);
        END IF;
    ELSIF NEW.cost_per_unit IS DISTINCT FROM OLD.cost_per_unit THEN
        INSERT INTO material_cost_history (company_id, material_id, previous_cost, new_cost, source, reference_id)
        VALUES (
            NEW.company_id,
            NEW.id,
            OLD.cost_per_unit,
            NEW.cost_per_unit,
            COALESCE(NULLIF(current_setting('app.cost_source', TRUE), ''), 'manual'),
            NULLIF(current_setting('app.cost_reference', TRUE), '')::UUID
        );

        UPDATE products p SET updated_at = NOW()
        WHERE p.id IN (SELECT b.product_id FROM bom_items b WHERE b.material_id = NEW.id);
    END IF;
    RETURN NULL;
END;
$$;

CREATE TRIGGER materials_after_write
AFTER INSERT OR UPDATE ON materials
FOR EACH ROW EXECUTE FUNCTION trg_materials_after_write();

CREATE TABLE product_price_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    effective_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    previous_retail_price NUMERIC,
    retail_price NUMERIC NOT NULL,
    previous_distributor_price NUMERIC,
    distributor_price NUMERIC,
    created_by UUID DEFAULT auth.uid()
);
CREATE INDEX idx_product_price_history ON product_price_history (company_id, product_id, effective_at);

-- ---------------------------------------------------------------------------
-- Inventory ledger
-- ---------------------------------------------------------------------------
ALTER TABLE inventory_transactions
  ADD COLUMN IF NOT EXISTS unit_cost NUMERIC,
  ADD COLUMN IF NOT EXISTS created_by UUID DEFAULT auth.uid();

CREATE INDEX IF NOT EXISTS idx_inv_tx_item ON inventory_transactions (company_id, item_id, created_at DESC);

CREATE OR REPLACE FUNCTION trg_products_after_write()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        INSERT INTO product_price_history (company_id, product_id, retail_price, distributor_price)
        VALUES (NEW.company_id, NEW.id, NEW.retail_price, NEW.distributor_price);

        IF COALESCE(NEW.current_stock, 0) <> 0 THEN
            INSERT INTO inventory_transactions (company_id, item_type, item_id, transaction_type, quantity, notes, unit_cost)
            VALUES (NEW.company_id, 'PRODUCT', NEW.id, 'OPENING', NEW.current_stock, 'Inventario inicial', NEW.variable_unit_cost);
        END IF;
    ELSIF NEW.retail_price IS DISTINCT FROM OLD.retail_price
       OR NEW.distributor_price IS DISTINCT FROM OLD.distributor_price THEN
        INSERT INTO product_price_history (
            company_id, product_id, previous_retail_price, retail_price, previous_distributor_price, distributor_price
        )
        VALUES (NEW.company_id, NEW.id, OLD.retail_price, NEW.retail_price, OLD.distributor_price, NEW.distributor_price);
    END IF;
    RETURN NULL;
END;
$$;

CREATE TRIGGER products_after_write
AFTER INSERT OR UPDATE ON products
FOR EACH ROW EXECUTE FUNCTION trg_products_after_write();

-- ---------------------------------------------------------------------------
-- Invoices, lines and payments
-- ---------------------------------------------------------------------------
CREATE TABLE invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    number TEXT NOT NULL,
    issue_date DATE NOT NULL DEFAULT CURRENT_DATE,
    due_date DATE NOT NULL DEFAULT CURRENT_DATE,
    channel_id UUID NOT NULL REFERENCES sales_channels(id) ON DELETE RESTRICT,
    customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
    distributor_id UUID REFERENCES distributors(id) ON DELETE SET NULL,
    customer_name TEXT,
    status TEXT NOT NULL DEFAULT 'issued' CHECK (status IN ('issued', 'void')),
    subtotal NUMERIC NOT NULL DEFAULT 0,
    discount_total NUMERIC NOT NULL DEFAULT 0,
    total NUMERIC NOT NULL DEFAULT 0,
    cogs_total NUMERIC NOT NULL DEFAULT 0,
    amount_paid NUMERIC NOT NULL DEFAULT 0,
    source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'distributor_order', 'legacy')),
    fiscal_number TEXT,
    notes TEXT,
    created_by UUID DEFAULT auth.uid(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    voided_at TIMESTAMPTZ,
    void_reason TEXT,
    replaced_by UUID REFERENCES invoices(id) ON DELETE SET NULL,
    UNIQUE (company_id, number)
);
CREATE INDEX idx_invoices_company_date ON invoices (company_id, issue_date DESC);
CREATE INDEX idx_invoices_distributor ON invoices (distributor_id) WHERE distributor_id IS NOT NULL;

CREATE TABLE invoice_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
    product_id UUID REFERENCES products(id) ON DELETE RESTRICT,
    description TEXT,
    quantity NUMERIC NOT NULL CHECK (quantity > 0),
    list_price NUMERIC NOT NULL DEFAULT 0,
    unit_price NUMERIC NOT NULL CHECK (unit_price >= 0),
    discount_pct NUMERIC NOT NULL DEFAULT 0 CHECK (discount_pct >= 0 AND discount_pct <= 1),
    line_total NUMERIC NOT NULL,
    unit_cost NUMERIC NOT NULL DEFAULT 0,
    standard_unit_cost NUMERIC NOT NULL DEFAULT 0,
    cogs NUMERIC NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_invoice_lines_invoice ON invoice_lines (invoice_id);
CREATE INDEX idx_invoice_lines_product ON invoice_lines (company_id, product_id);

-- ---------------------------------------------------------------------------
-- Purchases
-- ---------------------------------------------------------------------------
CREATE TABLE purchases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    number TEXT NOT NULL,
    supplier_id UUID REFERENCES suppliers(id) ON DELETE RESTRICT,
    purchase_date DATE NOT NULL DEFAULT CURRENT_DATE,
    due_date DATE NOT NULL DEFAULT CURRENT_DATE,
    status TEXT NOT NULL DEFAULT 'received' CHECK (status IN ('received', 'void')),
    total NUMERIC NOT NULL DEFAULT 0,
    amount_paid NUMERIC NOT NULL DEFAULT 0,
    notes TEXT,
    created_by UUID DEFAULT auth.uid(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    voided_at TIMESTAMPTZ,
    void_reason TEXT,
    UNIQUE (company_id, number)
);
CREATE INDEX idx_purchases_company_date ON purchases (company_id, purchase_date DESC);

CREATE TABLE purchase_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    purchase_id UUID NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
    material_id UUID NOT NULL REFERENCES materials(id) ON DELETE RESTRICT,
    quantity NUMERIC NOT NULL CHECK (quantity > 0),
    unit_cost NUMERIC NOT NULL CHECK (unit_cost >= 0),
    line_total NUMERIC NOT NULL
);
CREATE INDEX idx_purchase_lines_purchase ON purchase_lines (purchase_id);

CREATE TABLE payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    direction TEXT NOT NULL CHECK (direction IN ('in', 'out')),
    invoice_id UUID REFERENCES invoices(id) ON DELETE RESTRICT,
    purchase_id UUID REFERENCES purchases(id) ON DELETE RESTRICT,
    payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
    amount NUMERIC NOT NULL CHECK (amount > 0),
    method TEXT,
    reference TEXT,
    notes TEXT,
    created_by UUID DEFAULT auth.uid(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    voided_at TIMESTAMPTZ,
    CHECK (
        (direction = 'in' AND invoice_id IS NOT NULL AND purchase_id IS NULL)
        OR (direction = 'out' AND purchase_id IS NOT NULL AND invoice_id IS NULL)
    )
);
CREATE INDEX idx_payments_company_date ON payments (company_id, payment_date DESC);
CREATE INDEX idx_payments_invoice ON payments (invoice_id) WHERE invoice_id IS NOT NULL;
CREATE INDEX idx_payments_purchase ON payments (purchase_id) WHERE purchase_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Production
-- ---------------------------------------------------------------------------
CREATE TABLE production_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    number TEXT NOT NULL,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'completed', 'cancelled')),
    planned_date DATE NOT NULL DEFAULT CURRENT_DATE,
    planned_quantity NUMERIC NOT NULL CHECK (planned_quantity > 0),
    produced_quantity NUMERIC CHECK (produced_quantity IS NULL OR produced_quantity >= 0),
    completed_date DATE,
    labor_hours NUMERIC,
    labor_cost NUMERIC,
    standard_labor_hours NUMERIC,
    standard_labor_cost NUMERIC,
    material_cost NUMERIC,
    standard_material_cost NUMERIC,
    standard_unit_cost NUMERIC,
    actual_unit_cost NUMERIC,
    notes TEXT,
    created_by UUID DEFAULT auth.uid(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    cancelled_at TIMESTAMPTZ,
    UNIQUE (company_id, number)
);
CREATE INDEX idx_production_orders_company ON production_orders (company_id, planned_date DESC);

CREATE TABLE production_consumptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    production_order_id UUID NOT NULL REFERENCES production_orders(id) ON DELETE CASCADE,
    material_id UUID NOT NULL REFERENCES materials(id) ON DELETE RESTRICT,
    standard_quantity NUMERIC NOT NULL DEFAULT 0,
    actual_quantity NUMERIC NOT NULL DEFAULT 0,
    standard_price NUMERIC NOT NULL DEFAULT 0, -- material cost_per_unit when completed
    unit_cost NUMERIC NOT NULL DEFAULT 0,      -- material moving average cost when completed
    actual_cost NUMERIC NOT NULL DEFAULT 0
);
CREATE INDEX idx_production_consumptions_order ON production_consumptions (production_order_id);

-- ---------------------------------------------------------------------------
-- Expenses: recurring flag for cash planning
-- ---------------------------------------------------------------------------
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS is_recurring BOOLEAN NOT NULL DEFAULT FALSE;

-- ---------------------------------------------------------------------------
-- Distributor portal: users, invitations, orders
-- ---------------------------------------------------------------------------
CREATE TABLE distributor_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    distributor_id UUID NOT NULL REFERENCES distributors(id) ON DELETE CASCADE,
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, distributor_id)
);
CREATE INDEX idx_distributor_users_user ON distributor_users (user_id);

CREATE TABLE company_invitations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    kind TEXT NOT NULL CHECK (kind IN ('member', 'distributor')),
    role TEXT CHECK (role IN ('admin', 'edit', 'view')),
    distributor_id UUID REFERENCES distributors(id) ON DELETE CASCADE,
    email TEXT,
    token TEXT NOT NULL UNIQUE DEFAULT (replace(gen_random_uuid()::TEXT, '-', '') || replace(gen_random_uuid()::TEXT, '-', '')),
    created_by UUID DEFAULT auth.uid(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '14 days',
    accepted_at TIMESTAMPTZ,
    accepted_by UUID,
    revoked_at TIMESTAMPTZ,
    CHECK (
        (kind = 'member' AND role IS NOT NULL AND distributor_id IS NULL)
        OR (kind = 'distributor' AND distributor_id IS NOT NULL)
    )
);

CREATE TABLE distributor_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    distributor_id UUID NOT NULL REFERENCES distributors(id) ON DELETE CASCADE,
    number TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted', 'invoiced', 'rejected', 'cancelled')),
    requested_date DATE,
    notes TEXT,
    total NUMERIC NOT NULL DEFAULT 0,
    created_by UUID DEFAULT auth.uid(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    reviewed_by UUID,
    reviewed_at TIMESTAMPTZ,
    rejection_reason TEXT,
    invoice_id UUID REFERENCES invoices(id) ON DELETE SET NULL,
    UNIQUE (company_id, number)
);
CREATE INDEX idx_distributor_orders_company ON distributor_orders (company_id, created_at DESC);
CREATE INDEX idx_distributor_orders_distributor ON distributor_orders (distributor_id, created_at DESC);

CREATE TABLE distributor_order_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    order_id UUID NOT NULL REFERENCES distributor_orders(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    quantity NUMERIC NOT NULL CHECK (quantity > 0),
    unit_price NUMERIC NOT NULL CHECK (unit_price >= 0),
    line_total NUMERIC NOT NULL
);
CREATE INDEX idx_distributor_order_lines_order ON distributor_order_lines (order_id);

ALTER TABLE invoices ADD COLUMN distributor_order_id UUID REFERENCES distributor_orders(id) ON DELETE SET NULL;

-- ---------------------------------------------------------------------------
-- Company defaults (settings, channels). Also used by create_company in 0008.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION seed_company_defaults(p_company_id UUID, p_currency TEXT DEFAULT 'DOP')
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO settings (company_id, currency)
    VALUES (p_company_id, COALESCE(NULLIF(trim(p_currency), ''), 'DOP'))
    ON CONFLICT (company_id) DO NOTHING;

    INSERT INTO sales_channels (company_id, name, kind, price_basis, payment_terms_days)
    VALUES
        (p_company_id, 'Venta directa', 'direct', 'retail', 0),
        (p_company_id, 'Distribuidores', 'distributor', 'distributor', 30),
        (p_company_id, 'Tienda online y redes', 'online', 'retail', 0)
    ON CONFLICT (company_id, name) DO NOTHING;
END;
$$;

DO $$
DECLARE
    c RECORD;
BEGIN
    FOR c IN SELECT id FROM companies LOOP
        PERFORM seed_company_defaults(c.id, 'DOP');
    END LOOP;
END $$;

-- Existing products: recompute costs (trigger) and store a list price that reproduces the
-- price the old costing screen showed: full cost x (1 + target markup).
UPDATE products SET updated_at = NOW();
UPDATE products
SET retail_price = round(total_cost * (1 + COALESCE(target_margin, 0)), 2)
WHERE COALESCE(retail_price, 0) = 0 AND total_cost > 0;

-- ---------------------------------------------------------------------------
-- Migrate legacy `sales` rows into invoices + lines
-- ---------------------------------------------------------------------------
-- Map free-text channels to channel records (unknown values become their own channel)
INSERT INTO sales_channels (company_id, name, kind, price_basis)
SELECT DISTINCT s.company_id, trim(s.channel), 'other', 'retail'
FROM sales s
WHERE s.company_id IS NOT NULL
  AND lower(trim(s.channel)) NOT IN (
      'b2b', 'distributor', 'distribuidor', 'distribuidores', 'wholesale', 'mayorista',
      'website', 'web', 'online', 'instagram', 'facebook', 'ecommerce', 'whatsapp',
      'b2c', 'direct', 'directo', 'retail', 'venta directa', ''
  )
ON CONFLICT (company_id, name) DO NOTHING;

CREATE TEMP TABLE _legacy_invoice_map AS
SELECT
    s.company_id,
    COALESCE(NULLIF(trim(s.invoice_number), ''), 'LEG-' || left(s.id::TEXT, 8)) AS number,
    MIN(s.sale_date) AS issue_date,
    (array_agg(s.channel ORDER BY s.created_at))[1] AS channel,
    (array_agg(s.distributor_id ORDER BY s.created_at) FILTER (WHERE s.distributor_id IS NOT NULL))[1] AS distributor_id,
    (array_agg(s.customer_name ORDER BY s.created_at) FILTER (WHERE COALESCE(trim(s.customer_name), '') <> ''))[1] AS customer_name,
    SUM(s.total_revenue) AS total,
    SUM(s.cogs) AS cogs_total,
    bool_and(lower(COALESCE(s.payment_status, 'paid')) = 'paid') AS fully_paid,
    MIN(s.created_at) AS created_at
FROM sales s
WHERE s.company_id IS NOT NULL
GROUP BY s.company_id, COALESCE(NULLIF(trim(s.invoice_number), ''), 'LEG-' || left(s.id::TEXT, 8));

INSERT INTO customers (company_id, name)
SELECT DISTINCT m.company_id, trim(m.customer_name)
FROM _legacy_invoice_map m
WHERE m.distributor_id IS NULL AND COALESCE(trim(m.customer_name), '') <> '';

INSERT INTO invoices (
    company_id, number, issue_date, due_date, channel_id, customer_id, distributor_id, customer_name,
    status, subtotal, discount_total, total, cogs_total, amount_paid, source, created_by, created_at
)
SELECT
    m.company_id,
    m.number,
    m.issue_date,
    m.issue_date + COALESCE((SELECT d.payment_terms_days FROM distributors d WHERE d.id = m.distributor_id), 0),
    ch.id,
    CASE WHEN m.distributor_id IS NULL THEN (
        SELECT c.id FROM customers c
        WHERE c.company_id = m.company_id AND c.name = trim(m.customer_name)
        ORDER BY c.created_at LIMIT 1
    ) END,
    m.distributor_id,
    m.customer_name,
    'issued',
    m.total,
    0,
    m.total,
    m.cogs_total,
    CASE WHEN m.fully_paid THEN m.total ELSE 0 END,
    'legacy',
    NULL,
    COALESCE(m.created_at, NOW())
FROM _legacy_invoice_map m
JOIN LATERAL (
    SELECT sc.id FROM sales_channels sc
    WHERE sc.company_id = m.company_id
      AND sc.name = CASE
          WHEN lower(trim(m.channel)) IN ('b2b', 'distributor', 'distribuidor', 'distribuidores', 'wholesale', 'mayorista') THEN 'Distribuidores'
          WHEN lower(trim(m.channel)) IN ('website', 'web', 'online', 'instagram', 'facebook', 'ecommerce', 'whatsapp') THEN 'Tienda online y redes'
          WHEN lower(trim(m.channel)) IN ('b2c', 'direct', 'directo', 'retail', 'venta directa', '') THEN 'Venta directa'
          ELSE trim(m.channel)
      END
    LIMIT 1
) ch ON TRUE;

INSERT INTO invoice_lines (
    company_id, invoice_id, product_id, description, quantity, list_price, unit_price, discount_pct,
    line_total, unit_cost, standard_unit_cost, cogs, created_at
)
SELECT
    s.company_id,
    i.id,
    s.product_id,
    CASE WHEN s.product_id IS NULL THEN 'Artículo sin producto' END,
    s.quantity,
    s.unit_price,
    s.unit_price,
    0,
    s.total_revenue,
    CASE WHEN s.quantity > 0 THEN s.cogs / s.quantity ELSE 0 END,
    CASE WHEN s.quantity > 0 THEN s.cogs / s.quantity ELSE 0 END,
    s.cogs,
    COALESCE(s.created_at, NOW())
FROM sales s
JOIN invoices i
  ON i.company_id = s.company_id
 AND i.number = COALESCE(NULLIF(trim(s.invoice_number), ''), 'LEG-' || left(s.id::TEXT, 8))
WHERE s.quantity > 0;

INSERT INTO payments (company_id, direction, invoice_id, payment_date, amount, method, notes, created_by)
SELECT i.company_id, 'in', i.id, i.issue_date, i.total, 'Registro anterior', 'Pago migrado del sistema anterior', NULL
FROM invoices i
WHERE i.source = 'legacy' AND i.amount_paid > 0;

DROP TABLE _legacy_invoice_map;

ALTER TABLE sales RENAME TO legacy_sales;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
ALTER TABLE document_sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE material_cost_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_price_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE production_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE production_consumptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE distributor_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE distributor_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE distributor_order_lines ENABLE ROW LEVEL SECURITY;

-- Every company member can read these; writes happen only through RPCs
DO $$
DECLARE
    t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY[
        'document_sequences', 'material_cost_history', 'product_price_history', 'invoices', 'invoice_lines',
        'purchases', 'purchase_lines', 'payments', 'production_orders', 'production_consumptions',
        'distributor_orders', 'distributor_order_lines'
    ] LOOP
        EXECUTE format(
            'CREATE POLICY "Company members read %1$s" ON %1$I FOR SELECT USING (company_id = get_auth_company_id())',
            t
        );
        EXECUTE format('REVOKE INSERT, UPDATE, DELETE ON %I FROM authenticated', t);
    END LOOP;
END $$;

-- Master data the business edits directly (admins and editors)
DO $$
DECLARE
    t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY['sales_channels', 'customers', 'suppliers'] LOOP
        EXECUTE format('CREATE POLICY "Company members read %1$s" ON %1$I FOR SELECT USING (company_id = get_auth_company_id())', t);
        EXECUTE format('CREATE POLICY "Editors insert %1$s" ON %1$I FOR INSERT WITH CHECK (company_id = get_auth_company_id() AND get_auth_role() IN (''admin'', ''edit''))', t);
        EXECUTE format('CREATE POLICY "Editors update %1$s" ON %1$I FOR UPDATE USING (company_id = get_auth_company_id() AND get_auth_role() IN (''admin'', ''edit'')) WITH CHECK (company_id = get_auth_company_id())', t);
        EXECUTE format('CREATE POLICY "Editors delete %1$s" ON %1$I FOR DELETE USING (company_id = get_auth_company_id() AND get_auth_role() IN (''admin'', ''edit''))', t);
    END LOOP;
END $$;

-- Invitations are visible to admins and editors of the company
CREATE POLICY "Editors read invitations" ON company_invitations
FOR SELECT USING (company_id = get_auth_company_id() AND get_auth_role() IN ('admin', 'edit'));
REVOKE INSERT, UPDATE, DELETE ON company_invitations FROM authenticated;

-- Portal access links: visible to the company and to the linked user
CREATE POLICY "Company or linked user read distributor_users" ON distributor_users
FOR SELECT USING (company_id = get_auth_company_id() OR user_id = auth.uid());
REVOKE INSERT, UPDATE, DELETE ON distributor_users FROM authenticated;

-- The inventory ledger is append-only and written by RPCs
DROP POLICY IF EXISTS "Company isolation inv insert" ON inventory_transactions;
DROP POLICY IF EXISTS "Company isolation inv update" ON inventory_transactions;
DROP POLICY IF EXISTS "Company isolation inv delete" ON inventory_transactions;
REVOKE INSERT, UPDATE, DELETE ON inventory_transactions FROM authenticated;

-- Legacy sales stay readable for audit, but are no longer written
DROP POLICY IF EXISTS "Company isolation sales insert" ON legacy_sales;
DROP POLICY IF EXISTS "Company isolation sales update" ON legacy_sales;
DROP POLICY IF EXISTS "Company isolation sales delete" ON legacy_sales;
REVOKE INSERT, UPDATE, DELETE ON legacy_sales FROM authenticated;

-- Stock balances and derived costs cannot be edited directly
REVOKE UPDATE ON materials FROM authenticated;
GRANT UPDATE (
    name, category, supplier, supplier_id, unit_of_measure, cost_per_unit, reorder_point, notes,
    lead_time_days, is_active, updated_at
) ON materials TO authenticated;

REVOKE UPDATE ON products FROM authenticated;
GRANT UPDATE (
    sku, name, category, description, batch_size, production_time_hours, target_margin,
    retail_price, distributor_price, promotional_price, is_active, updated_at
) ON products TO authenticated;

REVOKE UPDATE ON distributors FROM authenticated;
GRANT UPDATE (
    name, contact_name, email, phone, pricing_tier, margin_override, territory_notes,
    payment_terms_days, credit_limit, tax_id, address, is_active
) ON distributors TO authenticated;

-- Settings are changed by admins only
DROP POLICY IF EXISTS "Company isolation settings insert" ON settings;
DROP POLICY IF EXISTS "Company isolation settings update" ON settings;
DROP POLICY IF EXISTS "Company isolation settings delete" ON settings;
CREATE POLICY "Admins update settings" ON settings
FOR UPDATE USING (company_id = get_auth_company_id() AND get_auth_role() = 'admin')
WITH CHECK (company_id = get_auth_company_id());
REVOKE INSERT, DELETE ON settings FROM authenticated;

-- Internal helpers are never called directly by clients
REVOKE EXECUTE ON FUNCTION next_document_number(UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION seed_company_defaults(UUID, TEXT) FROM PUBLIC, anon, authenticated;
