-- 1. Create Core Multi-Tenant Tables
CREATE TABLE companies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE user_profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
    role VARCHAR(50) DEFAULT 'view', -- 'admin', 'edit', 'view'
    full_name VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Add company_id to existing tables
ALTER TABLE settings ADD COLUMN company_id UUID REFERENCES companies(id) ON DELETE CASCADE;
ALTER TABLE materials ADD COLUMN company_id UUID REFERENCES companies(id) ON DELETE CASCADE;
ALTER TABLE products ADD COLUMN company_id UUID REFERENCES companies(id) ON DELETE CASCADE;
ALTER TABLE bom_items ADD COLUMN company_id UUID REFERENCES companies(id) ON DELETE CASCADE;
ALTER TABLE distributors ADD COLUMN company_id UUID REFERENCES companies(id) ON DELETE CASCADE;
ALTER TABLE sales ADD COLUMN company_id UUID REFERENCES companies(id) ON DELETE CASCADE;
ALTER TABLE expenses ADD COLUMN company_id UUID REFERENCES companies(id) ON DELETE CASCADE;
ALTER TABLE inventory_transactions ADD COLUMN company_id UUID REFERENCES companies(id) ON DELETE CASCADE;

-- 3. Migrate existing data to a Default Company
DO $$
DECLARE
    default_company_id UUID;
BEGIN
    -- Only run this if there is actually data to migrate
    IF EXISTS (SELECT 1 FROM settings) OR EXISTS (SELECT 1 FROM products) THEN
        INSERT INTO companies (name) VALUES ('My Default Company') RETURNING id INTO default_company_id;
        
        UPDATE settings SET company_id = default_company_id;
        UPDATE materials SET company_id = default_company_id;
        UPDATE products SET company_id = default_company_id;
        UPDATE bom_items SET company_id = default_company_id;
        UPDATE distributors SET company_id = default_company_id;
        UPDATE sales SET company_id = default_company_id;
        UPDATE expenses SET company_id = default_company_id;
        UPDATE inventory_transactions SET company_id = default_company_id;
    END IF;
END $$;

-- 4. Create Helper Function for RLS
CREATE OR REPLACE FUNCTION get_auth_company_id()
RETURNS UUID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT company_id FROM user_profiles WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION get_auth_role()
RETURNS VARCHAR
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM user_profiles WHERE id = auth.uid();
$$;

-- 5. Enable Row Level Security (RLS)
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE bom_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE distributors ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_transactions ENABLE ROW LEVEL SECURITY;

-- 6. Define RLS Policies

-- Companies: Users can read their own company, and anyone can create one during registration
CREATE POLICY "Users can view their own company" ON companies FOR SELECT USING (id = get_auth_company_id());
CREATE POLICY "Anyone can create a company" ON companies FOR INSERT WITH CHECK (true);
CREATE POLICY "Admins can update company" ON companies FOR UPDATE USING (id = get_auth_company_id() AND get_auth_role() = 'admin');

-- User Profiles: Users can view profiles in their company, can insert their own profile
CREATE POLICY "Users can view company profiles" ON user_profiles FOR SELECT USING (company_id = get_auth_company_id() OR id = auth.uid());
CREATE POLICY "Users can insert their own profile" ON user_profiles FOR INSERT WITH CHECK (id = auth.uid());
CREATE POLICY "Admins can update roles" ON user_profiles FOR UPDATE USING (company_id = get_auth_company_id() AND get_auth_role() = 'admin');

-- Generic Policies for all other tables (Isolation per company)
-- We grant SELECT to all roles in the company.
-- We grant INSERT/UPDATE/DELETE to 'admin' and 'edit' roles.

-- Settings
CREATE POLICY "Company isolation settings select" ON settings FOR SELECT USING (company_id = get_auth_company_id());
CREATE POLICY "Company isolation settings insert" ON settings FOR INSERT WITH CHECK (company_id = get_auth_company_id() AND get_auth_role() IN ('admin', 'edit'));
CREATE POLICY "Company isolation settings update" ON settings FOR UPDATE USING (company_id = get_auth_company_id() AND get_auth_role() IN ('admin', 'edit'));
CREATE POLICY "Company isolation settings delete" ON settings FOR DELETE USING (company_id = get_auth_company_id() AND get_auth_role() IN ('admin', 'edit'));

-- Materials
CREATE POLICY "Company isolation materials select" ON materials FOR SELECT USING (company_id = get_auth_company_id());
CREATE POLICY "Company isolation materials insert" ON materials FOR INSERT WITH CHECK (company_id = get_auth_company_id() AND get_auth_role() IN ('admin', 'edit'));
CREATE POLICY "Company isolation materials update" ON materials FOR UPDATE USING (company_id = get_auth_company_id() AND get_auth_role() IN ('admin', 'edit'));
CREATE POLICY "Company isolation materials delete" ON materials FOR DELETE USING (company_id = get_auth_company_id() AND get_auth_role() IN ('admin', 'edit'));

-- Products
CREATE POLICY "Company isolation products select" ON products FOR SELECT USING (company_id = get_auth_company_id());
CREATE POLICY "Company isolation products insert" ON products FOR INSERT WITH CHECK (company_id = get_auth_company_id() AND get_auth_role() IN ('admin', 'edit'));
CREATE POLICY "Company isolation products update" ON products FOR UPDATE USING (company_id = get_auth_company_id() AND get_auth_role() IN ('admin', 'edit'));
CREATE POLICY "Company isolation products delete" ON products FOR DELETE USING (company_id = get_auth_company_id() AND get_auth_role() IN ('admin', 'edit'));

-- BOM Items
CREATE POLICY "Company isolation bom select" ON bom_items FOR SELECT USING (company_id = get_auth_company_id());
CREATE POLICY "Company isolation bom insert" ON bom_items FOR INSERT WITH CHECK (company_id = get_auth_company_id() AND get_auth_role() IN ('admin', 'edit'));
CREATE POLICY "Company isolation bom update" ON bom_items FOR UPDATE USING (company_id = get_auth_company_id() AND get_auth_role() IN ('admin', 'edit'));
CREATE POLICY "Company isolation bom delete" ON bom_items FOR DELETE USING (company_id = get_auth_company_id() AND get_auth_role() IN ('admin', 'edit'));

-- Distributors
CREATE POLICY "Company isolation dist select" ON distributors FOR SELECT USING (company_id = get_auth_company_id());
CREATE POLICY "Company isolation dist insert" ON distributors FOR INSERT WITH CHECK (company_id = get_auth_company_id() AND get_auth_role() IN ('admin', 'edit'));
CREATE POLICY "Company isolation dist update" ON distributors FOR UPDATE USING (company_id = get_auth_company_id() AND get_auth_role() IN ('admin', 'edit'));
CREATE POLICY "Company isolation dist delete" ON distributors FOR DELETE USING (company_id = get_auth_company_id() AND get_auth_role() IN ('admin', 'edit'));

-- Sales
CREATE POLICY "Company isolation sales select" ON sales FOR SELECT USING (company_id = get_auth_company_id());
CREATE POLICY "Company isolation sales insert" ON sales FOR INSERT WITH CHECK (company_id = get_auth_company_id() AND get_auth_role() IN ('admin', 'edit'));
CREATE POLICY "Company isolation sales update" ON sales FOR UPDATE USING (company_id = get_auth_company_id() AND get_auth_role() IN ('admin', 'edit'));
CREATE POLICY "Company isolation sales delete" ON sales FOR DELETE USING (company_id = get_auth_company_id() AND get_auth_role() IN ('admin', 'edit'));

-- Expenses
CREATE POLICY "Company isolation expenses select" ON expenses FOR SELECT USING (company_id = get_auth_company_id());
CREATE POLICY "Company isolation expenses insert" ON expenses FOR INSERT WITH CHECK (company_id = get_auth_company_id() AND get_auth_role() IN ('admin', 'edit'));
CREATE POLICY "Company isolation expenses update" ON expenses FOR UPDATE USING (company_id = get_auth_company_id() AND get_auth_role() IN ('admin', 'edit'));
CREATE POLICY "Company isolation expenses delete" ON expenses FOR DELETE USING (company_id = get_auth_company_id() AND get_auth_role() IN ('admin', 'edit'));

-- Inventory Transactions
CREATE POLICY "Company isolation inv select" ON inventory_transactions FOR SELECT USING (company_id = get_auth_company_id());
CREATE POLICY "Company isolation inv insert" ON inventory_transactions FOR INSERT WITH CHECK (company_id = get_auth_company_id() AND get_auth_role() IN ('admin', 'edit'));
CREATE POLICY "Company isolation inv update" ON inventory_transactions FOR UPDATE USING (company_id = get_auth_company_id() AND get_auth_role() IN ('admin', 'edit'));
CREATE POLICY "Company isolation inv delete" ON inventory_transactions FOR DELETE USING (company_id = get_auth_company_id() AND get_auth_role() IN ('admin', 'edit'));
