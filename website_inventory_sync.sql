-- ──────────────────────────────────────────────────────────
-- PROFESSIONAL WEBSITE SYNC MASTER FILE (V10 - THE ULTIMATE TRUTH)
-- ──────────────────────────────────────────────────────────

-- 1. ENSURE DATABASE CONSTRAINTS ARE UP TO DATE
ALTER TABLE sales DROP CONSTRAINT IF EXISTS sales_parcel_status_check;
ALTER TABLE sales ADD CONSTRAINT sales_parcel_status_check 
CHECK (parcel_status IN ('processing', 'sent', 'delivered', 'returned', 'cancelled'));

ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_type_check;
ALTER TABLE transactions ADD CONSTRAINT transactions_type_check 
CHECK (type IN ('in', 'sale', 'adjustment', 'return', 'exchange', 'cancel'));

-- 1.5. VARIANT SPECIFIC PRICING MIGRATION (For multi-price options like Juice / Size)
ALTER TABLE website_variants ADD COLUMN IF NOT EXISTS price NUMERIC DEFAULT NULL;

-- 2. UNIVERSAL STOCK VIEW (Mirrors Ledger Logic Exactly: In - Active Sales)
CREATE OR REPLACE VIEW website_variant_stock_view AS
WITH lot_summaries AS (
    SELECT 
        t.product_id,
        -- Total units ever received
        COALESCE(SUM(CASE WHEN t.type = 'in' THEN t.quantity_changed ELSE 0 END), 0) as total_in,
        -- Total units sold (only counting active parcel statuses)
        COALESCE(SUM(CASE 
            WHEN t.type = 'sale' AND s.parcel_status IN ('processing', 'sent', 'delivered') 
            THEN ABS(t.quantity_changed) 
            ELSE 0 
        END), 0) as total_sold
    FROM transactions t
    LEFT JOIN sales s ON s.id = t.sale_id
    GROUP BY t.product_id
)
SELECT 
    v.id as variant_id,
    v.product_id as parent_product_id,
    v.sku, v.color, v.size, v.inventory_product_id,
    COALESCE(ls.total_in - ls.total_sold, 0)::INT as current_stock,
    v.price
FROM website_variants v
LEFT JOIN lot_summaries ls ON ls.product_id = v.inventory_product_id;

-- 3. MASTER ORDER CREATION (Maintains deduction logic)
CREATE OR REPLACE FUNCTION create_atomic_website_order(
    p_customer_name TEXT, p_phone TEXT, p_phone2 TEXT, p_address TEXT, p_city TEXT,
    p_payment_method TEXT, p_shipping_fee NUMERIC, p_total_amount NUMERIC, p_items JSONB
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_order_id BIGINT; v_order_number TEXT; v_item RECORD; v_current_stock INT;
    v_remaining INT; v_lot RECORD; v_deduction INT; v_system_user_id UUID;
    v_sale_record_id UUID; v_inventory_id UUID; v_result JSONB;
BEGIN
    SELECT id INTO v_system_user_id FROM profiles LIMIT 1;
    INSERT INTO sales (order_date, customer_name, customer_address, phone1, phone2, cod_amount, destination_branch, parcel_status, product_id, quantity)
    VALUES (CURRENT_DATE, p_customer_name, p_address, p_phone, NULLIF(p_phone2, ''), p_total_amount, p_city, 'processing', (SELECT inventory_product_id FROM website_variants WHERE id = (SELECT (p_items->0->>'variant_id')::bigint)), (SELECT SUM((x->>'quantity')::int) FROM jsonb_array_elements(p_items) AS x))
    RETURNING id INTO v_sale_record_id;
    INSERT INTO website_orders (customer_name, phone, phone2, address, city, payment_method, total_amount, shipping_fee, status, sale_id)
    VALUES (p_customer_name, p_phone, p_phone2, p_address, p_city, p_payment_method, p_total_amount, p_shipping_fee, 'processing', v_sale_record_id)
    RETURNING id, order_number INTO v_order_id, v_order_number;
    FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(variant_id BIGINT, quantity INT, unit_price NUMERIC, product_id BIGINT, product_title TEXT, sku TEXT) LOOP
        SELECT inventory_product_id INTO v_inventory_id FROM website_variants WHERE id = v_item.variant_id;
        INSERT INTO website_order_items (order_id, variant_id, product_id, product_title, quantity, unit_price, sku) VALUES (v_order_id, v_item.variant_id, v_item.product_id, v_item.product_title, v_item.quantity, v_item.unit_price, v_item.sku);
        INSERT INTO sale_items (sale_id, product_id, quantity) VALUES (v_sale_record_id, v_inventory_id, v_item.quantity);
        v_remaining := v_item.quantity;
        FOR v_lot IN (SELECT id, quantity_remaining FROM product_lots WHERE product_id = v_inventory_id AND quantity_remaining > 0 ORDER BY received_date ASC, id ASC) LOOP
            EXIT WHEN v_remaining <= 0;
            v_deduction := LEAST(v_lot.quantity_remaining, v_remaining);
            UPDATE product_lots SET quantity_remaining = quantity_remaining - v_deduction WHERE id = v_lot.id;
            INSERT INTO transactions (product_id, lot_id, sale_id, type, quantity_changed, performed_by) VALUES (v_inventory_id, v_lot.id, v_sale_record_id, 'sale', -v_deduction, v_system_user_id);
            v_remaining := v_remaining - v_deduction;
        END LOOP;
        IF v_remaining > 0 THEN RAISE EXCEPTION 'INSUFFICIENT_STOCK: %', v_item.product_title; END IF;
    END LOOP;
    RETURN jsonb_build_object('order_id', v_order_id, 'order_number', v_order_number);
END;
$$;

-- 4. MASTER CANCELLATION (Restores stock to EXACT ORIGINAL LOTS)
CREATE OR REPLACE FUNCTION handle_website_order_cancellation(
    p_order_id BIGINT,
    p_reason TEXT
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_sale_id UUID;
    v_trans RECORD;
BEGIN
    SELECT sale_id INTO v_sale_id FROM website_orders WHERE id = p_order_id;
    UPDATE website_orders SET status = 'cancelled', notes = p_reason, updated_at = NOW() WHERE id = p_order_id;
    
    IF v_sale_id IS NOT NULL THEN
        UPDATE sales SET parcel_status = 'cancelled' WHERE id = v_sale_id;
        
        -- Restore stock to the EXACT lots from which they were deducted
        FOR v_trans IN SELECT product_id, lot_id, ABS(quantity_changed) as qty FROM transactions WHERE sale_id = v_sale_id AND type = 'sale' LOOP
            -- Return stock to the physical lot column
            IF v_trans.lot_id IS NOT NULL THEN
                UPDATE product_lots SET quantity_remaining = quantity_remaining + v_trans.qty WHERE id = v_trans.lot_id;
            END IF;
            
            -- Log the cancellation transaction
            INSERT INTO transactions (product_id, lot_id, sale_id, type, quantity_changed, performed_by)
            VALUES (v_trans.product_id, v_trans.lot_id, v_sale_id, 'cancel', v_trans.qty, (SELECT id FROM profiles LIMIT 1));
        END LOOP;
    END IF;
END;
$$;

-- GRANT PERMISSIONS
GRANT EXECUTE ON FUNCTION create_atomic_website_order(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, JSONB) TO public, anon, authenticated;
GRANT EXECUTE ON FUNCTION handle_website_order_cancellation(BIGINT, TEXT) TO public, anon, authenticated;
