-- ============================================================
-- MIGRATION: Add setup_customer_pin RPC function
-- Run this SQL in your Supabase SQL Editor
-- ============================================================
-- This function lets a first-time buyer (who just checked out via eSewa or any
-- guest checkout) set a 4-digit PIN to instantly create / link their account
-- using the phone number from their order.

CREATE OR REPLACE FUNCTION setup_customer_pin(
    p_phone   TEXT,
    p_pin     TEXT,
    p_name    TEXT DEFAULT NULL,
    p_address TEXT DEFAULT NULL,
    p_city    TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_customer  RECORD;
    v_clean_phone TEXT;
    v_found     BOOLEAN := FALSE;
BEGIN
    -- Standardize phone to last 10 digits
    v_clean_phone := right(regexp_replace(p_phone, '\D', '', 'g'), 10);

    IF length(p_pin) < 4 THEN
        RETURN jsonb_build_object('success', false, 'error', 'PIN must be exactly 4 digits');
    END IF;

    -- Try to find an existing customer by phone
    SELECT * INTO v_customer
    FROM website_customers
    WHERE phone ILIKE '%' || v_clean_phone
    LIMIT 1;

    -- FOUND is a PL/pgSQL special variable: TRUE if SELECT INTO returned ≥1 row
    v_found := FOUND;

    IF v_found THEN
        -- Customer already exists — update their PIN (and optional profile fields)
        UPDATE website_customers
        SET
            pin_hash = p_pin,
            name     = COALESCE(NULLIF(p_name,    ''), name),
            address  = COALESCE(NULLIF(p_address, ''), address),
            city     = COALESCE(NULLIF(p_city,    ''), city)
        WHERE phone ILIKE '%' || v_clean_phone;
    ELSE
        -- Brand-new customer — create their account from order details
        INSERT INTO website_customers (name, phone, pin_hash, address, city)
        VALUES (
            COALESCE(NULLIF(p_name, ''), 'Customer'),
            v_clean_phone,
            p_pin,
            p_address,
            p_city
        );
    END IF;

    -- Re-fetch the fresh customer row to return
    SELECT * INTO v_customer
    FROM website_customers
    WHERE phone ILIKE '%' || v_clean_phone
    LIMIT 1;

    RETURN jsonb_build_object('success', true, 'customer', row_to_json(v_customer));
END;
$$;

GRANT EXECUTE ON FUNCTION setup_customer_pin(TEXT, TEXT, TEXT, TEXT, TEXT)
    TO public, anon, authenticated;
