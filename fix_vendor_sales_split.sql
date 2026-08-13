-- =============================================================================
-- FIX: Website orders go to their vendors specifically; vendor-only sales
-- =============================================================================
-- Without this, create_atomic_website_order never set vendor_id on
-- website_order_items, so vendors saw NO orders in their portal (their RLS
-- policy requires vendor_id = auth.uid()), and sale_items had no vendor link
-- for the vendor sales view.
-- =============================================================================

-- 1. Add vendor_id to sale_items (products have it; link sale_items to vendor)
ALTER TABLE public.sale_items ADD COLUMN IF NOT EXISTS vendor_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE;

-- 2. Backfill vendor_id on EXISTING website_order_items (from website_products)
UPDATE public.website_order_items woi
SET vendor_id = wp.vendor_id
FROM public.website_products wp
WHERE woi.product_id = wp.id AND woi.vendor_id IS NULL;

-- 3. Backfill vendor_id on EXISTING sale_items (from products)
UPDATE public.sale_items si
SET vendor_id = p.vendor_id
FROM public.products p
WHERE si.product_id = p.id AND si.vendor_id IS NULL;

-- 3b. Backfill product_image on EXISTING website_order_items so customer
--     order cards on the website can show the product photo.
UPDATE public.website_order_items woi
SET product_image = img.image_url
FROM (
    SELECT wp.id,
           (SELECT wpi.image_url FROM public.website_product_images wpi
            WHERE wpi.product_id = wp.id
            ORDER BY wpi.is_primary DESC, wpi.sort_order ASC
            LIMIT 1) AS image_url
    FROM public.website_products wp
) img
WHERE woi.product_id = img.id
  AND (woi.product_image IS NULL OR woi.product_image = '');

-- 4. RLS POLICIES so vendors can read/manage their own orders & sales --

-- website_order_items: vendors can read their own items
DROP POLICY IF EXISTS "Vendors read own order items" ON public.website_order_items;
CREATE POLICY "Vendors read own order items" ON public.website_order_items FOR SELECT TO authenticated
  USING (vendor_id = auth.uid());

-- sales: vendors can read sales that contain their products
DROP POLICY IF EXISTS "Vendors read own sales" ON public.sales;
CREATE POLICY "Vendors read own sales" ON public.sales FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.sale_items si
      JOIN public.products p ON p.id = si.product_id
      WHERE si.sale_id = sales.id AND p.vendor_id = auth.uid()
    )
  );

-- sales: vendors can update the status of sales containing their products
DROP POLICY IF EXISTS "Vendors update own sales" ON public.sales;
CREATE POLICY "Vendors update own sales" ON public.sales FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.sale_items si
      JOIN public.products p ON p.id = si.product_id
      WHERE si.sale_id = sales.id AND p.vendor_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.sale_items si
      JOIN public.products p ON p.id = si.product_id
      WHERE si.sale_id = sales.id AND p.vendor_id = auth.uid()
    )
  );

-- sale_items: vendors can read their own sale items
DROP POLICY IF EXISTS "Vendors read own sale items" ON public.sale_items;
CREATE POLICY "Vendors read own sale items" ON public.sale_items FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.products p WHERE p.id = sale_items.product_id AND p.vendor_id = auth.uid())
    OR vendor_id = auth.uid()
  );

-- transactions: vendors can read transactions for their own products
DROP POLICY IF EXISTS "Vendors read own transactions" ON public.transactions;
CREATE POLICY "Vendors read own transactions" ON public.transactions FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.products p WHERE p.id = transactions.product_id AND p.vendor_id = auth.uid())
  );

-- 5. Recreate the order RPC so new orders tag vendor_id on order items & sale_items
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
-- SELECT id, vendor_id, product_id FROM website_order_items WHERE order_id = <id>;
-- SELECT tablename, policyname, cmd FROM pg_policies WHERE schemaname='public' AND tablename IN ('sales','sale_items','transactions','website_order_items') ORDER BY tablename;
