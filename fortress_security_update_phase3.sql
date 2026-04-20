-- ============================================================
-- THE TITANIUM UPDATE: BRUTE FORCE & XSS PROTECTION
-- ============================================================

-- 1️⃣ ADD SECURITY TRACKING TO CUSTOMERS
ALTER TABLE website_customers ADD COLUMN IF NOT EXISTS login_attempts INT DEFAULT 0;
ALTER TABLE website_customers ADD COLUMN IF NOT EXISTS locked_until TIMESTAMPTZ;

-- 2️⃣ UPDATED LOGIN GATEWAY (WITH BRUTE FORCE PROTECTION)
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
DECLARE
    v_locked_until TIMESTAMPTZ;
    v_attempts INT;
    v_match BOOLEAN;
BEGIN
    -- [A] Check if already locked
    v_locked_until := (SELECT locked_until FROM website_customers WHERE phone = p_phone LIMIT 1);
    v_attempts := (SELECT login_attempts FROM website_customers WHERE phone = p_phone LIMIT 1);
    
    IF v_locked_until IS NOT NULL AND v_locked_until > NOW() THEN
        RAISE EXCEPTION 'ACCOUNT_LOCKED_TRY_LATER';
    END IF;

    -- [B] Verify credentials
    v_match := EXISTS (SELECT 1 FROM website_customers WHERE phone = p_phone AND pin_hash = p_pin);

    IF v_match THEN
        -- Success: Clear attempts
        UPDATE website_customers 
        SET login_attempts = 0, locked_until = NULL 
        WHERE phone = p_phone;
        
        RETURN QUERY
        SELECT c.phone, c.name, c.address, c.city, c.shopy_coins, c.created_at, c.pin_hash
        FROM website_customers c
        WHERE c.phone = p_phone;
    ELSE
        -- Failure: Increment attempts
        UPDATE website_customers 
        SET login_attempts = COALESCE(login_attempts, 0) + 1,
            locked_until = CASE WHEN COALESCE(login_attempts, 0) + 1 >= 5 THEN NOW() + INTERVAL '15 minutes' ELSE NULL END
        WHERE phone = p_phone;
        
        RAISE EXCEPTION 'INVALID_PIN';
    END IF;
END;
$$;

-- 4️⃣ ORDER RATE LIMITING (ANTI-DOS)
-- Re-defining the order function slightly to add a 30-second cooldown
CREATE OR REPLACE FUNCTION check_order_cooldown(p_phone TEXT)
RETURNS BOOLEAN AS $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM website_orders 
        WHERE phone = p_phone 
        AND created_at > NOW() - INTERVAL '30 seconds'
    ) THEN
        RAISE EXCEPTION 'ORDER_TOO_FAST_WAIT_30S';
    END IF;
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- 3️⃣ STRING SANITIZER (ANT-XSS PROTECTION)
-- This function automatically cleans up text to stop "Script Injections"
CREATE OR REPLACE FUNCTION sanitize_string(p_input TEXT)
RETURNS TEXT AS $$
BEGIN
    IF p_input IS NULL THEN RETURN NULL; END IF;
    -- Remove common XSS tags
    RETURN regexp_replace(p_input, '<[^>]*>|javascript:|alert\(|onerror=', '', 'gi');
END;
$$ LANGUAGE plpgsql;

-- 4️⃣ PROTECTIVE TRIGGERS
-- Automatically sanitize every contact message and product review
CREATE OR REPLACE FUNCTION trigger_sanitize_content()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_TABLE_NAME = 'website_order_returns' THEN
        NEW.message := sanitize_string(NEW.message);
    ELSIF TG_TABLE_NAME = 'website_product_ratings' THEN
        NEW.comment := sanitize_string(NEW.comment);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS on_return_insert_sanitize ON website_order_returns;
CREATE TRIGGER on_return_insert_sanitize
BEFORE INSERT ON website_order_returns
FOR EACH ROW EXECUTE FUNCTION trigger_sanitize_content();

-- 5️⃣ UPDATED ORDER FUNCTION (WITH RATE LIMITING)
CREATE OR REPLACE FUNCTION create_atomic_website_order(
    p_customer_name TEXT, p_phone TEXT, p_phone2 TEXT, p_address TEXT, p_city TEXT,
    p_payment_method TEXT, p_shipping_fee NUMERIC, p_total_amount NUMERIC, p_items JSONB,
    p_coins_used NUMERIC DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_order_id BIGINT; v_order_number TEXT; v_item RECORD; v_current_stock INT;
    v_remaining INT; v_lot RECORD; v_deduction INT; v_system_user_id UUID;
    v_sale_record_id UUID; v_inventory_id UUID; v_result JSONB;
    v_current_coins NUMERIC;
    v_calculated_subtotal NUMERIC := 0;
    v_calculated_shipping NUMERIC := 0;
    v_calculated_total NUMERIC := 0;
    v_variant_price NUMERIC;
BEGIN
    -- [0] RATE LIMITING CHECK
    PERFORM check_order_cooldown(p_phone);

    -- [A] COIN VERIFICATION
    IF p_coins_used > 0 THEN
        v_current_coins := (SELECT COALESCE(shopy_coins, 0) FROM website_customers WHERE phone = p_phone LIMIT 1);
        IF v_current_coins IS NULL OR v_current_coins < p_coins_used THEN
            RAISE EXCEPTION 'INSUFFICIENT_COINS';
        END IF;
        UPDATE website_customers SET shopy_coins = COALESCE(shopy_coins, 0) - p_coins_used WHERE phone = p_phone;
    END IF;

    -- [B] SERVER-SIDE PRICE CALCULATION
    v_calculated_shipping := (SELECT shipping_fee FROM website_delivery_branches WHERE city = p_city LIMIT 1);
    IF v_calculated_shipping IS NULL THEN v_calculated_shipping := 250; END IF;

    FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(variant_id BIGINT, quantity INT) LOOP
        v_variant_price := (SELECT price FROM website_products 
                           WHERE id = (SELECT product_id FROM website_variants WHERE id = v_item.variant_id LIMIT 1));
        v_calculated_subtotal := v_calculated_subtotal + (COALESCE(v_variant_price, 0) * v_item.quantity);
    END LOOP;

    v_calculated_total := v_calculated_subtotal + v_calculated_shipping - p_coins_used;
    IF v_calculated_total < 0 THEN v_calculated_total := 0; END IF;

    -- [C] RECORD CREATION
    v_system_user_id := (SELECT id FROM profiles LIMIT 1);
    
    INSERT INTO sales (order_date, customer_name, customer_address, phone1, phone2, cod_amount, destination_branch, parcel_status, product_id, quantity)
    VALUES (CURRENT_DATE, p_customer_name, p_address, p_phone, NULLIF(p_phone2, ''), v_calculated_total, p_city, 'processing', (SELECT inventory_product_id FROM website_variants WHERE id = (SELECT (p_items->0->>'variant_id')::bigint)), (SELECT SUM((x->>'quantity')::int) FROM jsonb_array_elements(p_items) AS x))
    RETURNING id INTO v_sale_record_id;

    INSERT INTO website_orders (customer_name, phone, phone2, address, city, payment_method, total_amount, shipping_fee, status, sale_id)
    VALUES (p_customer_name, p_phone, p_phone2, p_address, p_city, p_payment_method, v_calculated_total, v_calculated_shipping, 'processing', v_sale_record_id)
    RETURNING id, order_number INTO v_order_id, v_order_number;
    
    FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(variant_id BIGINT, quantity INT, unit_price NUMERIC, product_id BIGINT, product_title TEXT, sku TEXT) LOOP
        v_inventory_id := (SELECT inventory_product_id FROM website_variants WHERE id = v_item.variant_id LIMIT 1);
        v_variant_price := (SELECT price FROM website_products WHERE id = v_item.product_id LIMIT 1);

        INSERT INTO website_order_items (order_id, variant_id, product_id, product_title, quantity, unit_price, sku) 
        VALUES (v_order_id, v_item.variant_id, v_item.product_id, v_item.product_title, v_item.quantity, COALESCE(v_variant_price, 0), v_item.sku);
        
        v_remaining := v_item.quantity;
        FOR v_lot IN SELECT id, quantity_remaining FROM product_lots WHERE product_id = v_inventory_id AND quantity_remaining > 0 ORDER BY received_date ASC LOOP
            IF v_remaining <= 0 THEN EXIT; END IF;
            IF v_lot.quantity_remaining >= v_remaining THEN v_deduction := v_remaining; ELSE v_deduction := v_lot.quantity_remaining; END IF;
            UPDATE product_lots SET quantity_remaining = quantity_remaining - v_deduction WHERE id = v_lot.id;
            INSERT INTO transactions (product_id, lot_id, sale_id, type, quantity_changed, performed_by) VALUES (v_inventory_id, v_lot.id, v_sale_record_id, 'sale', -v_deduction, v_system_user_id);
            v_remaining := v_remaining - v_deduction;
        END LOOP;
        IF v_remaining > 0 THEN RAISE EXCEPTION 'INSUFFICIENT_STOCK: %', v_item.product_title; END IF;
    END LOOP;
    
    RETURN jsonb_build_object('order_id', v_order_id, 'order_number', v_order_number);
END;
$$;

GRANT EXECUTE ON FUNCTION create_atomic_website_order(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, JSONB, NUMERIC) TO public, anon, authenticated;

-- 6️⃣ UPDATED RATING FUNCTION (WITH RATE LIMITING)
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
    v_name := (SELECT name FROM website_customers WHERE phone = p_phone AND pin_hash = p_pin LIMIT 1);
    IF v_name IS NULL THEN RETURN FALSE; END IF;

    -- 2. Insert Rating
    INSERT INTO website_product_ratings (order_id, product_id, customer_phone, customer_name, rating, comment)
    VALUES (p_order_id, p_product_id, p_phone, v_name, p_rating, p_comment);

    -- 3. Grant Reward
    UPDATE website_customers SET shopy_coins = COALESCE(shopy_coins, 0) + 25 WHERE phone = p_phone;

    RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION submit_product_rating(TEXT, TEXT, BIGINT, BIGINT, INT, TEXT) TO public, anon, authenticated;

-- 7️⃣ TOTAL DATABASE LOCKDOWN (BULK ENABLE RLS)
ALTER TABLE website_customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE website_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE website_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE website_order_returns ENABLE ROW LEVEL SECURITY;
ALTER TABLE website_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE website_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_lots ENABLE ROW LEVEL SECURITY;
ALTER TABLE sale_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Apply Admin Master Access to EVERYTHING
DROP POLICY IF EXISTS "Admin Master Access" ON products;
CREATE POLICY "Admin Master Access" ON products FOR ALL USING (is_admin_or_staff());

DROP POLICY IF EXISTS "Admin Master Access" ON sales;
CREATE POLICY "Admin Master Access" ON sales FOR ALL USING (is_admin_or_staff());

DROP POLICY IF EXISTS "Admin Master Access" ON transactions;
CREATE POLICY "Admin Master Access" ON transactions FOR ALL USING (is_admin_or_staff());

DROP POLICY IF EXISTS "Admin Master Access" ON product_lots;
CREATE POLICY "Admin Master Access" ON product_lots FOR ALL USING (is_admin_or_staff());

DROP POLICY IF EXISTS "Admin Master Access" ON sale_items;
CREATE POLICY "Admin Master Access" ON sale_items FOR ALL USING (is_admin_or_staff());

DROP POLICY IF EXISTS "Admin Master Access" ON website_variants;
CREATE POLICY "Admin Master Access" ON website_variants FOR ALL USING (is_admin_or_staff());

DROP POLICY IF EXISTS "Admin Master Access" ON profiles;
CREATE POLICY "Admin Master Access" ON profiles FOR ALL USING (is_admin_or_staff());

-- Profiles: Allow users to see their own profile
DROP POLICY IF EXISTS "Self view profiles" ON profiles;
CREATE POLICY "Self view profiles" ON profiles FOR SELECT USING (auth.uid() = id);

-- Public Website Specifics
DROP POLICY IF EXISTS "Public Read Products" ON website_products;
CREATE POLICY "Public Read Products" ON website_products FOR SELECT USING (TRUE);

DROP POLICY IF EXISTS "Public Read Variants" ON website_variants;
CREATE POLICY "Public Read Variants" ON website_variants FOR SELECT USING (TRUE);
