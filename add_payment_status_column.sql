-- ============================================================
-- MIGRATION: Add payment_status column to sales table
-- Run this in your Supabase SQL Editor
-- ============================================================

-- Step 1: Add payment_status column to sales if it doesn't exist
ALTER TABLE sales 
ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'unpaid';

-- Step 2: Re-create confirm_website_payment with correct column reference
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
    UPDATE website_orders
    SET 
        notes = CASE 
            WHEN notes IS NULL OR notes = '' THEN p_payment_details 
            ELSE notes || E'\n' || p_payment_details 
        END
    WHERE order_number = p_order_number
    RETURNING sale_id INTO v_sale_id;

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

-- Step 3: Backfill existing eSewa orders to paid
UPDATE sales
SET payment_status = 'paid'
WHERE id IN (
    SELECT sale_id FROM website_orders 
    WHERE payment_method = 'eSewa' 
    AND sale_id IS NOT NULL
    AND notes ILIKE '%eSewa Payment Complete%'
)
AND (payment_status IS NULL OR payment_status = 'unpaid');
