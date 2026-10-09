-- 0006: Security hardening for multi-tenancy
--
-- Closes three holes found in the original schema:
--   1. Any signed-up user could insert a user_profile pointing at ANY company with role 'admin'.
--   2. Anyone (even anonymous) could create companies directly.
--   3. process_sale / reverse_sale were SECURITY DEFINER, trusted the company_id sent by the
--      browser and were executable by anon, so they bypassed RLS across tenants.
-- Company creation and joining now happen only through RPCs defined in 0008.

-- 1. Profiles can no longer be self-inserted from the client
DROP POLICY IF EXISTS "Users can insert their own profile" ON user_profiles;

-- 2. Companies can no longer be created directly from the client
DROP POLICY IF EXISTS "Anyone can create a company" ON companies;

-- 3. Lock down the legacy sales RPCs until they are replaced (dropped in 0008)
REVOKE EXECUTE ON FUNCTION process_sale(JSONB, JSONB) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION reverse_sale(TEXT, UUID, JSONB) FROM PUBLIC, anon, authenticated;

-- 4. Valid roles only
UPDATE user_profiles SET role = 'view' WHERE role IS NULL OR role NOT IN ('admin', 'edit', 'view');
ALTER TABLE user_profiles ALTER COLUMN role SET NOT NULL;
ALTER TABLE user_profiles ADD CONSTRAINT user_profiles_role_check CHECK (role IN ('admin', 'edit', 'view'));

-- 5. One settings row per company (keep the most recently updated one)
DELETE FROM settings s
USING settings newer
WHERE s.company_id = newer.company_id
  AND s.company_id IS NOT NULL
  AND (COALESCE(newer.updated_at, 'epoch'), newer.id) > (COALESCE(s.updated_at, 'epoch'), s.id);
ALTER TABLE settings ADD CONSTRAINT settings_company_id_key UNIQUE (company_id);

-- 6. SKUs are unique per company, not globally (and empty SKUs are allowed many times)
ALTER TABLE products DROP CONSTRAINT IF EXISTS products_sku_key;
UPDATE products SET sku = NULL WHERE trim(sku) = '';
CREATE UNIQUE INDEX IF NOT EXISTS products_company_sku_key ON products (company_id, sku) WHERE sku IS NOT NULL;

-- 7. Anonymous visitors never read or write tenant tables directly
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon;
