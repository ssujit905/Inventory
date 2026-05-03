-- ============================================================
-- FIX: Prevent Double Stock Restoration on Multiple Cancels
-- ============================================================
-- ROOT CAUSE:
--   The handle_website_order_cancellation function did not check
--   if the order was ALREADY cancelled. If a user clicked "Cancel"
--   multiple times, it would restore the stock multiple times,
--   causing the available stock to inflate.
-- ============================================================

CREATE OR REPLACE FUNCTION handle_website_order_cancellation(
    p_order_id BIGINT,
    p_reason TEXT
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_sale_id UUID;
    v_current_status TEXT;
    v_trans RECORD;
BEGIN
    -- 1. Check current status before doing anything
    SELECT sale_id, status INTO v_sale_id, v_current_status 
    FROM website_orders 
    WHERE id = p_order_id;
    
    -- Safety Check: Prevent double-restoration
    IF v_current_status = 'cancelled' THEN
        RETURN; -- Silently exit if already cancelled
    END IF;

    -- 2. Mark as cancelled
    UPDATE website_orders 
    SET status = 'cancelled', notes = p_reason, updated_at = NOW() 
    WHERE id = p_order_id;
    
    IF v_sale_id IS NOT NULL THEN
        UPDATE sales SET parcel_status = 'cancelled' WHERE id = v_sale_id;
        
        -- Restore stock to the EXACT lots from which they were deducted
        FOR v_trans IN 
            SELECT product_id, lot_id, ABS(quantity_changed) as qty 
            FROM transactions 
            WHERE sale_id = v_sale_id AND type = 'sale' 
        LOOP
            -- Return stock to the physical lot column
            IF v_trans.lot_id IS NOT NULL THEN
                UPDATE product_lots 
                SET quantity_remaining = quantity_remaining + v_trans.qty 
                WHERE id = v_trans.lot_id;
            END IF;
            
            -- Log the cancellation transaction
            INSERT INTO transactions (product_id, lot_id, sale_id, type, quantity_changed, performed_by)
            VALUES (v_trans.product_id, v_trans.lot_id, v_sale_id, 'cancel', v_trans.qty, (SELECT id FROM profiles LIMIT 1));
        END LOOP;
    END IF;
END;
$$;
