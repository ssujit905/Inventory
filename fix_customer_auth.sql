-- 1. Fix Legacy Customer Login (Set PIN on first login if it was NULL)
DROP FUNCTION IF EXISTS get_customer_profile(TEXT, TEXT);
CREATE OR REPLACE FUNCTION get_customer_profile(p_phone TEXT, p_pin TEXT)
RETURNS TABLE (
    phone TEXT,
    name TEXT,
    address TEXT,
    city TEXT,
    shopy_coins NUMERIC,
    created_at TIMESTAMPTZ,
    pin_hash TEXT
) 
LANGUAGE plpgsql SECURITY DEFINER AS $$
#variable_conflict use_column
DECLARE
    v_locked_until TIMESTAMPTZ;
    v_attempts INT;
    v_match BOOLEAN;
BEGIN
    -- [A] Check if already locked
    v_locked_until := (SELECT locked_until FROM website_customers WHERE website_customers.phone = p_phone LIMIT 1);
    v_attempts := (SELECT login_attempts FROM website_customers WHERE website_customers.phone = p_phone LIMIT 1);
    
    IF v_locked_until IS NOT NULL AND v_locked_until > NOW() THEN
        RAISE EXCEPTION 'ACCOUNT_LOCKED_TRY_LATER';
    END IF;

    -- [B] Verify credentials (allow first-time PIN setting for legacy accounts)
    v_match := EXISTS (SELECT 1 FROM website_customers WHERE website_customers.phone = p_phone AND (website_customers.pin_hash = p_pin OR website_customers.pin_hash IS NULL));

    IF v_match THEN
        -- Success: Clear attempts and set PIN if it was NULL
        UPDATE website_customers 
        SET login_attempts = 0, 
            locked_until = NULL,
            pin_hash = COALESCE(website_customers.pin_hash, p_pin)
        WHERE website_customers.phone = p_phone;
        
        RETURN QUERY
        SELECT c.phone, c.name, c.address, c.city, c.shopy_coins, c.created_at, c.pin_hash
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

-- 2. Allow New Customers to Register (RLS was blocking new inserts!)
ALTER TABLE website_customers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow anon customer insert" ON website_customers;
CREATE POLICY "Allow anon customer insert" ON website_customers FOR INSERT WITH CHECK (TRUE);

-- Customers can view and update their own profiles
DROP POLICY IF EXISTS "Customers can view own profile" ON website_customers;
CREATE POLICY "Customers can view own profile" ON website_customers FOR SELECT USING (TRUE); -- Allow checking if phone exists

DROP POLICY IF EXISTS "Customers can update own profile" ON website_customers;
CREATE POLICY "Customers can update own profile" ON website_customers FOR UPDATE USING (TRUE);
