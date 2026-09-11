-- =============================================================================
-- SERVER-SIDE PRICING FOR WEBSITE ORDERS (Phase 2 security hardening)
-- =============================================================================
-- Problem: create_atomic_website_order trusted client-supplied unit_price,
-- p_total_amount, p_shipping_fee and p_coins_used. Editing the cart JSON in
-- DevTools (or forging a BuyNow payload) produced Rs.1 orders, free shipping
-- and arbitrary coin discounts. The stock check and coin-balance check were
-- real, but the PRICES were not.
--
-- Fix: same RPC signature (all callers keep working — Checkout COD flow plus
-- PaymentSuccess eSewa/Fonepay flows), but the server now IGNORES the money
-- fields in p_items / p_total_amount / p_shipping_fee and recomputes:
--   - unit price per variant from website_variants.price (fallback: parent
--     website_products.price), incl. the flash-sale discount when
--     website_settings enables it (same math the website uses),
--   - availability gates: product must exist + is_active + NOT is_sold_out,
--     and must allow the requested payment method
--     (COD->allow_cod, eSewa->allow_esewa, Bank Transfer->allow_fonepay;
--     NULL counts as allowed, matching the website),
--   - shipping fee from website_delivery_branches for the order city, with
--     the same single-vendor scope + main-store fallback the website uses,
--   - coins clamped to min(balance, 20% of subtotal+shipping, 150) instead
--     of trusting p_coins_used (over-claims are clamped, not rejected).
-- The authoritative breakdown is returned
-- (subtotal, shipping_fee, coins_used, total_amount) so the website can
-- display the server total instead of its own estimate.
--
-- The pricing core lives in private_compute_order_pricing() so the payment
-- intents migration (fix_payment_intents.sql) reuses the exact same math
-- when it quotes gateway charges. That helper is REVOKED from anon/
-- authenticated — RPCs only.
--
-- HOW TO APPLY: run in Supabase Dashboard -> SQL Editor. Idempotent.
-- Verify with the checks at the bottom.
-- =============================================================================

-- ── 0. Columns the order flow depends on ─────────────────────────────────
-- add_ad_tracking.sql introduced these, but DBs built from the consolidated
-- schema never got them — without this block order creation fails with
-- 'column "is_website" of relation "sales" does not exist'.
ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS is_website BOOLEAN DEFAULT FALSE;
ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS ad_id UUID REFERENCES public.expenses(id) ON DELETE SET NULL;
ALTER TABLE public.website_orders
  ADD COLUMN IF NOT EXISTS ad_id UUID REFERENCES public.expenses(id) ON DELETE SET NULL;

-- ── Pricing core (shared by orders + payment intents) ────────────────────
CREATE OR REPLACE FUNCTION public.private_compute_order_pricing(
    p_items JSONB,
    p_city TEXT,
    p_phone TEXT,
    p_payment_method TEXT
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_in             RECORD;
    v_var            RECORD;
    v_prod           RECORD;
    v_priced_items   JSONB := '[]'::jsonb;
    v_subtotal       NUMERIC := 0;
    v_ship           NUMERIC := 0;
    v_balance        NUMERIC := 0;
    v_coins_allowed  NUMERIC := 0;
    v_coins_used     NUMERIC := 0;
    v_total          NUMERIC := 0;
    v_base_price     NUMERIC;
    v_price          NUMERIC;
    v_method_col     TEXT;
    v_image          TEXT;
    v_flash_enabled  BOOLEAN := false;
    v_flash_end      TIMESTAMPTZ := NULL;
    v_flash_cfg      JSONB := '[]'::jsonb;
    v_setting        TEXT;
    v_flash_discount NUMERIC;
    v_scope_vendor   UUID := NULL;
    v_scope_count    INT := 0;
    v_all_one_vendor BOOLEAN := true;
    v_branch         RECORD;
BEGIN
    -- 0. Payload + payment-method validation
    IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array'
       OR jsonb_array_length(p_items) = 0 THEN
        RAISE EXCEPTION 'EMPTY_CART: no items supplied';
    END IF;

    v_method_col := CASE p_payment_method
        WHEN 'COD' THEN 'allow_cod'
        WHEN 'eSewa' THEN 'allow_esewa'
        WHEN 'Bank Transfer' THEN 'allow_fonepay'
        ELSE NULL
    END;
    IF v_method_col IS NULL THEN
        RAISE EXCEPTION 'INVALID_PAYMENT_METHOD';
    END IF;

    -- 1. Flash-sale config (single read; same rules the website uses)
    SELECT value INTO v_setting FROM public.website_settings
    WHERE key = 'flash_sale_enabled' LIMIT 1;
    IF v_setting = 'true' THEN
        SELECT value INTO v_setting FROM public.website_settings
        WHERE key = 'flash_sale_end' LIMIT 1;
        IF v_setting IS NOT NULL AND v_setting <> '' THEN
            BEGIN
                v_flash_end := replace(v_setting, ' ', 'T')::timestamptz;
            EXCEPTION WHEN OTHERS THEN
                v_flash_end := NULL;
            END;
        END IF;
        IF v_flash_end IS NULL OR v_flash_end > now() THEN
            SELECT value INTO v_setting FROM public.website_settings
            WHERE key = 'flash_sale_config' LIMIT 1;
            BEGIN
                v_flash_cfg := COALESCE(v_setting::jsonb, '[]'::jsonb);
            EXCEPTION WHEN OTHERS THEN
                v_flash_cfg := '[]'::jsonb;
            END;
            IF jsonb_typeof(v_flash_cfg) = 'array' THEN
                v_flash_enabled := true;
            END IF;
        END IF;
    END IF;

    -- 2. Price every line from DB state (client prices ignored)
    FOR v_in IN
        SELECT * FROM jsonb_to_recordset(p_items) AS x(
            variant_id UUID,
            quantity   INT
        )
    LOOP
        IF v_in.variant_id IS NULL THEN
            RAISE EXCEPTION 'INVALID_VARIANT';
        END IF;
        IF v_in.quantity IS NULL OR v_in.quantity < 1 OR v_in.quantity > 1000 THEN
            RAISE EXCEPTION 'INVALID_QUANTITY';
        END IF;

        SELECT * INTO v_var FROM public.website_variants
        WHERE id = v_in.variant_id FOR UPDATE;
        IF v_var.id IS NULL THEN
            RAISE EXCEPTION 'INVALID_VARIANT';
        END IF;

        SELECT * INTO v_prod FROM public.website_products
        WHERE id = v_var.product_id;
        IF v_prod.id IS NULL OR NOT COALESCE(v_prod.is_active, true) THEN
            RAISE EXCEPTION 'PRODUCT_UNAVAILABLE: %', COALESCE(v_prod.title, 'item');
        END IF;
        IF COALESCE(v_prod.is_sold_out, false) THEN
            RAISE EXCEPTION 'PRODUCT_SOLD_OUT: %', v_prod.title;
        END IF;

        -- Payment-method gate (NULL = allowed, matching website semantics)
        IF (v_method_col = 'allow_cod' AND COALESCE(v_prod.allow_cod, true) = false)
        OR (v_method_col = 'allow_esewa' AND COALESCE(v_prod.allow_esewa, true) = false)
        OR (v_method_col = 'allow_fonepay' AND COALESCE(v_prod.allow_fonepay, true) = false) THEN
            RAISE EXCEPTION 'PAYMENT_METHOD_NOT_ALLOWED: %', v_prod.title;
        END IF;

        -- Base price: variant override, else parent product price
        v_base_price := COALESCE(v_var.price, v_prod.price, 0);
        IF v_base_price IS NULL OR v_base_price < 0 THEN
            v_base_price := 0;
        END IF;

        -- Flash-sale discount for this product, if configured
        v_price := v_base_price;
        IF v_flash_enabled THEN
            SELECT SUM(
                CASE WHEN (e.val->>'discount') ~ '^[0-9]+(\.[0-9]+)?$'
                     THEN (e.val->>'discount')::numeric ELSE 0 END
            )
            INTO v_flash_discount
            FROM jsonb_array_elements(v_flash_cfg) AS e(val)
            WHERE (e.val->>'id') ~ '^[0-9]+$'
              AND (e.val->>'id')::bigint = v_prod.id;
            IF v_flash_discount IS NOT NULL
               AND v_flash_discount > 0 AND v_flash_discount < 100 THEN
                v_price := FLOOR(v_base_price - (v_base_price * v_flash_discount / 100));
            END IF;
        END IF;

        v_subtotal := v_subtotal + (v_price * v_in.quantity);

        -- Vendor scope tracking for shipping (mirrors website logic)
        IF v_scope_count = 0 THEN
            v_scope_vendor := v_prod.vendor_id;
        ELSIF v_scope_vendor IS DISTINCT FROM v_prod.vendor_id THEN
            v_all_one_vendor := false;
        END IF;
        v_scope_count := v_scope_count + 1;

        SELECT image_url INTO v_image FROM public.website_product_images
        WHERE product_id = v_prod.id
        ORDER BY is_primary DESC NULLS LAST, sort_order ASC NULLS LAST
        LIMIT 1;

        v_priced_items := v_priced_items || jsonb_build_object(
            'variant_id', v_var.id,
            'product_id', v_prod.id,
            'quantity', v_in.quantity,
            'unit_price', v_price,
            'product_title', v_prod.title,
            'sku', COALESCE(v_var.sku, ''),
            'vendor_id', v_prod.vendor_id,
            'product_image', COALESCE(v_image, ''),
            'is_bundle', COALESCE(v_var.is_bundle, false),
            'inventory_product_id', v_var.inventory_product_id
        );
    END LOOP;

    -- 3. Server-side shipping fee
    IF v_all_one_vendor AND v_scope_vendor IS NOT NULL THEN
        SELECT * INTO v_branch FROM public.website_delivery_branches
        WHERE vendor_id = v_scope_vendor AND city = p_city LIMIT 1;
        IF v_branch.id IS NULL THEN
            SELECT * INTO v_branch FROM public.website_delivery_branches
            WHERE vendor_id IS NULL AND city = p_city LIMIT 1;
        END IF;
    ELSE
        SELECT * INTO v_branch FROM public.website_delivery_branches
        WHERE vendor_id IS NULL AND city = p_city LIMIT 1;
    END IF;
    v_ship := COALESCE(v_branch.shipping_fee, 0);

    -- 4. Coin allowance: min(balance, 20% of subtotal+ship, 150).
    -- Callers clamp their requested coins against coins_allowed.
    SELECT COALESCE(shopy_coins, 0) INTO v_balance
    FROM public.website_customers
    WHERE phone = p_phone
    FOR UPDATE;
    v_balance := COALESCE(v_balance, 0);
    v_coins_allowed := LEAST(v_balance, FLOOR((v_subtotal + v_ship) * 0.20), 150);

    RETURN jsonb_build_object(
        'priced_items', v_priced_items,
        'subtotal', v_subtotal,
        'shipping_fee', v_ship,
        'coin_balance', v_balance,
        'coins_allowed', v_coins_allowed
    );
END;
$$;

-- Pricing helper must never be callable with the anon key directly.
REVOKE ALL ON FUNCTION public.private_compute_order_pricing(JSONB, TEXT, TEXT, TEXT)
FROM PUBLIC, anon, authenticated;

-- ── Atomic order creation (same signature; server reprices) ──────────────
CREATE OR REPLACE FUNCTION public.create_atomic_website_order(
    p_customer_name TEXT,
    p_phone TEXT,
    p_phone2 TEXT,
    p_address TEXT,
    p_city TEXT,
    p_payment_method TEXT,
    -- NOTE: p_shipping_fee / p_total_amount / item unit_price values are
    -- accepted for backwards compatibility but IGNORED for money math.
    p_shipping_fee NUMERIC,
    p_total_amount NUMERIC,
    p_items JSONB,
    p_coins_used NUMERIC DEFAULT 0,
    p_ad_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
    v_total_qty      INT := 0;
    v_first_inv_id   UUID;
    -- priced quote from the shared helper
    v_quote          JSONB;
    v_priced_items   JSONB;
    v_subtotal       NUMERIC;
    v_ship           NUMERIC;
    v_coins_used     NUMERIC;
    v_total          NUMERIC;
    v_qty            RECORD;
BEGIN
    v_quote := public.private_compute_order_pricing(
        p_items, p_city, p_phone, p_payment_method);
    v_priced_items := v_quote->'priced_items';
    v_subtotal     := (v_quote->>'subtotal')::numeric;
    v_ship         := (v_quote->>'shipping_fee')::numeric;

    -- Clamp (never reject): over-claimed coins are cut to the allowed max.
    v_coins_used := LEAST(COALESCE(p_coins_used, 0),
                          (v_quote->>'coins_allowed')::numeric);
    IF v_coins_used < 0 THEN
        v_coins_used := 0;
    END IF;

    v_total := v_subtotal + v_ship - v_coins_used;

    -- Total quantity for the legacy sales.quantity column
    FOR v_qty IN
        SELECT * FROM jsonb_to_recordset(v_priced_items) AS x(quantity INT)
    LOOP
        v_total_qty := v_total_qty + v_qty.quantity;
    END LOOP;

    -- System user (first admin, for inventory tx attribution)
    SELECT id INTO v_system_user_id
    FROM public.profiles
    WHERE role = 'admin'
    LIMIT 1;

    -- First item's inventory id for the legacy sales.product_id column
    SELECT COALESCE(
        (v_priced_items->0->>'inventory_product_id')::UUID,
        (SELECT child_inventory_id FROM public.website_variant_bundles
         WHERE bundle_variant_id = (v_priced_items->0->>'variant_id')::UUID LIMIT 1)
    )
    INTO v_first_inv_id;

    -- INSERT INTO SALES (server total)
    INSERT INTO public.sales (
        order_date, customer_name, customer_address, phone1, phone2,
        cod_amount, destination_branch, parcel_status,
        product_id, quantity, is_website, ad_id
    ) VALUES (
        CURRENT_DATE, p_customer_name, p_address, p_phone, NULLIF(p_phone2, ''),
        v_total, p_city, 'processing',
        v_first_inv_id, v_total_qty, TRUE, p_ad_id
    ) RETURNING id INTO v_sale_record_id;

    -- INSERT INTO WEBSITE_ORDERS (server total + fee)
    INSERT INTO public.website_orders (
        customer_name, phone, phone2, address, city, payment_method,
        total_amount, shipping_fee, status, sale_id, ad_id
    ) VALUES (
        p_customer_name, p_phone, NULLIF(p_phone2, ''), p_address, p_city,
        p_payment_method, v_total, v_ship, 'processing', v_sale_record_id, p_ad_id
    ) RETURNING id, order_number INTO v_order_id, v_order_number;

    -- PROCESS PRICED ITEMS & DEDUCT STOCK
    FOR v_item IN
        SELECT * FROM jsonb_to_recordset(v_priced_items) AS x(
            variant_id           UUID,
            product_id           BIGINT,
            quantity             INT,
            unit_price           NUMERIC,
            product_title        TEXT,
            sku                  TEXT,
            vendor_id            UUID,
            product_image        TEXT,
            is_bundle            BOOLEAN,
            inventory_product_id UUID
        )
    LOOP
        INSERT INTO public.website_order_items (
            order_id, variant_id, product_id, product_title, quantity,
            unit_price, sku, vendor_id, product_image
        )
        VALUES (
            v_order_id, v_item.variant_id, v_item.product_id, v_item.product_title,
            v_item.quantity, v_item.unit_price, v_item.sku, v_item.vendor_id,
            COALESCE(v_item.product_image, '')
        );

        IF v_item.is_bundle THEN
            FOR v_sub_item IN
                SELECT child_inventory_id, quantity
                FROM public.website_variant_bundles
                WHERE bundle_variant_id = v_item.variant_id
            LOOP
                v_remaining := v_sub_item.quantity * v_item.quantity;

                INSERT INTO public.sale_items (sale_id, product_id, quantity, vendor_id)
                VALUES (v_sale_record_id, v_sub_item.child_inventory_id, v_remaining,
                        (SELECT vendor_id FROM public.products WHERE id = v_sub_item.child_inventory_id));

                FOR v_lot IN (
                    SELECT id, quantity_remaining
                    FROM public.product_lots
                    WHERE product_id = v_sub_item.child_inventory_id
                    AND quantity_remaining > 0
                    ORDER BY received_date ASC, id ASC
                    FOR UPDATE
                ) LOOP
                    v_deduction := LEAST(v_remaining, v_lot.quantity_remaining);
                    UPDATE public.product_lots
                    SET quantity_remaining = quantity_remaining - v_deduction
                    WHERE id = v_lot.id;
                    v_remaining := v_remaining - v_deduction;

                    INSERT INTO public.transactions (product_id, type, quantity_changed, lot_id, sale_id, performed_by)
                    VALUES (v_sub_item.child_inventory_id, 'sale', -v_deduction, v_lot.id, v_sale_record_id, v_system_user_id);

                    EXIT WHEN v_remaining = 0;
                END LOOP;

                IF v_remaining > 0 THEN
                    RAISE EXCEPTION 'INSUFFICIENT_STOCK: %', v_item.product_title;
                END IF;
            END LOOP;
        ELSE
            IF v_item.inventory_product_id IS NULL THEN
                RAISE EXCEPTION 'MISSING_INVENTORY_LINK: %', v_item.product_title;
            END IF;

            v_remaining := v_item.quantity;

            INSERT INTO public.sale_items (sale_id, product_id, quantity, vendor_id)
            VALUES (
                v_sale_record_id,
                v_item.inventory_product_id,
                v_remaining,
                (SELECT vendor_id FROM public.products WHERE id = v_item.inventory_product_id)
            );

            FOR v_lot IN (
                SELECT id, quantity_remaining
                FROM public.product_lots
                WHERE product_id = v_item.inventory_product_id
                AND quantity_remaining > 0
                ORDER BY received_date ASC, id ASC
                FOR UPDATE
            ) LOOP
                v_deduction := LEAST(v_remaining, v_lot.quantity_remaining);
                UPDATE public.product_lots
                SET quantity_remaining = quantity_remaining - v_deduction
                WHERE id = v_lot.id;
                v_remaining := v_remaining - v_deduction;

                INSERT INTO public.transactions (product_id, type, quantity_changed, lot_id, sale_id, performed_by)
                VALUES (v_item.inventory_product_id, 'sale', -v_deduction, v_lot.id, v_sale_record_id, v_system_user_id);

                EXIT WHEN v_remaining = 0;
            END LOOP;

            IF v_remaining > 0 THEN
                RAISE EXCEPTION 'INSUFFICIENT_STOCK: %', v_item.product_title;
            END IF;
        END IF;
    END LOOP;

    -- Deduct clamped coins
    IF v_coins_used > 0 THEN
        UPDATE public.website_customers
        SET shopy_coins = shopy_coins - v_coins_used
        WHERE phone = p_phone;

        INSERT INTO public.coin_transactions (customer_phone, amount, type, description)
        VALUES (p_phone, -v_coins_used, 'burn', 'Order #' || v_order_number);
    END IF;

    -- Authoritative result
    RETURN jsonb_build_object(
        'success',      true,
        'sale_id',      v_sale_record_id,
        'order_id',     v_order_id,
        'order_number', v_order_number,
        'subtotal',     v_subtotal,
        'shipping_fee', v_ship,
        'coins_used',   v_coins_used,
        'total_amount', v_total
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_atomic_website_order(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, JSONB, NUMERIC, UUID) TO public, anon, authenticated;

-- =============================================================================
-- VERIFY (Supabase SQL Editor, after applying):
--   SELECT oid::regprocedure FROM pg_proc WHERE proname = 'create_atomic_website_order';
--   -- expect: ...(text x6, numeric, numeric, jsonb, numeric, uuid)
--   SELECT has_function_privilege('anon',
--     'public.private_compute_order_pricing(JSONB,TEXT,TEXT,TEXT)', 'EXECUTE');
--   -- expect: f (helper locked away)
-- =============================================================================
