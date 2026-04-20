-- 1️⃣ UPDATED LOGIN GATEWAY (NOW RETURNS THE KEY FOR PHASE 2)
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
BEGIN
    RETURN QUERY
    SELECT c.phone, c.name, c.address, c.city, c.shopy_coins, c.created_at, c.pin_hash
    FROM website_customers c
    WHERE c.phone = p_phone AND c.pin_hash = p_pin;
END;
$$;

GRANT EXECUTE ON FUNCTION get_customer_profile(TEXT, TEXT) TO public, anon, authenticated;

-- 2️⃣ SECURE ORDER GATEWAY
DROP FUNCTION IF EXISTS get_customer_orders(TEXT, TEXT);
CREATE OR REPLACE FUNCTION get_customer_orders(p_phone TEXT, p_pin TEXT)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_customer_exists BOOLEAN;
    v_orders JSONB;
BEGIN
    v_customer_exists := EXISTS (
        SELECT 1 FROM website_customers WHERE phone = p_phone AND pin_hash = p_pin
    );

    IF NOT v_customer_exists THEN
        RETURN jsonb_build_object('success', false, 'error', 'Invalid credentials');
    END IF;

    v_orders := (
        SELECT jsonb_agg(sub)
        FROM (
            SELECT o.*, 
                (SELECT jsonb_agg(i) FROM website_order_items i WHERE i.order_id = o.id) as items
            FROM website_orders o
            WHERE o.phone = p_phone
            ORDER BY o.created_at DESC
        ) sub
    );

    RETURN jsonb_build_object('success', true, 'orders', COALESCE(v_orders, '[]'::jsonb));
END;
$$;

-- 2️⃣ SECURE PIN CHANGE GATEWAY
DROP FUNCTION IF EXISTS change_customer_pin(TEXT, TEXT, TEXT);
CREATE OR REPLACE FUNCTION change_customer_pin(p_phone TEXT, p_old_pin TEXT, p_new_pin TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    UPDATE website_customers 
    SET pin_hash = p_new_pin 
    WHERE phone = p_phone AND pin_hash = p_old_pin;
    
    RETURN FOUND;
END;
$$;

-- 3️⃣ SECURE PROFILE UPDATE GATEWAY
DROP FUNCTION IF EXISTS update_customer_profile(TEXT, TEXT, TEXT, TEXT, TEXT);
CREATE OR REPLACE FUNCTION update_customer_profile(p_phone TEXT, p_pin TEXT, p_name TEXT, p_address TEXT, p_city TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    UPDATE website_customers 
    SET name = p_name, address = p_address, city = p_city
    WHERE phone = p_phone AND pin_hash = p_pin;
    
    RETURN FOUND;
END;
$$;

-- 4️⃣ SECURE RETURNS GATEWAY
DROP FUNCTION IF EXISTS get_customer_returns(TEXT, TEXT);
CREATE OR REPLACE FUNCTION get_customer_returns(p_phone TEXT, p_pin TEXT)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_customer_exists BOOLEAN;
    v_returns JSONB;
BEGIN
    v_customer_exists := EXISTS (
        SELECT 1 FROM website_customers WHERE phone = p_phone AND pin_hash = p_pin
    );

    IF NOT v_customer_exists THEN
        RETURN jsonb_build_object('success', false, 'error', 'Invalid credentials');
    END IF;

    v_returns := (
        SELECT jsonb_agg(r)
        FROM website_order_returns r
        WHERE r.customer_phone = p_phone
    );

    RETURN jsonb_build_object('success', true, 'returns', COALESCE(v_returns, '[]'::jsonb));
END;
$$;

-- 5️⃣ SECURE RATING & REWARD GATEWAY (PREVENTS COIN FRAUD)
DROP FUNCTION IF EXISTS submit_product_rating(TEXT, TEXT, BIGINT, BIGINT, INT, TEXT);
CREATE OR REPLACE FUNCTION submit_product_rating(
    p_phone TEXT, p_pin TEXT, p_order_id BIGINT, p_product_id BIGINT, 
    p_rating INT, p_comment TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_name TEXT;
BEGIN
    -- 1. Verify User and Get Name
    v_name := (SELECT name FROM website_customers WHERE phone = p_phone AND pin_hash = p_pin LIMIT 1);
    IF v_name IS NULL THEN RETURN FALSE; END IF;

    -- 2. Insert Rating
    INSERT INTO website_product_ratings (order_id, product_id, customer_phone, customer_name, rating, comment)
    VALUES (p_order_id, p_product_id, p_phone, v_name, p_rating, p_comment);

    -- 3. Grant Reward (Now safe because it's inside this authenticated function)
    UPDATE website_customers SET shopy_coins = COALESCE(shopy_coins, 0) + 25 WHERE phone = p_phone;

    RETURN TRUE;
END;
$$;

-- 6️⃣ RE-GRANT PERMISSIONS
GRANT EXECUTE ON FUNCTION get_customer_orders(TEXT, TEXT) TO public, anon, authenticated;
GRANT EXECUTE ON FUNCTION change_customer_pin(TEXT, TEXT, TEXT) TO public, anon, authenticated;
GRANT EXECUTE ON FUNCTION update_customer_profile(TEXT, TEXT, TEXT, TEXT, TEXT) TO public, anon, authenticated;
GRANT EXECUTE ON FUNCTION get_customer_returns(TEXT, TEXT) TO public, anon, authenticated;
GRANT EXECUTE ON FUNCTION submit_product_rating(TEXT, TEXT, BIGINT, BIGINT, INT, TEXT) TO public, anon, authenticated;

-- Ensure RLS is strictly locking out direct table reads, BUT allowed for Admins/Staff
ALTER TABLE website_customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE website_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE website_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE website_order_returns ENABLE ROW LEVEL SECURITY;
ALTER TABLE website_products ENABLE ROW LEVEL SECURITY;

-- Master Admin Policies (Allows you to see everything in the Desktop App)
-- We check the 'profiles' table to see if the logged-in user is admin/staff
CREATE OR REPLACE FUNCTION is_admin_or_staff()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM profiles 
        WHERE id = auth.uid() 
        AND role IN ('admin', 'staff')
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Apply Admin Master Access to all tables
DROP POLICY IF EXISTS "Admin Master Access" ON website_customers;
CREATE POLICY "Admin Master Access" ON website_customers FOR ALL USING (is_admin_or_staff());

DROP POLICY IF EXISTS "Admin Master Access" ON website_orders;
CREATE POLICY "Admin Master Access" ON website_orders FOR ALL USING (is_admin_or_staff());

DROP POLICY IF EXISTS "Admin Master Access" ON website_order_items;
CREATE POLICY "Admin Master Access" ON website_order_items FOR ALL USING (is_admin_or_staff());

DROP POLICY IF EXISTS "Admin Master Access" ON website_order_returns;
CREATE POLICY "Admin Master Access" ON website_order_returns FOR ALL USING (is_admin_or_staff());

-- Keep standard product list public
DROP POLICY IF EXISTS "Public Read Products" ON website_products;
CREATE POLICY "Public Read Products" ON website_products FOR SELECT USING (TRUE);
DROP POLICY IF EXISTS "Admin Manage Products" ON website_products;
CREATE POLICY "Admin Manage Products" ON website_products FOR ALL USING (is_admin_or_staff());

-- Add the public signup policy again for safety
DROP POLICY IF EXISTS "Allow public signup" ON website_customers;
CREATE POLICY "Allow public signup" ON website_customers FOR INSERT WITH CHECK (TRUE);

-- Lock down SELECT for the public
DROP POLICY IF EXISTS "Strict Customer Lockdown" ON website_customers;
CREATE POLICY "Strict Customer Lockdown" ON website_customers FOR SELECT USING (FALSE);

DROP POLICY IF EXISTS "Strict Order Lockdown" ON website_orders;
CREATE POLICY "Strict Order Lockdown" ON website_orders FOR SELECT USING (FALSE);

DROP POLICY IF EXISTS "Strict Item Lockdown" ON website_order_items;
CREATE POLICY "Strict Item Lockdown" ON website_order_items FOR SELECT USING (FALSE);

DROP POLICY IF EXISTS "Public can send messages" ON website_order_returns;
CREATE POLICY "Public can send messages" ON website_order_returns FOR INSERT WITH CHECK (TRUE);
