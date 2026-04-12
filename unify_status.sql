-- 1. Migrate existing data FIRST so we don't violate the new logic
UPDATE website_orders SET status = 'processing' WHERE status IN ('confirmed', 'pending');
UPDATE website_orders SET status = 'sent' WHERE status = 'shipped';

-- 2. Update Column Default
ALTER TABLE website_orders ALTER COLUMN status SET DEFAULT 'processing';

-- 3. Now apply the strict rules (Constraint)
ALTER TABLE website_orders DROP CONSTRAINT IF EXISTS website_orders_status_check;
ALTER TABLE website_orders ADD CONSTRAINT website_orders_status_check 
CHECK (status IN ('processing', 'sent', 'delivered', 'returned', 'cancelled'));
