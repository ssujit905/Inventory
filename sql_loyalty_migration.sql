-- 1. Add loyalty coins balances to the customer table
ALTER TABLE website_customers ADD COLUMN IF NOT EXISTS shopy_coins NUMERIC DEFAULT 0;

-- 2. Automatic Secure Rewards Function (To give points when reviewing)
CREATE OR REPLACE FUNCTION add_shopy_coins(p_phone TEXT, p_coins NUMERIC)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    UPDATE website_customers
    SET shopy_coins = COALESCE(shopy_coins, 0) + p_coins
    WHERE phone = p_phone;
END;
$$;

-- 3. Update the Master Database Purchase API to safely consume coins
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
BEGIN
    -- 1️⃣ SECURE COIN VERIFICATION ALGORITHM 
    IF p_coins_used > 0 THEN
        SELECT COALESCE(shopy_coins, 0) INTO v_current_coins FROM website_customers WHERE phone = p_phone;
        IF v_current_coins < p_coins_used THEN
            -- Prevents hackers from forcing discounts
            RAISE EXCEPTION 'INSUFFICIENT_COINS: You cannot use % points. Your balance is %.', p_coins_used, v_current_coins;
        END IF;
        
        -- Deduct coins forever from account
        UPDATE website_customers SET shopy_coins = shopy_coins - p_coins_used WHERE phone = p_phone;
    END IF;

    -- 2️⃣ The existing robust Order creation logic (Untouched and Safe)
    SELECT id INTO v_system_user_id FROM profiles LIMIT 1;
    INSERT INTO sales (order_date, customer_name, customer_address, phone1, phone2, cod_amount, destination_branch, parcel_status, product_id, quantity)
    VALUES (CURRENT_DATE, p_customer_name, p_address, p_phone, NULLIF(p_phone2, ''), p_total_amount, p_city, 'processing', (SELECT inventory_product_id FROM website_variants WHERE id = (SELECT (p_items->0->>'variant_id')::uuid)), (SELECT SUM((x->>'quantity')::int) FROM jsonb_array_elements(p_items) AS x))
    RETURNING id INTO v_sale_record_id;
    INSERT INTO website_orders (customer_name, phone, phone2, address, city, payment_method, total_amount, shipping_fee, status, sale_id)
    VALUES (p_customer_name, p_phone, p_phone2, p_address, p_city, p_payment_method, p_total_amount, p_shipping_fee, 'processing', v_sale_record_id)
    RETURNING id, order_number INTO v_order_id, v_order_number;
    
    FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(variant_id UUID, quantity INT, unit_price NUMERIC, product_id BIGINT, product_title TEXT, sku TEXT) LOOP
        SELECT inventory_product_id INTO v_inventory_id FROM website_variants WHERE id = v_item.variant_id;
        INSERT INTO website_order_items (order_id, variant_id, product_id, product_title, quantity, unit_price, sku) VALUES (v_order_id, v_item.variant_id, v_item.product_id, v_item.product_title, v_item.quantity, v_item.unit_price, v_item.sku);
        v_remaining := v_item.quantity;
        FOR v_lot IN SELECT id, quantity_remaining FROM product_lots WHERE product_id = v_inventory_id AND quantity_remaining > 0 ORDER BY received_date ASC LOOP
            IF v_remaining <= 0 THEN EXIT; END IF;
            IF v_lot.quantity_remaining >= v_remaining THEN
                v_deduction := v_remaining;
            ELSE
                v_deduction := v_lot.quantity_remaining;
            END IF;
            UPDATE product_lots SET quantity_remaining = quantity_remaining - v_deduction WHERE id = v_lot.id;
            INSERT INTO transactions (product_id, lot_id, sale_id, type, quantity_changed, performed_by) VALUES (v_inventory_id, v_lot.id, v_sale_record_id, 'sale', -v_deduction, v_system_user_id);
            v_remaining := v_remaining - v_deduction;
        END LOOP;
        IF v_remaining > 0 THEN RAISE EXCEPTION 'INSUFFICIENT_STOCK: %', v_item.product_title; END IF;
    END LOOP;
    
    RETURN jsonb_build_object('order_id', v_order_id, 'order_number', v_order_number);
END;
$$;

-- 4. Enable Security Access Grants
GRANT EXECUTE ON FUNCTION create_atomic_website_order(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, JSONB, NUMERIC) TO public, anon, authenticated;
GRANT EXECUTE ON FUNCTION add_shopy_coins(TEXT, NUMERIC) TO public, anon, authenticated;
