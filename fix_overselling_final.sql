-- ============================================================
-- MASTER ATOMIC SYNC & OVERSELLING FIX (V2 - COMPREHENSIVE)
-- ============================================================

-- 1️⃣ CREATE INVENTORY STOCK VIEW (Real-time warehouse levels)
DROP VIEW IF EXISTS inventory_stock_view CASCADE;
CREATE OR REPLACE VIEW inventory_stock_view AS
WITH lot_totals AS (
    SELECT 
        product_id,
        COALESCE(SUM(quantity_remaining), 0)::INT as physical_stock
    FROM product_lots
    GROUP BY product_id
),
pending_sales AS (
    -- Subtract items that are sold but not yet removed from lots (if any)
    -- In this system, transactions usually happen at checkout, but we check parcel status to be safe.
    SELECT 
        t.product_id,
        COALESCE(SUM(ABS(t.quantity_changed)), 0)::INT as pending_qty
    FROM transactions t
    JOIN sales s ON s.id = t.sale_id
    WHERE s.parcel_status IN ('processing', 'pending')
    GROUP BY t.product_id
)
SELECT 
    p.id,
    p.name,
    p.sku,
    p.description,
    p.image_url,
    COALESCE(lt.physical_stock, 0) - COALESCE(ps.pending_qty, 0) as available_stock
FROM products p
LEFT JOIN lot_totals lt ON lt.product_id = p.id
LEFT JOIN pending_sales ps ON ps.product_id = p.id;

-- 2️⃣ UPDATE WEBSITE STOCK VIEW (Smart Bundle & Standard Logic)
DROP VIEW IF EXISTS website_variant_stock_view CASCADE;
CREATE OR REPLACE VIEW website_variant_stock_view AS
WITH lot_summaries AS (
    -- Unified stock for ANY inventory item
    SELECT id, available_stock FROM inventory_stock_view
),
bundle_stock_calc AS (
    -- Calculate bundle stock based on the "Weakest Link"
    SELECT 
        vb.bundle_variant_id,
        MIN(FLOOR(COALESCE(ls.available_stock, 0) / vb.quantity))::INT as bundle_stock
    FROM website_variant_bundles vb
    LEFT JOIN lot_summaries ls ON ls.id = vb.child_inventory_id
    GROUP BY vb.bundle_variant_id
)
SELECT 
    v.id as variant_id,
    v.product_id as parent_product_id,
    v.color,
    v.size,
    v.sku,
    v.price,
    v.inventory_product_id,
    v.is_bundle,
    CASE 
        WHEN v.is_bundle THEN COALESCE(bs.bundle_stock, 0)
        ELSE COALESCE(ls.available_stock, 0)
    END as current_stock
FROM website_variants v
LEFT JOIN bundle_stock_calc bs ON bs.bundle_variant_id = v.id
LEFT JOIN lot_summaries ls ON ls.id = v.inventory_product_id;

-- 3️⃣ MASTER ATOMIC ORDER FUNCTION (The Ultimate Guard)
CREATE OR REPLACE FUNCTION create_atomic_website_order(
    p_customer_name TEXT, p_phone TEXT, p_phone2 TEXT, p_address TEXT, p_city TEXT,
    p_payment_method TEXT, p_shipping_fee NUMERIC, p_total_amount NUMERIC, p_items JSONB,
    p_coins_used NUMERIC DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_order_id BIGINT; v_order_number TEXT; v_item RECORD; v_sub_item RECORD;
    v_remaining INT; v_lot RECORD; v_deduction INT; v_system_user_id UUID;
    v_sale_record_id UUID; v_variant_record RECORD; v_result JSONB;
    v_current_coins NUMERIC;
    v_calculated_subtotal NUMERIC := 0;
    v_calculated_shipping NUMERIC := 0;
    v_calculated_total NUMERIC := 0;
    v_variant_price NUMERIC;
    v_inventory_id UUID;
BEGIN
    -- 1️⃣ SECURE COIN VERIFICATION
    IF p_coins_used > 0 THEN
        SELECT COALESCE(shopy_coins, 0) INTO v_current_coins FROM website_customers WHERE phone = p_phone FOR UPDATE;
        IF v_current_coins < p_coins_used THEN
            RAISE EXCEPTION 'INSUFFICIENT_COINS';
        END IF;
    END IF;

    -- 2️⃣ INITIALIZE SYSTEM USER (First admin)
    SELECT id INTO v_system_user_id FROM profiles WHERE role = 'admin' LIMIT 1;

    -- 3️⃣ CREATE SALE RECORD (Main Order Header)
    INSERT INTO sales (
        customer_name, contact_number, alternate_number, address, city,
        payment_method, shipping_fee, total_amount, parcel_status,
        payment_status, order_source, created_by
    ) VALUES (
        p_customer_name, p_phone, p_phone2, p_address, p_city,
        p_payment_method, p_shipping_fee, p_total_amount, 'processing',
        CASE WHEN p_payment_method = 'COD' THEN 'unpaid' ELSE 'paid' END,
        'website', v_system_user_id
    ) RETURNING id INTO v_sale_record_id;

    -- 4️⃣ PROCESS ITEMS & DEDUCT STOCK
    FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(variant_id UUID, quantity INT, price NUMERIC, title TEXT) LOOP
        
        -- Get Variant Info with FOR UPDATE to lock the row
        SELECT * INTO v_variant_record FROM website_variants WHERE id = v_item.variant_id FOR UPDATE;
        
        -- A. Handle Combo/Bundle Products
        IF v_variant_record.is_bundle THEN
            FOR v_sub_item IN SELECT child_inventory_id, quantity FROM website_variant_bundles WHERE bundle_variant_id = v_variant_record.id LOOP
                v_remaining := v_sub_item.quantity * v_item.quantity;
                
                -- Check and Deduct from Lots for each component
                FOR v_lot IN (SELECT id, quantity_remaining FROM product_lots WHERE product_id = v_sub_item.child_inventory_id AND quantity_remaining > 0 ORDER BY received_date ASC, id ASC FOR UPDATE) LOOP
                    v_deduction := LEAST(v_remaining, v_lot.quantity_remaining);
                    UPDATE product_lots SET quantity_remaining = quantity_remaining - v_deduction WHERE id = v_lot.id;
                    v_remaining := v_remaining - v_deduction;
                    
                    INSERT INTO transactions (product_id, type, quantity_changed, lot_id, sale_id, created_by)
                    VALUES (v_sub_item.child_inventory_id, 'sale', -v_deduction, v_lot.id, v_sale_record_id, v_system_user_id);
                    
                    EXIT WHEN v_remaining = 0;
                END LOOP;
                
                IF v_remaining > 0 THEN RAISE EXCEPTION 'INSUFFICIENT_STOCK: %', v_item.title; END IF;
            END LOOP;
        
        -- B. Handle Standard or Custom Products
        ELSE
            IF v_variant_record.inventory_product_id IS NULL THEN
                RAISE EXCEPTION 'MISSING_INVENTORY_LINK: %', v_item.title;
            END IF;
            
            v_remaining := v_item.quantity;
            FOR v_lot IN (SELECT id, quantity_remaining FROM product_lots WHERE product_id = v_variant_record.inventory_product_id AND quantity_remaining > 0 ORDER BY received_date ASC, id ASC FOR UPDATE) LOOP
                v_deduction := LEAST(v_remaining, v_lot.quantity_remaining);
                UPDATE product_lots SET quantity_remaining = quantity_remaining - v_deduction WHERE id = v_lot.id;
                v_remaining := v_remaining - v_deduction;
                
                INSERT INTO transactions (product_id, type, quantity_changed, lot_id, sale_id, created_by)
                VALUES (v_variant_record.inventory_product_id, 'sale', -v_deduction, v_lot.id, v_sale_record_id, v_system_user_id);
                
                EXIT WHEN v_remaining = 0;
            END LOOP;
            
            IF v_remaining > 0 THEN RAISE EXCEPTION 'INSUFFICIENT_STOCK: %', v_item.title; END IF;
        END IF;

        -- Create Order Item Entry
        INSERT INTO website_order_items (order_id, variant_id, quantity, price)
        VALUES (v_sale_record_id, v_item.variant_id, v_item.quantity, v_item.price);
        
    END LOOP;

    -- 5️⃣ DEDUCT COINS IF USED
    IF p_coins_used > 0 THEN
        UPDATE website_customers SET shopy_coins = shopy_coins - p_coins_used WHERE phone = p_phone;
        INSERT INTO coin_transactions (customer_phone, amount, type, description)
        VALUES (p_phone, -p_coins_used, 'burn', 'Order #' || v_sale_record_id);
    END IF;

    RETURN jsonb_build_object('success', true, 'sale_id', v_sale_record_id);
END;
$$;
