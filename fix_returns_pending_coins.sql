-- ============================================================
-- FIX: Pending Coins Logic for Returns & Cancelled Orders
-- ============================================================

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
    v_matured_coins NUMERIC := 0;
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
        
        -- [4] Calculate and Grant Matured Coins safely
        -- A coin is mature ONLY if:
        --   1. Delivery was > 2 days ago
        --   2. Order status is NOT returned or cancelled
        --   3. No active return request exists for this order
        WITH updated_ratings AS (
            UPDATE website_product_ratings r
            SET reward_status = 'granted'
            FROM website_orders o
            WHERE r.order_id = o.id
              AND (regexp_replace(r.customer_phone, '\D', '', 'g') = v_phone_cleaned OR r.customer_phone = p_phone)
              AND r.reward_status = 'pending'
              AND o.updated_at < NOW() - INTERVAL '2 days'
              AND o.status NOT IN ('returned', 'cancelled')
              AND NOT EXISTS (
                  SELECT 1 FROM website_order_returns wor 
                  WHERE wor.order_id = o.id AND wor.type = 'return'
              )
            RETURNING r.id
        )
        SELECT (COUNT(*) * 25) INTO v_matured_coins FROM updated_ratings;

        -- If we granted any new coins, actually add them to the wallet (this was missing before!)
        IF v_matured_coins > 0 THEN
            UPDATE website_customers 
            SET shopy_coins = COALESCE(shopy_coins, 0) + v_matured_coins 
            WHERE (regexp_replace(phone, '\D', '', 'g') = v_phone_cleaned OR phone = p_phone);
        END IF;

        -- [5] Mark as 'voided' if an order was returned/cancelled so it doesn't stay 'pending' forever
        UPDATE website_product_ratings r
        SET reward_status = 'voided'
        FROM website_orders o
        WHERE r.order_id = o.id
          AND (regexp_replace(r.customer_phone, '\D', '', 'g') = v_phone_cleaned OR r.customer_phone = p_phone)
          AND r.reward_status = 'pending'
          AND (
              o.status IN ('returned', 'cancelled')
              OR EXISTS (
                  SELECT 1 FROM website_order_returns wor 
                  WHERE wor.order_id = o.id AND wor.type = 'return'
              )
          );

        -- Return the profile along with dynamically calculated pending coins
        -- (Pending coins only include those that are still eligible to mature)
        RETURN QUERY
        SELECT 
            c.phone, 
            c.name, 
            c.address, 
            c.city, 
            COALESCE(c.shopy_coins, 0)::NUMERIC, 
            c.created_at, 
            c.pin_hash,
            COALESCE((
                SELECT SUM(25) FROM website_product_ratings r
                JOIN website_orders o ON r.order_id = o.id
                WHERE (regexp_replace(r.customer_phone, '\D', '', 'g') = v_phone_cleaned OR r.customer_phone = p_phone)
                  AND r.reward_status = 'pending'
            ), 0)::NUMERIC
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
