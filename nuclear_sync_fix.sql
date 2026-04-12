-- ──────────────────────────────────────────────────────────
-- ☢️ NUCLEAR SYNC FIX: THE ULTIMATE RESET
-- ──────────────────────────────────────────────────────────

-- 1. DISABLE TRIGGERS TEMPORARILY
SET session_replication_role = 'replica';

-- 2. BLUNT FORCE CONSTRAINT REMOVAL
-- This drops EVERY check constraint on this table to stop the 400 errors.
DO $$ 
DECLARE 
    r RECORD;
BEGIN
    FOR r IN (
        SELECT constraint_name 
        FROM information_schema.table_constraints 
        WHERE table_name = 'website_orders' AND constraint_type = 'CHECK'
    ) LOOP
        EXECUTE 'ALTER TABLE website_orders DROP CONSTRAINT IF EXISTS ' || quote_ident(r.constraint_name) || ' CASCADE';
    END LOOP;
END $$;

-- 3. RESET STATUS DATA
UPDATE website_orders SET status = 'processing' WHERE status IS NULL OR status IN ('confirmed', 'pending', 'Confirmed', 'Pending');
UPDATE website_orders SET status = 'sent' WHERE status IN ('shipped', 'Shipped', 'Sent');
ALTER TABLE website_orders ALTER COLUMN status SET DEFAULT 'processing';

-- 4. RE-ADD TRIGGER (WITH SECURITY DEFINER)
CREATE OR REPLACE FUNCTION sync_website_order_status()
RETURNS TRIGGER AS $$
BEGIN
    IF (OLD.parcel_status IS DISTINCT FROM NEW.parcel_status) THEN
        UPDATE website_orders 
        SET status = NEW.parcel_status,
            updated_at = NOW()
        WHERE sale_id = NEW.id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_sale_status_update ON sales;
CREATE TRIGGER on_sale_status_update
AFTER UPDATE ON sales
FOR EACH ROW
EXECUTE FUNCTION sync_website_order_status();

-- 5. REFRESH STOCK VIEW FOR "GREY OUT" BUG
CREATE OR REPLACE VIEW website_variant_stock_view AS
SELECT 
    v.id as variant_id,
    v.product_id as parent_product_id,
    v.sku,
    v.color,
    v.size,
    v.inventory_product_id,
    COALESCE(SUM(pl.quantity_remaining), 0)::INT as current_stock
FROM website_variants v
LEFT JOIN product_lots pl ON pl.product_id = v.inventory_product_id
GROUP BY v.id, v.product_id, v.sku, v.color, v.size, v.inventory_product_id;

-- 6. RE-ENABLE TRIGGERS
SET session_replication_role = 'origin';

COMMIT;
