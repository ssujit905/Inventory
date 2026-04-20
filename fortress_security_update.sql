-- ============================================================
-- THE FORTRESS UPDATE V3: SECURING SHOPY NEPAL
-- ============================================================

-- 1️⃣ REVOKE DANGEROUS PERMISSIONS
-- Prevents anyone from giving themselves free coins via the browser console
REVOKE EXECUTE ON FUNCTION add_shopy_coins(TEXT, NUMERIC) FROM public, anon;

-- 2️⃣ THE "BLIND" LOGIN GATEWAY (PROTECTS CUSTOMER PRIVACY)
-- This function allows a customer to login without exposing the whole table to the internet.
DROP FUNCTION IF EXISTS get_customer_profile(TEXT, TEXT);
CREATE OR REPLACE FUNCTION get_customer_profile(p_phone TEXT, p_pin TEXT)
RETURNS TABLE (
    phone TEXT,
    name TEXT,
    address TEXT,
    city TEXT,
    shopy_coins NUMERIC,
    created_at TIMESTAMPTZ
) 
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    RETURN QUERY
    SELECT c.phone, c.name, c.address, c.city, c.shopy_coins, c.created_at
    FROM website_customers c
    WHERE c.phone = p_phone AND c.pin_hash = p_pin;
END;
$$;

GRANT EXECUTE ON FUNCTION get_customer_profile(TEXT, TEXT) TO public, anon, authenticated;

-- 3️⃣ SECURE THE ORDER STORED PROCEDURE (PREVENTS PRICE TAMPERING)
DROP FUNCTION IF EXISTS create_atomic_website_order(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, JSONB, NUMERIC);
DROP FUNCTION IF EXISTS create_atomic_website_order(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, JSONB);

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
    -- [A] COIN VERIFICATION
    IF p_coins_used > 0 THEN
        v_current_coins := (SELECT COALESCE(shopy_coins, 0) FROM website_customers WHERE phone = p_phone LIMIT 1);
        IF v_current_coins IS NULL OR v_current_coins < p_coins_used THEN
            RAISE EXCEPTION 'INSUFFICIENT_COINS';
        END IF;
        UPDATE website_customers SET shopy_coins = COALESCE(shopy_coins, 0) - p_coins_used WHERE phone = p_phone;
    END IF;

    -- [B] SERVER-SIDE PRICE CALCULATION (REPLACE CLIENT PROVDED PRICE)
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

-- 4️⃣ LOCK DOWN ROW LEVEL SECURITY (ANTI-SCRAPING)
ALTER TABLE website_customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE website_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE website_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE website_order_returns ENABLE ROW LEVEL SECURITY;

-- Drop insecure policies
DROP POLICY IF EXISTS "Public read own customer" ON website_customers;
DROP POLICY IF EXISTS "Public read guest orders" ON website_orders;
DROP POLICY IF EXISTS "Public read guest items" ON website_order_items;
DROP POLICY IF EXISTS "Public insert orders" ON website_orders;
DROP POLICY IF EXISTS "Public insert order items" ON website_order_items;
DROP POLICY IF EXISTS "Public read guest returns" ON website_order_returns; -- If any exists

-- New Secure Policies:
-- Nobody (anon) can read the tables directly anymore.
CREATE POLICY "Strict Customer Lockdown" ON website_customers FOR SELECT USING (FALSE);
CREATE POLICY "Strict Order Lockdown" ON website_orders FOR SELECT USING (FALSE);
CREATE POLICY "Strict Item Lockdown" ON website_order_items FOR SELECT USING (FALSE);
CREATE POLICY "Strict Returns Lockdown" ON website_order_returns FOR SELECT USING (FALSE);

-- Public can only INSERT returns/messages (can't see what they sent later)
CREATE POLICY "Public can send messages" ON website_order_returns FOR INSERT WITH CHECK (TRUE);

-- 5️⃣ RE-GRANT MINIMAL PERMISSIONS
GRANT EXECUTE ON FUNCTION create_atomic_website_order(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, JSONB, NUMERIC) TO public, anon, authenticated;
GRANT EXECUTE ON FUNCTION get_customer_profile(TEXT, TEXT) TO public, anon, authenticated;
