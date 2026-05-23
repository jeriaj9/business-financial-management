-- Arelum ERP Initial Database Schema

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. SETTINGS
CREATE TABLE settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    labor_cost_per_hour NUMERIC NOT NULL DEFAULT 100,
    distributor_margin NUMERIC NOT NULL DEFAULT 0.20,
    promotional_discount NUMERIC NOT NULL DEFAULT 0.20,
    indirect_cost_reserve NUMERIC NOT NULL DEFAULT 0.10,
    currency VARCHAR(10) NOT NULL DEFAULT 'DOP',
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insert default settings row
INSERT INTO settings (labor_cost_per_hour, distributor_margin, promotional_discount, indirect_cost_reserve, currency)
VALUES (100, 0.20, 0.20, 0.10, 'DOP');

-- 2. RAW MATERIALS
CREATE TABLE materials (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    category VARCHAR(100) NOT NULL, -- e.g., 'Wax', 'Fragrance', 'Packaging'
    supplier VARCHAR(255),
    unit_of_measure VARCHAR(50) NOT NULL,
    cost_per_unit NUMERIC NOT NULL DEFAULT 0,
    current_stock NUMERIC NOT NULL DEFAULT 0,
    reorder_point NUMERIC DEFAULT 0,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. PRODUCTS (Finished Goods)
CREATE TABLE products (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sku VARCHAR(100) UNIQUE,
    name VARCHAR(255) NOT NULL,
    category VARCHAR(100),
    description TEXT,
    batch_size NUMERIC NOT NULL DEFAULT 1,
    production_time_hours NUMERIC NOT NULL DEFAULT 0,
    -- Costing fields (updated automatically via trigger/function or application logic)
    calculated_material_cost NUMERIC NOT NULL DEFAULT 0,
    calculated_labor_cost NUMERIC NOT NULL DEFAULT 0,
    calculated_indirect_cost NUMERIC NOT NULL DEFAULT 0,
    total_cost NUMERIC NOT NULL DEFAULT 0,
    -- Target margin for this specific product (can default to a global setting but overrides per product)
    target_margin NUMERIC NOT NULL DEFAULT 0.50, 
    retail_price NUMERIC NOT NULL DEFAULT 0,
    distributor_price NUMERIC NOT NULL DEFAULT 0,
    promotional_price NUMERIC NOT NULL DEFAULT 0,
    current_stock NUMERIC NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. BILL OF MATERIALS (BOM)
CREATE TABLE bom_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id UUID REFERENCES products(id) ON DELETE CASCADE,
    material_id UUID REFERENCES materials(id) ON DELETE RESTRICT,
    quantity NUMERIC NOT NULL,
    is_optional BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 5. DISTRIBUTORS
CREATE TABLE distributors (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    contact_name VARCHAR(255),
    email VARCHAR(255),
    phone VARCHAR(50),
    pricing_tier VARCHAR(50) DEFAULT 'Standard',
    margin_override NUMERIC, -- If a specific distributor has a different margin
    outstanding_balance NUMERIC DEFAULT 0,
    territory_notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 6. SALES
CREATE TABLE sales (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    invoice_number VARCHAR(100),
    sale_date DATE NOT NULL DEFAULT CURRENT_DATE,
    channel VARCHAR(100) NOT NULL, -- 'Direct', 'Website', 'Distributor', 'Instagram'
    customer_name VARCHAR(255),
    distributor_id UUID REFERENCES distributors(id) ON DELETE SET NULL,
    product_id UUID REFERENCES products(id) ON DELETE RESTRICT,
    quantity NUMERIC NOT NULL,
    unit_price NUMERIC NOT NULL,
    discount NUMERIC DEFAULT 0,
    total_revenue NUMERIC NOT NULL,
    cogs NUMERIC NOT NULL, -- Cost of goods sold at the time of sale
    gross_profit NUMERIC NOT NULL,
    payment_status VARCHAR(50) DEFAULT 'Paid',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 7. EXPENSES
CREATE TABLE expenses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
    category VARCHAR(100) NOT NULL, -- 'Advertising', 'Utilities', 'Software'
    description TEXT,
    vendor VARCHAR(255),
    amount NUMERIC NOT NULL,
    payment_method VARCHAR(100),
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 8. INVENTORY TRANSACTIONS (Audit Trail for Materials and Products)
CREATE TABLE inventory_transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    item_type VARCHAR(50) NOT NULL, -- 'MATERIAL' or 'PRODUCT'
    item_id UUID NOT NULL,
    transaction_type VARCHAR(50) NOT NULL, -- 'IN', 'OUT', 'PRODUCTION_USAGE', 'WASTE'
    quantity NUMERIC NOT NULL,
    reference_id UUID, -- E.g., a sale_id or a production_batch_id
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
