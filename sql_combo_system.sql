-- ============================================================
-- COMBO / BUNDLE SYSTEM IMPLEMENTATION
-- ============================================================

-- 1. Create Bundle Items Table
-- This table defines which component items (variants) make up a "Combo" variant.
CREATE TABLE IF NOT EXISTS website_variant_bundles (
    id BIGSERIAL PRIMARY KEY,
    bundle_variant_id UUID REFERENCES website_variants(id) ON DELETE CASCADE,
    child_inventory_id UUID REFERENCES products(id) ON DELETE CASCADE,
    quantity INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(bundle_variant_id, child_inventory_id)
);

-- 2. Add 'is_bundle' flag to website_variants
ALTER TABLE website_variants ADD COLUMN IF NOT EXISTS is_bundle BOOLEAN DEFAULT FALSE;

-- 3. Update the Stock View to handle Bundles
-- For bundles, stock is limited by the "weakest link" (the component with the lowest relative stock)
DROP VIEW IF EXISTS website_variant_stock_view CASCADE;
CREATE OR REPLACE VIEW website_variant_stock_view AS
WITH lot_summaries AS (
    SELECT 
        t.product_id,
        COALESCE(SUM(CASE WHEN t.type = 'in' THEN t.quantity_changed ELSE 0 END), 0) -
        COALESCE(SUM(CASE 
            WHEN t.type = 'sale' AND s.parcel_status IN ('processing', 'sent', 'delivered') 
            THEN ABS(t.quantity_changed) 
            ELSE 0 
        END), 0) as current_stock
    FROM transactions t
    LEFT JOIN sales s ON s.id = t.sale_id
    GROUP BY t.product_id
),
variant_physical_stock AS (
    SELECT 
        v.id as variant_id,
        COALESCE(ls.current_stock, 0)::INT as stock
    FROM website_variants v
    LEFT JOIN lot_summaries ls ON ls.product_id = v.inventory_product_id
),
bundle_stock_calc AS (
    SELECT 
        vb.bundle_variant_id,
        MIN(FLOOR(COALESCE(ls.current_stock, 0) / vb.quantity))::INT as bundle_stock
    FROM website_variant_bundles vb
    LEFT JOIN lot_summaries ls ON ls.product_id = vb.child_inventory_id
    GROUP BY vb.bundle_variant_id
)
SELECT 
    v.id as variant_id,
    v.product_id as parent_product_id,
    v.sku, v.color, v.size, v.inventory_product_id, v.is_bundle,
    CASE 
        WHEN v.is_bundle THEN COALESCE(bs.bundle_stock, 0)
        ELSE COALESCE(vps.stock, 0)
    END as current_stock,
    v.price
FROM website_variants v
LEFT JOIN variant_physical_stock vps ON vps.variant_id = v.id
LEFT JOIN bundle_stock_calc bs ON bs.bundle_variant_id = v.id;

-- 4. RE-IMPLEMENT Order Creation to "Explode" Bundles AND Include Security Phase 3 Logic
DROP FUNCTION IF EXISTS create_atomic_website_order(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, JSONB);
DROP FUNCTION IF EXISTS create_atomic_website_order(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, JSONB, NUMERIC);

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
    v_first_inventory_id UUID;
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

    FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(variant_id UUID, quantity INT) LOOP
        v_variant_price := (SELECT price FROM website_products 
                           WHERE id = (SELECT product_id FROM website_variants WHERE id = v_item.variant_id LIMIT 1));
        v_calculated_subtotal := v_calculated_subtotal + (COALESCE(v_variant_price, 0) * v_item.quantity);
    END LOOP;

    v_calculated_total := v_calculated_subtotal + v_calculated_shipping - p_coins_used;
    IF v_calculated_total < 0 THEN v_calculated_total := 0; END IF;

    -- [C] RECORD CREATION
    v_system_user_id := (SELECT id FROM profiles LIMIT 1);

    -- FIND A VALID INVENTORY ID FOR THE SALES TABLE (to satisfy NOT NULL)
    v_first_inventory_id := (
        SELECT inventory_product_id FROM website_variants WHERE id = (SELECT (p_items->0->>'variant_id')::uuid)
    );
    -- If the first item is a bundle, its inventory_product_id is likely NULL.
    -- We must find the first child of the bundle.
    IF v_first_inventory_id IS NULL THEN
        v_first_inventory_id := (
            SELECT child_inventory_id FROM website_variant_bundles 
            WHERE bundle_variant_id = (SELECT (p_items->0->>'variant_id')::uuid) 
            LIMIT 1
        );
    END IF;
    -- Fallback to any product if absolutely nothing found
    IF v_first_inventory_id IS NULL THEN
        v_first_inventory_id := (SELECT id FROM products LIMIT 1);
    END IF;

    -- Create the Sales Record for the Ledger
    INSERT INTO sales (order_date, customer_name, customer_address, phone1, phone2, cod_amount, destination_branch, parcel_status, product_id, quantity)
    VALUES (CURRENT_DATE, p_customer_name, p_address, p_phone, NULLIF(p_phone2, ''), v_calculated_total, p_city, 'processing', v_first_inventory_id, (SELECT SUM((x->>'quantity')::int) FROM jsonb_array_elements(p_items) AS x))
    RETURNING id INTO v_sale_record_id;

    -- Create the high-level website order
    INSERT INTO website_orders (customer_name, phone, phone2, address, city, payment_method, total_amount, shipping_fee, status, sale_id)
    VALUES (p_customer_name, p_phone, p_phone2, p_address, p_city, p_payment_method, v_calculated_total, v_calculated_shipping, 'processing', v_sale_record_id)
    RETURNING id, order_number INTO v_order_id, v_order_number;

    -- [D] Loop through items and deduct stock
    FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(variant_id UUID, quantity INT, unit_price NUMERIC, product_id BIGINT, product_title TEXT, sku TEXT) LOOP
        
        -- Get variant price again for the order items
        v_variant_price := (SELECT price FROM website_products WHERE id = v_item.product_id LIMIT 1);

        -- Insert website order item
        INSERT INTO website_order_items (order_id, variant_id, product_id, product_title, quantity, unit_price, sku) 
        VALUES (v_order_id, v_item.variant_id, v_item.product_id, v_item.product_title, v_item.quantity, COALESCE(v_variant_price, 0), v_item.sku);

        -- Get variant details (Is it a bundle?)
        SELECT * INTO v_variant_record FROM website_variants WHERE id = v_item.variant_id;

        IF v_variant_record.is_bundle THEN
            -- BUNDLE LOGIC: Deduct each component
            FOR v_sub_item IN (SELECT child_inventory_id, quantity FROM website_variant_bundles WHERE bundle_variant_id = v_item.variant_id) LOOP
                DECLARE
                    v_total_to_deduct INT;
                BEGIN
                    v_total_to_deduct := v_sub_item.quantity * v_item.quantity;

                    -- Record the sale item for the child
                    INSERT INTO sale_items (sale_id, product_id, quantity) VALUES (v_sale_record_id, v_sub_item.child_inventory_id, v_total_to_deduct);

                    -- Process physical lot deduction
                    v_remaining := v_total_to_deduct;
                    FOR v_lot IN (SELECT id, quantity_remaining FROM product_lots WHERE product_id = v_sub_item.child_inventory_id AND quantity_remaining > 0 ORDER BY received_date ASC, id ASC) LOOP
                        EXIT WHEN v_remaining <= 0;
                        v_deduction := LEAST(v_lot.quantity_remaining, v_remaining);
                        UPDATE product_lots SET quantity_remaining = quantity_remaining - v_deduction WHERE id = v_lot.id;
                        INSERT INTO transactions (product_id, lot_id, sale_id, type, quantity_changed, performed_by) 
                        VALUES (v_sub_item.child_inventory_id, v_lot.id, v_sale_record_id, 'sale', -v_deduction, v_system_user_id);
                        v_remaining := v_remaining - v_deduction;
                    END LOOP;
                    IF v_remaining > 0 THEN RAISE EXCEPTION 'INSUFFICIENT_STOCK: Component of %', v_item.product_title; END IF;
                END;
            END LOOP;
        ELSE
            -- STANDARD LOGIC: Deduct single item
            INSERT INTO sale_items (sale_id, product_id, quantity) VALUES (v_sale_record_id, v_variant_record.inventory_product_id, v_item.quantity);
            
            v_remaining := v_item.quantity;
            FOR v_lot IN (SELECT id, quantity_remaining FROM product_lots WHERE product_id = v_variant_record.inventory_product_id AND quantity_remaining > 0 ORDER BY received_date ASC, id ASC) LOOP
                EXIT WHEN v_remaining <= 0;
                v_deduction := LEAST(v_lot.quantity_remaining, v_remaining);
                UPDATE product_lots SET quantity_remaining = quantity_remaining - v_deduction WHERE id = v_lot.id;
                INSERT INTO transactions (product_id, lot_id, sale_id, type, quantity_changed, performed_by) 
                VALUES (v_variant_record.inventory_product_id, v_lot.id, v_sale_record_id, 'sale', -v_deduction, v_system_user_id);
                v_remaining := v_remaining - v_deduction;
            END LOOP;
            IF v_remaining > 0 THEN RAISE EXCEPTION 'INSUFFICIENT_STOCK: %', v_item.product_title; END IF;
        END IF;
    END LOOP;

    RETURN jsonb_build_object('order_id', v_order_id, 'order_number', v_order_number);
END;
$$;

GRANT EXECUTE ON FUNCTION create_atomic_website_order(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, JSONB, NUMERIC) TO public, anon, authenticated;

-- RLS for bundle tables (Already exists but good to ensure)
ALTER TABLE website_variant_bundles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public read bundles" ON website_variant_bundles;
CREATE POLICY "Public read bundles" ON website_variant_bundles FOR SELECT USING (TRUE);
DROP POLICY IF EXISTS "Authenticated full access bundles" ON website_variant_bundles;
CREATE POLICY "Authenticated full access bundles" ON website_variant_bundles FOR ALL USING (auth.role() = 'authenticated');
