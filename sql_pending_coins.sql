-- ============================================================
-- PENDING COINS IMPLEMENTATION
-- ============================================================

-- 1. Add reward_status to ratings table
ALTER TABLE website_product_ratings ADD COLUMN IF NOT EXISTS reward_status TEXT DEFAULT 'pending';

-- 2. Add pending_coins to get_customer_profile return type
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
    v_locked_until TIMESTAMPTZ;
    v_attempts INT;
    v_match BOOLEAN;
    v_matured_coins NUMERIC := 0;
BEGIN
    -- [A] Check if already locked
    v_locked_until := (SELECT locked_until FROM website_customers WHERE website_customers.phone = p_phone LIMIT 1);
    v_attempts := (SELECT login_attempts FROM website_customers WHERE website_customers.phone = p_phone LIMIT 1);
    
    IF v_locked_until IS NOT NULL AND v_locked_until > NOW() THEN
        RAISE EXCEPTION 'ACCOUNT_LOCKED_TRY_LATER';
    END IF;

    -- [B] Verify credentials
    v_match := EXISTS (SELECT 1 FROM website_customers WHERE website_customers.phone = p_phone AND (website_customers.pin_hash = p_pin OR website_customers.pin_hash IS NULL));

    IF v_match THEN
        -- Success: Clear attempts and set PIN if it was NULL
        UPDATE website_customers 
        SET login_attempts = 0, 
            locked_until = NULL,
            pin_hash = COALESCE(website_customers.pin_hash, p_pin)
        WHERE website_customers.phone = p_phone;
        
        -- [C] Lazy Evaluation: Move matured pending coins to main wallet!
        -- A coin is mature if the associated order's updated_at (delivery date) was more than 2 days ago.
        -- We will aggregate all pending ratings that are mature.
        SELECT COALESCE(SUM(25), 0) INTO v_matured_coins
        FROM website_product_ratings r
        JOIN website_orders o ON r.order_id = o.id
        WHERE r.customer_phone = p_phone 
          AND r.reward_status = 'pending'
          AND o.updated_at < NOW() - INTERVAL '2 days';

        IF v_matured_coins > 0 THEN
            -- Add matured coins to the main balance
            UPDATE website_customers SET shopy_coins = COALESCE(shopy_coins, 0) + v_matured_coins WHERE website_customers.phone = p_phone;
            
            -- Mark those ratings as granted
            UPDATE website_product_ratings r
            SET reward_status = 'granted'
            FROM website_orders o
            WHERE r.order_id = o.id
              AND r.customer_phone = p_phone 
              AND r.reward_status = 'pending'
              AND o.updated_at < NOW() - INTERVAL '2 days';
        END IF;
        
        -- Return the profile along with dynamically calculated pending coins
        RETURN QUERY
        SELECT 
            c.phone, c.name, c.address, c.city, c.shopy_coins, c.created_at, c.pin_hash,
            (
                SELECT COALESCE(SUM(25), 0) 
                FROM website_product_ratings r2
                WHERE r2.customer_phone = c.phone AND r2.reward_status = 'pending'
            ) AS pending_coins
        FROM website_customers c
        WHERE c.phone = p_phone;
    ELSE
        -- Failure: Increment attempts
        UPDATE website_customers 
        SET login_attempts = COALESCE(login_attempts, 0) + 1,
            locked_until = CASE WHEN COALESCE(login_attempts, 0) + 1 >= 5 THEN NOW() + INTERVAL '15 minutes' ELSE NULL END
        WHERE website_customers.phone = p_phone;
        
        RAISE EXCEPTION 'INVALID_PIN';
    END IF;
END;
$$;

-- 3. Update the Rating submission to not give coins immediately!
CREATE OR REPLACE FUNCTION submit_product_rating(
    p_phone TEXT, p_pin TEXT, p_order_id BIGINT, p_product_id BIGINT, 
    p_rating INT, p_comment TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_name TEXT;
BEGIN
    -- [0] RATE LIMITING
    IF EXISTS (
        SELECT 1 FROM website_product_ratings 
        WHERE customer_phone = p_phone 
        AND created_at > NOW() - INTERVAL '30 seconds'
    ) THEN
        RAISE EXCEPTION 'RATING_TOO_FAST_WAIT_30S';
    END IF;

    -- 1. Verify User and Get Name
    v_name := (SELECT name FROM website_customers WHERE phone = p_phone AND (pin_hash = p_pin OR pin_hash IS NULL) LIMIT 1);
    IF v_name IS NULL THEN RETURN FALSE; END IF;

    -- 2. Insert Rating as PENDING
    INSERT INTO website_product_ratings (order_id, product_id, customer_phone, customer_name, rating, comment, reward_status)
    VALUES (p_order_id, p_product_id, p_phone, v_name, p_rating, p_comment, 'pending');

    -- Note: We no longer grant coins directly to `shopy_coins` here!
    -- They are pending and will be resolved on the next profile refresh after 2 days.

    RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION submit_product_rating(TEXT, TEXT, BIGINT, BIGINT, INT, TEXT) TO public, anon, authenticated;
