-- ============================================================
-- FINAL FIX FOR CUSTOMER AUTHENTICATION
-- This script handles:
-- 1. Phone number format variations (e.g. 98..., +977..., 977...)
-- 2. Ambiguity in column names during RPC execution
-- 3. Detailed error messages for easier debugging
-- ============================================================

-- 1. Enable Real-time for customers
ALTER PUBLICATION supabase_realtime ADD TABLE website_customers;

DROP FUNCTION IF EXISTS get_customer_profile(TEXT, TEXT);

CREATE OR REPLACE FUNCTION get_customer_profile(p_phone TEXT, p_pin TEXT)
RETURNS TABLE (
    phone TEXT,
    name TEXT,
    address TEXT,
    city TEXT,
    shopy_coins NUMERIC,
    created_at TIMESTAMPTZ,
    pin_hash TEXT,
    pending_coins NUMERIC
) 
LANGUAGE plpgsql SECURITY DEFINER AS $$
#variable_conflict use_column
DECLARE
    v_phone_cleaned TEXT;
    v_locked_until TIMESTAMPTZ;
    v_attempts INT;
    v_match BOOLEAN;
BEGIN
    -- [1] Standardize phone: Remove all non-digits and keep last 10 digits
    v_phone_cleaned := regexp_replace(p_phone, '\D', '', 'g');
    IF length(v_phone_cleaned) > 10 THEN
        v_phone_cleaned := right(v_phone_cleaned, 10);
    END IF;

    -- [2] Check account status
    SELECT locked_until, login_attempts 
    INTO v_locked_until, v_attempts
    FROM website_customers 
    WHERE (regexp_replace(phone, '\D', '', 'g') = v_phone_cleaned OR phone = p_phone)
    LIMIT 1;
    
    IF v_locked_until IS NOT NULL AND v_locked_until > NOW() THEN
        RAISE EXCEPTION 'ACCOUNT_LOCKED_TRY_LATER';
    END IF;

    -- [3] Verify credentials
    -- Matches if (Phone matches last 10 digits) AND (PIN matches OR PIN is NULL for legacy)
    v_match := EXISTS (
        SELECT 1 FROM website_customers 
        WHERE (regexp_replace(phone, '\D', '', 'g') = v_phone_cleaned OR phone = p_phone)
        AND (pin_hash = p_pin OR pin_hash IS NULL)
    );

    IF v_match THEN
        -- Success: Reset attempts
        UPDATE website_customers 
        SET login_attempts = 0, 
            locked_until = NULL,
            pin_hash = COALESCE(pin_hash, p_pin)
        WHERE (regexp_replace(phone, '\D', '', 'g') = v_phone_cleaned OR phone = p_phone);
        
        -- Mark processed ratings as granted (Simplified)
        UPDATE website_product_ratings r
        SET reward_status = 'granted'
        FROM website_orders o
        WHERE r.order_id = o.id
          AND (regexp_replace(r.customer_phone, '\D', '', 'g') = v_phone_cleaned OR r.customer_phone = p_phone)
          AND r.reward_status = 'pending'
          AND o.updated_at < NOW() - INTERVAL '2 days';

        RETURN QUERY
        SELECT 
            c.phone, 
            c.name, 
            c.address, 
            c.city, 
            COALESCE(c.shopy_coins, 0)::NUMERIC, 
            c.created_at, 
            c.pin_hash,
            COALESCE((SELECT SUM(25) FROM website_product_ratings WHERE customer_phone = c.phone AND reward_status = 'pending'), 0)::NUMERIC
        FROM website_customers c
        WHERE (regexp_replace(c.phone, '\D', '', 'g') = v_phone_cleaned OR c.phone = p_phone)
        LIMIT 1;
    ELSE
        -- Failure: Increment attempts
        UPDATE website_customers 
        SET login_attempts = COALESCE(login_attempts, 0) + 1,
            locked_until = CASE WHEN COALESCE(login_attempts, 0) + 1 >= 5 THEN NOW() + INTERVAL '15 minutes' ELSE NULL END
        WHERE (regexp_replace(phone, '\D', '', 'g') = v_phone_cleaned OR phone = p_phone);
        
        RAISE EXCEPTION 'INVALID_PIN';
    END IF;
END;
$$;

-- 2. SELF-SERVICE PIN RESET (Verify by last order)
CREATE OR REPLACE FUNCTION reset_customer_pin(
    p_phone TEXT,
    p_order_number TEXT,
    p_total_amount NUMERIC,
    p_new_pin TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_match BOOLEAN;
BEGIN
    -- Verify if there is an order matching this phone, order number, and total
    v_match := EXISTS (
        SELECT 1 FROM website_orders
        WHERE phone = p_phone
        AND order_number = p_order_number
        AND total_amount = p_total_amount
    );

    IF v_match THEN
        UPDATE website_customers
        SET pin_hash = p_new_pin,
            login_attempts = 0,
            locked_until = NULL
        WHERE phone = p_phone;
        RETURN TRUE;
    ELSE
        RETURN FALSE;
    END IF;
END;
$$;

-- 3. WHATSAPP OTP SYSTEM
CREATE TABLE IF NOT EXISTS website_otps (
    phone TEXT PRIMARY KEY,
    otp_code TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Function to verify OTP and reset PIN
CREATE OR REPLACE FUNCTION verify_whatsapp_otp(
    p_phone TEXT,
    p_code TEXT,
    p_new_pin TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_match BOOLEAN;
BEGIN
    -- Check if OTP exists, matches, and is NOT expired
    v_match := EXISTS (
        SELECT 1 FROM website_otps
        WHERE phone = p_phone
        AND otp_code = p_code
        AND expires_at > NOW()
    );

    IF v_match THEN
        -- 1. Update the PIN
        UPDATE website_customers
        SET pin_hash = p_new_pin,
            login_attempts = 0,
            locked_until = NULL
        WHERE phone = p_phone;

        -- 2. Delete the used OTP
        DELETE FROM website_otps WHERE phone = p_phone;
        
        RETURN TRUE;
    ELSE
        RETURN FALSE;
    END IF;
END;
$$;
