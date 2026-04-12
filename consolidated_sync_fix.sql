-- ──────────────────────────────────────────────────────────
-- 🏆 THE SUPER-CLEAN SYNC FIX (DRIVE-BY CLEANUP)
-- ──────────────────────────────────────────────────────────

-- 1. DROP ALL OLD CONSTRAINTS (Clearing the "Rules Conflict")
DO $$ 
DECLARE 
    r RECORD;
BEGIN
    FOR r IN (
        SELECT constraint_name 
        FROM information_schema.constraint_column_usage 
        WHERE table_name = 'website_orders' AND column_name = 'status'
    ) LOOP
        EXECUTE 'ALTER TABLE website_orders DROP CONSTRAINT IF EXISTS ' || quote_ident(r.constraint_name);
    END LOOP;
END $$;

-- 2. RESET DATA & RULES
-- Ensure everything is lowercase and matching the new standard
UPDATE website_orders SET status = 'processing' WHERE status IN ('confirmed', 'pending', 'Confirmed', 'Pending');
UPDATE website_orders SET status = 'sent' WHERE status IN ('shipped', 'Shipped', 'Sent');

-- Add the single, master rule
ALTER TABLE website_orders ADD CONSTRAINT website_orders_status_check 
CHECK (status IN ('processing', 'sent', 'delivered', 'returned', 'cancelled'));

-- Set default to 'processing'
ALTER TABLE website_orders ALTER COLUMN status SET DEFAULT 'processing';

-- 3. ENSURE THE MIRROR TRIGGER IS ACTIVE
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

-- 4. FINAL STOCK VIEW REFRESH
-- This ensures the "Grey Out" logic has the latest data names
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

COMMIT;
