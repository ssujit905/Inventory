-- =============================================================================
-- FIX: Website orders not showing in vendor orders page (owner + staff)
-- =============================================================================
-- Diagnosis (2026-08-16): create_atomic_website_order does NOT tag
-- website_order_items.vendor_id, and existing items were never backfilled,
-- so vendor queries (.eq('website_order_items.vendor_id', ...)) and vendor RLS
-- (vendor_team_read_order_items USING vendor_id = current_vendor_id()) match
-- nothing. Sales still show because the sales page filters via products.vendor_id.
--
-- 1. Backfill vendor_id on existing order items (from website_products)
-- 2. Recreate create_atomic_website_order so NEW orders tag vendor_id
-- =============================================================================

-- 1. Backfill existing website_order_items
UPDATE public.website_order_items woi
SET vendor_id = wp.vendor_id
FROM public.website_products wp
WHERE woi.product_id = wp.id AND woi.vendor_id IS NULL;

-- 2. Recreate the order RPC so new orders tag vendor_id on order items
CREATE OR REPLACE FUNCTION create_atomic_website_order(
    p_customer_name TEXT, p_phone TEXT, p_phone2 TEXT, p_address TEXT, p_city TEXT,
    p_payment_method TEXT, p_shipping_fee NUMERIC, p_total_amount NUMERIC, p_items JSONB,
    p_coins_used NUMERIC DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_order_id       BIGINT;
    v_order_number   TEXT;
    v_item           RECORD;
    v_sub_item       RECORD;
    v_remaining      INT;
    v_lot            RECORD;
    v_deduction      INT;
    v_system_user_id UUID;
    v_sale_record_id UUID;
    v_variant_record RECORD;
    v_current_coins  NUMERIC;
    v_total_qty      INT;
    v_first_inv_id   UUID;
    v_item_vendor    UUID;
    v_item_image     TEXT;
BEGIN
    -- 1️⃣ SECURE COIN VERIFICATION
    IF p_coins_used > 0 THEN
        SELECT COALESCE(shopy_coins, 0)
        INTO v_current_coins
        FROM website_customers
        WHERE phone = p_phone
        FOR UPDATE;

        IF v_current_coins < p_coins_used THEN
            RAISE EXCEPTION 'INSUFFICIENT_COINS';
        END IF;
    END IF;

    -- 2️⃣ INITIALIZE SYSTEM USER (First admin)
    SELECT id INTO v_system_user_id
    FROM profiles
    WHERE role = 'admin'
    LIMIT 1;

    -- Calculate total quantity across all items
    SELECT COALESCE(SUM((x->>'quantity')::int), 0)
    INTO v_total_qty
    FROM jsonb_array_elements(p_items) AS x;

    -- Get the first item's inventory_product_id for the legacy sales column
    SELECT COALESCE(
        wv.inventory_product_id,
        (SELECT child_inventory_id FROM website_variant_bundles WHERE bundle_variant_id = wv.id LIMIT 1)
    )
    INTO v_first_inv_id
    FROM website_variants wv
    WHERE wv.id = (p_items->0->>'variant_id')::UUID
    LIMIT 1;

    -- 3️⃣ INSERT INTO SALES (using correct column names)
    INSERT INTO sales (
        order_date,
        customer_name,
        customer_address,
        phone1,
        phone2,
        cod_amount,
        destination_branch,
        parcel_status,
        product_id,
        quantity
    ) VALUES (
        CURRENT_DATE,
        p_customer_name,
        p_address,
        p_phone,
        NULLIF(p_phone2, ''),
        p_total_amount,
        p_city,
        'processing',
        v_first_inv_id,
        v_total_qty
    ) RETURNING id INTO v_sale_record_id;

    -- 4️⃣ INSERT INTO WEBSITE_ORDERS (stores payment_method, shipping_fee, etc.)
    INSERT INTO website_orders (
        customer_name,
        phone,
        phone2,
        address,
        city,
        payment_method,
        total_amount,
        shipping_fee,
        status,
        sale_id
    ) VALUES (
        p_customer_name,
        p_phone,
        NULLIF(p_phone2, ''),
        p_address,
        p_city,
        p_payment_method,
        p_total_amount,
        p_shipping_fee,
        'processing',
        v_sale_record_id
    ) RETURNING id, order_number INTO v_order_id, v_order_number;

    -- 5️⃣ PROCESS ITEMS & DEDUCT STOCK
    FOR v_item IN
        SELECT *
        FROM jsonb_to_recordset(p_items) AS x(
            variant_id    UUID,
            quantity      INT,
            unit_price    NUMERIC,
            product_id    BIGINT,
            product_title TEXT,
            sku           TEXT
        )
    LOOP
        -- Get variant with row lock
        SELECT * INTO v_variant_record
        FROM website_variants
        WHERE id = v_item.variant_id
        FOR UPDATE;

        -- Determine the vendor that owns this item's product
        SELECT vendor_id INTO v_item_vendor
        FROM website_products
        WHERE id = v_item.product_id
        LIMIT 1;

        -- Primary product image for the customer's order card
        SELECT image_url INTO v_item_image
        FROM website_product_images
        WHERE product_id = v_item.product_id
        ORDER BY is_primary DESC, sort_order ASC
        LIMIT 1;

        -- Insert website order item WITH vendor_id and image
        INSERT INTO website_order_items (
            order_id, variant_id, product_id, product_title, quantity, unit_price, sku, vendor_id, product_image
        )
        VALUES (
            v_order_id, v_item.variant_id, v_item.product_id, v_item.product_title,
            v_item.quantity, v_item.unit_price, v_item.sku, v_item_vendor, COALESCE(v_item_image, '')
        );

        -- A. Handle Combo/Bundle Products
        IF v_variant_record.is_bundle THEN
            FOR v_sub_item IN
                SELECT child_inventory_id, quantity
                FROM website_variant_bundles
                WHERE bundle_variant_id = v_variant_record.id
            LOOP
                v_remaining := v_sub_item.quantity * v_item.quantity;

                -- Record physical item link for the Sales Dashboard (with vendor)
                INSERT INTO sale_items (sale_id, product_id, quantity, vendor_id)
                VALUES (v_sale_record_id, v_sub_item.child_inventory_id, v_remaining,
                        (SELECT vendor_id FROM products WHERE id = v_sub_item.child_inventory_id));

                FOR v_lot IN (
                    SELECT id, quantity_remaining
                    FROM product_lots
                    WHERE product_id = v_sub_item.child_inventory_id
                    AND quantity_remaining > 0
                    ORDER BY received_date ASC, id ASC
                    FOR UPDATE
                ) LOOP
                    v_deduction := LEAST(v_remaining, v_lot.quantity_remaining);
                    UPDATE product_lots
                    SET quantity_remaining = quantity_remaining - v_deduction
                    WHERE id = v_lot.id;
                    v_remaining := v_remaining - v_deduction;

                    INSERT INTO transactions (product_id, type, quantity_changed, lot_id, sale_id, performed_by)
                    VALUES (v_sub_item.child_inventory_id, 'sale', -v_deduction, v_lot.id, v_sale_record_id, v_system_user_id);

                    EXIT WHEN v_remaining = 0;
                END LOOP;

                IF v_remaining > 0 THEN
                    RAISE EXCEPTION 'INSUFFICIENT_STOCK: %', v_item.product_title;
                END IF;
            END LOOP;

        -- B. Handle Standard / Custom Products
        ELSE
            IF v_variant_record.inventory_product_id IS NULL THEN
                RAISE EXCEPTION 'MISSING_INVENTORY_LINK: %', v_item.product_title;
            END IF;

            v_remaining := v_item.quantity;

            -- Record physical item link for the Sales Dashboard (with vendor)
            INSERT INTO sale_items (sale_id, product_id, quantity, vendor_id)
            VALUES (
                v_sale_record_id,
                v_variant_record.inventory_product_id,
                v_remaining,
                (SELECT vendor_id FROM products WHERE id = v_variant_record.inventory_product_id)
            );

            FOR v_lot IN (
                SELECT id, quantity_remaining
                FROM product_lots
                WHERE product_id = v_variant_record.inventory_product_id
                AND quantity_remaining > 0
                ORDER BY received_date ASC, id ASC
                FOR UPDATE
            ) LOOP
                v_deduction := LEAST(v_remaining, v_lot.quantity_remaining);
                UPDATE product_lots
                SET quantity_remaining = quantity_remaining - v_deduction
                WHERE id = v_lot.id;
                v_remaining := v_remaining - v_deduction;

                INSERT INTO transactions (product_id, type, quantity_changed, lot_id, sale_id, performed_by)
                VALUES (v_variant_record.inventory_product_id, 'sale', -v_deduction, v_lot.id, v_sale_record_id, v_system_user_id);

                EXIT WHEN v_remaining = 0;
            END LOOP;

            IF v_remaining > 0 THEN
                RAISE EXCEPTION 'INSUFFICIENT_STOCK: %', v_item.product_title;
            END IF;
        END IF;

    END LOOP;

    -- 6️⃣ DEDUCT COINS IF USED
    IF p_coins_used > 0 THEN
        UPDATE website_customers
        SET shopy_coins = shopy_coins - p_coins_used
        WHERE phone = p_phone;

        INSERT INTO coin_transactions (customer_phone, amount, type, description)
        VALUES (p_phone, -p_coins_used, 'burn', 'Order #' || v_order_number);
    END IF;

    -- 7️⃣ RETURN SUCCESS
    RETURN jsonb_build_object(
        'success',      true,
        'sale_id',      v_sale_record_id,
        'order_id',     v_order_id,
        'order_number', v_order_number
    );
END;
$$;

-- Re-grant (recreated function loses grants)
GRANT EXECUTE ON FUNCTION create_atomic_website_order(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, JSONB, NUMERIC) TO public, anon, authenticated;

-- Verification:
-- SELECT id, order_id, vendor_id FROM website_order_items ORDER BY id DESC;