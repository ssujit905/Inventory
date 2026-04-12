-- ───────── ⚡ REAL-TIME STATUS SYNC TRIGGER ⚡ ─────────
-- This ensures that updating a sale in the App automatically updates the Website.

-- 1. Create the Sync Function
CREATE OR REPLACE FUNCTION sync_website_order_status()
RETURNS TRIGGER AS $$
BEGIN
    -- Only sync if the parcel_status actually changed
    IF (OLD.parcel_status IS DISTINCT FROM NEW.parcel_status) THEN
        UPDATE website_orders 
        SET status = NEW.parcel_status,
            updated_at = NOW()
        WHERE sale_id = NEW.id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Bind the Trigger to the 'sales' table
DROP TRIGGER IF EXISTS on_sale_status_update ON sales;
CREATE TRIGGER on_sale_status_update
AFTER UPDATE ON sales
FOR EACH ROW
EXECUTE FUNCTION sync_website_order_status();

-- 3. BONUS: Sync historical statuses if they are already different
UPDATE website_orders w
SET status = s.parcel_status
FROM sales s
WHERE w.sale_id = s.id AND w.status != s.parcel_status;
