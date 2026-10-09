-- 0010: Stored balances so receivables/payables can be filtered directly in queries
ALTER TABLE invoices ADD COLUMN balance NUMERIC GENERATED ALWAYS AS (total - amount_paid) STORED;
ALTER TABLE purchases ADD COLUMN balance NUMERIC GENERATED ALWAYS AS (total - amount_paid) STORED;

CREATE INDEX idx_invoices_open ON invoices (company_id, due_date) WHERE status = 'issued' AND balance > 0.009;
CREATE INDEX idx_purchases_open ON purchases (company_id, due_date) WHERE status = 'received' AND balance > 0.009;
