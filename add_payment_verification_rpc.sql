-- ============================================================
-- RPC FUNCTION TO CONFIRM PAYMENT DETAILS FOR WEBSITE ORDERS
-- Run this in your Supabase SQL Editor
-- ============================================================

CREATE OR REPLACE FUNCTION confirm_website_payment(
    p_order_number TEXT,
    p_payment_details TEXT,
    p_status TEXT DEFAULT 'unpaid'
)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_sale_id UUID;
BEGIN
    -- Update website_orders notes and status
    UPDATE website_orders
    SET 
        notes = CASE 
            WHEN notes IS NULL OR notes = '' THEN p_payment_details 
            ELSE notes || E'\n' || p_payment_details 
        END
    WHERE order_number = p_order_number
    RETURNING sale_id INTO v_sale_id;

    -- Update linked sales record if it exists
    IF v_sale_id IS NOT NULL THEN
        UPDATE sales
        SET 
            payment_status = p_status,
            notes = CASE 
                WHEN notes IS NULL OR notes = '' THEN p_payment_details 
                ELSE notes || E'\n' || p_payment_details 
            END
        WHERE id = v_sale_id;
    END IF;

    RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION confirm_website_payment(TEXT, TEXT, TEXT) TO public, anon, authenticated;
