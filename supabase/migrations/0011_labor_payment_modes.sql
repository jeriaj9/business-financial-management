-- 0011: How each business pays production labor
--
-- Replaces the on/off "labor is variable" flag with three payment modes:
--   salary - fixed payroll recorded in Expenses. Labor (hours x hourly rate) feeds the price
--            but not the cost of goods sold, so it is not counted twice.
--   hourly - paid per hour worked on production. Hours x hourly rate is part of the cost of
--            goods sold; actual hours come from each production order.
--   piece  - paid per unit produced at a rate set on each product. The piece rate is part of
--            the cost of goods sold.
-- A business with a base salary plus a per-piece bonus uses "piece" for the bonus and records
-- the base salary in Expenses.

ALTER TABLE settings
  ADD COLUMN labor_payment_mode TEXT NOT NULL DEFAULT 'salary'
  CHECK (labor_payment_mode IN ('salary', 'hourly', 'piece'));

UPDATE settings SET labor_payment_mode = CASE WHEN labor_is_variable THEN 'hourly' ELSE 'salary' END;

-- Piece rate per unit. Start from today's per-unit labor so switching to "piece" keeps the
-- current numbers until the business enters its real rates.
ALTER TABLE products
  ADD COLUMN labor_cost_per_piece NUMERIC NOT NULL DEFAULT 0 CHECK (labor_cost_per_piece >= 0);

UPDATE products SET labor_cost_per_piece = round(calculated_labor_cost, 2);

GRANT UPDATE (labor_cost_per_piece) ON products TO authenticated;

-- Remember, per production order, whether labor was part of its unit cost when completed
ALTER TABLE production_orders ADD COLUMN labor_in_unit_cost BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE production_orders o
SET labor_in_unit_cost = s.labor_is_variable
FROM settings s
WHERE s.company_id = o.company_id AND o.status = 'completed';

-- ---------------------------------------------------------------------------
-- Product cost derivation
-- ---------------------------------------------------------------------------
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
    v_mode TEXT;
BEGIN
    SELECT COALESCE(SUM(b.quantity * m.cost_per_unit), 0)
    INTO v_batch_material
    FROM bom_items b
    JOIN materials m ON m.id = b.material_id
    WHERE b.product_id = NEW.id;

    SELECT labor_cost_per_hour, indirect_cost_reserve, labor_payment_mode
    INTO v_rate, v_reserve, v_mode
    FROM settings
    WHERE company_id = NEW.company_id;

    NEW.calculated_material_cost := CASE WHEN v_batch > 0 THEN v_batch_material / v_batch ELSE 0 END;

    IF v_mode = 'piece' THEN
        NEW.calculated_labor_cost := COALESCE(NEW.labor_cost_per_piece, 0);
    ELSIF v_batch > 0 THEN
        NEW.calculated_labor_cost := COALESCE(NEW.production_time_hours, 0) * COALESCE(v_rate, 0) / v_batch;
    ELSE
        NEW.calculated_labor_cost := 0;
    END IF;

    NEW.calculated_indirect_cost := (NEW.calculated_material_cost + NEW.calculated_labor_cost) * COALESCE(v_reserve, 0);
    NEW.total_cost := NEW.calculated_material_cost + NEW.calculated_labor_cost + NEW.calculated_indirect_cost;
    NEW.variable_unit_cost := NEW.calculated_material_cost
        + CASE WHEN v_mode IN ('hourly', 'piece') THEN NEW.calculated_labor_cost ELSE 0 END;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION trg_settings_touch_products()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NEW.labor_cost_per_hour IS DISTINCT FROM OLD.labor_cost_per_hour
       OR NEW.indirect_cost_reserve IS DISTINCT FROM OLD.indirect_cost_reserve
       OR NEW.labor_payment_mode IS DISTINCT FROM OLD.labor_payment_mode THEN
        UPDATE products SET updated_at = NOW() WHERE company_id = NEW.company_id;
    END IF;
    RETURN NULL;
END;
$$;

-- ---------------------------------------------------------------------------
-- save_product: accepts labor_cost_per_piece
-- ---------------------------------------------------------------------------
-- p_data: {name, sku, category, description, batch_size, production_time_hours, labor_cost_per_piece,
--          retail_price, distributor_price (null = automatic), is_active, opening_stock (new products only)}
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
    IF COALESCE((p_data ->> 'labor_cost_per_piece')::NUMERIC, 0) < 0 THEN
        RAISE EXCEPTION 'El pago por pieza no puede ser negativo';
    END IF;

    IF v_id IS NULL THEN
        INSERT INTO products (company_id, name, sku, category, description, batch_size, production_time_hours,
                              labor_cost_per_piece, retail_price, distributor_price, is_active, current_stock)
        VALUES (
            v_company,
            trim(p_data ->> 'name'),
            NULLIF(trim(p_data ->> 'sku'), ''),
            NULLIF(trim(p_data ->> 'category'), ''),
            NULLIF(trim(p_data ->> 'description'), ''),
            COALESCE((p_data ->> 'batch_size')::NUMERIC, 1),
            COALESCE((p_data ->> 'production_time_hours')::NUMERIC, 0),
            COALESCE((p_data ->> 'labor_cost_per_piece')::NUMERIC, 0),
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
            labor_cost_per_piece = COALESCE((p_data ->> 'labor_cost_per_piece')::NUMERIC, labor_cost_per_piece),
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

-- ---------------------------------------------------------------------------
-- complete_production_order: labor according to the payment mode
-- ---------------------------------------------------------------------------
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
    v_standard_labor_cost NUMERIC;
    v_labor_in_unit_cost BOOLEAN;
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

    IF v_settings.labor_payment_mode = 'piece' THEN
        -- Paid per unit produced: what you pay is the piece rate times the good units
        v_labor_cost := p_produced_quantity * COALESCE(v_product.labor_cost_per_piece, 0);
        v_standard_labor_cost := v_labor_cost;
    ELSE
        v_labor_cost := v_hours * COALESCE(v_settings.labor_cost_per_hour, 0);
        v_standard_labor_cost := v_std_hours * COALESCE(v_settings.labor_cost_per_hour, 0);
    END IF;
    v_labor_in_unit_cost := v_settings.labor_payment_mode IN ('hourly', 'piece');

    v_unit_cost := (v_material_cost + CASE WHEN v_labor_in_unit_cost THEN v_labor_cost ELSE 0 END) / p_produced_quantity;

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
        standard_labor_cost = v_standard_labor_cost,
        labor_in_unit_cost = v_labor_in_unit_cost,
        material_cost = v_material_cost,
        standard_material_cost = v_standard_material_cost,
        standard_unit_cost = v_product.variable_unit_cost,
        actual_unit_cost = v_unit_cost,
        notes = COALESCE(NULLIF(trim(p_notes), ''), notes)
    WHERE id = v_order.id;
END;
$$;

-- The old flag is fully replaced by labor_payment_mode
ALTER TABLE settings DROP COLUMN labor_is_variable;

-- Recompute every product with the new rules (no change for "salary"/"hourly")
UPDATE products SET updated_at = NOW();
