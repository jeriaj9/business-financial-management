-- Fix: Add missing 'cogs' column to process_sale RPC

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
    INSERT INTO sales (company_id, invoice_number, customer_name, distributor_id, channel, product_id, quantity, unit_price, total_revenue, cogs, gross_profit, payment_status, sale_date)
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
        (elem->>'cogs')::NUMERIC,
        (elem->>'gross_profit')::NUMERIC,
        elem->>'payment_status',
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
