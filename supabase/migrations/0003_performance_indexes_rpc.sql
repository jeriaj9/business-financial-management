-- 1. Fix RLS N+1 Performance Issue
-- Changing from VOLATILE to STABLE allows Postgres to cache the result per-query instead of per-row.
CREATE OR REPLACE FUNCTION get_auth_company_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT company_id FROM user_profiles WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION get_auth_role()
RETURNS VARCHAR
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM user_profiles WHERE id = auth.uid();
$$;

-- 2. Create Multi-Tenant Indexes
-- Essential for avoiding full table scans when querying by company_id.
CREATE INDEX IF NOT EXISTS idx_user_profiles_company ON user_profiles(company_id);
CREATE INDEX IF NOT EXISTS idx_materials_company ON materials(company_id);
CREATE INDEX IF NOT EXISTS idx_products_company ON products(company_id);
CREATE INDEX IF NOT EXISTS idx_bom_items_company ON bom_items(company_id);
CREATE INDEX IF NOT EXISTS idx_distributors_company ON distributors(company_id);

-- Composite indexes for heavily sorted views
CREATE INDEX IF NOT EXISTS idx_sales_company_date ON sales(company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_expenses_company_date ON expenses(company_id, expense_date DESC);
CREATE INDEX IF NOT EXISTS idx_inv_tx_company_date ON inventory_transactions(company_id, created_at DESC);

-- 3. Create Atomic RPCs for Sales to eliminate Client-Side N+1 network requests
CREATE OR REPLACE FUNCTION process_sale(p_sales JSONB, p_transactions JSONB)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    tx_item JSONB;
BEGIN
    -- Insert Sales
    INSERT INTO sales (company_id, invoice_number, customer_name, distributor_id, channel, product_id, quantity, unit_price, total_revenue, gross_profit, sale_date)
    SELECT 
        (elem->>'company_id')::UUID,
        elem->>'invoice_number',
        elem->>'customer_name',
        NULLIF(elem->>'distributor_id', '')::UUID,
        elem->>'channel',
        NULLIF(elem->>'product_id', '')::UUID,
        (elem->>'quantity')::NUMERIC,
        (elem->>'unit_price')::NUMERIC,
        (elem->>'total_revenue')::NUMERIC,
        (elem->>'gross_profit')::NUMERIC,
        (elem->>'sale_date')::TIMESTAMP WITH TIME ZONE
    FROM jsonb_array_elements(p_sales) AS elem;

    -- Insert Transactions
    INSERT INTO inventory_transactions (company_id, item_type, item_id, transaction_type, quantity, reference_id, notes)
    SELECT 
        (elem->>'company_id')::UUID,
        elem->>'item_type',
        (elem->>'item_id')::UUID,
        elem->>'transaction_type',
        (elem->>'quantity')::NUMERIC,
        NULLIF(elem->>'reference_id', '')::UUID,
        elem->>'notes'
    FROM jsonb_array_elements(p_transactions) AS elem;

    -- Update Products Inventory (Atomically)
    FOR tx_item IN SELECT * FROM jsonb_array_elements(p_transactions)
    LOOP
        IF tx_item->>'transaction_type' = 'OUT' THEN
            UPDATE products 
            SET current_stock = current_stock - (tx_item->>'quantity')::NUMERIC
            WHERE id = (tx_item->>'item_id')::UUID;
        ELSIF tx_item->>'transaction_type' = 'IN' THEN
            UPDATE products 
            SET current_stock = current_stock + (tx_item->>'quantity')::NUMERIC
            WHERE id = (tx_item->>'item_id')::UUID;
        END IF;
    END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION reverse_sale(p_invoice_number TEXT, p_company_id UUID, p_transactions JSONB)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    tx_item JSONB;
BEGIN
    -- Delete the Sales
    DELETE FROM sales WHERE invoice_number = p_invoice_number AND company_id = p_company_id;

    -- Insert reversal Transactions
    INSERT INTO inventory_transactions (company_id, item_type, item_id, transaction_type, quantity, reference_id, notes)
    SELECT 
        (elem->>'company_id')::UUID,
        elem->>'item_type',
        (elem->>'item_id')::UUID,
        elem->>'transaction_type',
        (elem->>'quantity')::NUMERIC,
        NULLIF(elem->>'reference_id', '')::UUID,
        elem->>'notes'
    FROM jsonb_array_elements(p_transactions) AS elem;

    -- Revert Products Inventory
    FOR tx_item IN SELECT * FROM jsonb_array_elements(p_transactions)
    LOOP
        IF tx_item->>'transaction_type' = 'IN' THEN
            UPDATE products 
            SET current_stock = current_stock + (tx_item->>'quantity')::NUMERIC
            WHERE id = (tx_item->>'item_id')::UUID;
        END IF;
    END LOOP;
END;
$$;
