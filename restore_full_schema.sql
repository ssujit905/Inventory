-- =============================================================================
-- COMPLETE SUPABASE SCHEMA RESTORATION FOR INVENTORY APP
-- =============================================================================

-- 1. EXTENSIONS & SCHEMA GRANTS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

GRANT USAGE ON SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL ON SCHEMA public TO postgres, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO postgres, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres, anon, authenticated, service_role;

-- 2. CORE TABLES
-- Profiles
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name TEXT,
    email TEXT,
    store_name TEXT,
    role TEXT CHECK (role IN ('admin', 'staff', 'vendor')) DEFAULT 'staff',
    permissions TEXT CHECK (permissions IN ('read_only', 'read_write')) DEFAULT 'read_write',
    vendor_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    phone TEXT,
    whatsapp TEXT,
    address TEXT,
    city TEXT,
    description TEXT,
    bank_name TEXT,
    bank_account_holder TEXT,
    bank_account_number TEXT,
    bank_branch TEXT,
    esewa_id TEXT,
    plan TEXT DEFAULT 'free',
    avatar_url TEXT,
    is_verified BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Products (Physical inventory)
CREATE TABLE IF NOT EXISTS public.products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    sku TEXT UNIQUE NOT NULL,
    description TEXT,
    image_url TEXT,
    min_stock_alert INT DEFAULT 10,
    vendor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Product Lots (Batch tracking)
CREATE TABLE IF NOT EXISTS public.product_lots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID REFERENCES public.products(id) ON DELETE CASCADE NOT NULL,
    lot_number TEXT NOT NULL,
    expiry_date DATE,
    quantity_remaining INT DEFAULT 0 CHECK (quantity_remaining >= 0),
    cost_price DECIMAL(10, 2) DEFAULT 0.00,
    received_date TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    created_by UUID REFERENCES public.profiles(id)
);

-- Expenses
CREATE TABLE IF NOT EXISTS public.expenses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    description TEXT NOT NULL,
    amount DECIMAL(10, 2) NOT NULL,
    expense_date DATE NOT NULL,
    recorded_by UUID REFERENCES public.profiles(id),
    vendor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Sales
CREATE TABLE IF NOT EXISTS public.sales (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_date DATE NOT NULL,
    destination_branch TEXT NOT NULL,
    parcel_status TEXT CHECK (parcel_status IN ('processing', 'sent', 'delivered', 'returned', 'cancelled')) DEFAULT 'processing',
    customer_name TEXT NOT NULL,
    customer_address TEXT NOT NULL,
    phone1 TEXT NOT NULL CHECK (length(phone1) = 10),
    phone2 TEXT CHECK (phone2 IS NULL OR length(phone2) = 10),
    cod_amount DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    sold_amount DECIMAL(10, 2),
    return_cost DECIMAL(10, 2),
    notes TEXT,
    payment_status TEXT DEFAULT 'unpaid',
    ad_id UUID REFERENCES public.expenses(id) ON DELETE SET NULL,
    product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
    quantity INT,
    recorded_by UUID REFERENCES public.profiles(id),
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Sale Items (Multi-item and vendor attribution)
CREATE TABLE IF NOT EXISTS public.sale_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sale_id UUID REFERENCES public.sales(id) ON DELETE CASCADE,
    product_id UUID REFERENCES public.products(id) ON DELETE RESTRICT,
    quantity INT NOT NULL CHECK (quantity > 0),
    sold_amount DECIMAL(10, 2),
    vendor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Transactions (Stock history ledger)
CREATE TABLE IF NOT EXISTS public.transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID REFERENCES public.products(id) ON DELETE CASCADE NOT NULL,
    lot_id UUID REFERENCES public.product_lots(id) ON DELETE SET NULL,
    sale_id UUID REFERENCES public.sales(id) ON DELETE SET NULL,
    type TEXT CHECK (type IN ('in', 'sale', 'adjustment', 'expiry', 'return', 'exchange', 'cancel')) NOT NULL,
    quantity_changed INT NOT NULL,
    performed_by UUID REFERENCES public.profiles(id),
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Income Entries
CREATE TABLE IF NOT EXISTS public.income_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    description TEXT NOT NULL,
    amount DECIMAL(10, 2) NOT NULL,
    income_date DATE NOT NULL,
    category TEXT,
    recorded_by UUID REFERENCES public.profiles(id),
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- 3. WEBSITE & E-COMMERCE TABLES
-- Website Products
CREATE TABLE IF NOT EXISTS public.website_products (
    id BIGSERIAL PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT DEFAULT '',
    price NUMERIC(10, 2) NOT NULL DEFAULT 0,
    original_price NUMERIC(10, 2) DEFAULT NULL,
    category TEXT DEFAULT 'General',
    city TEXT DEFAULT 'Kathmandu',
    delivery_days TEXT DEFAULT '2-4',
    is_active BOOLEAN DEFAULT TRUE,
    is_prepaid BOOLEAN DEFAULT FALSE,
    is_prebook BOOLEAN DEFAULT FALSE,
    allow_cod BOOLEAN DEFAULT TRUE,
    allow_esewa BOOLEAN DEFAULT TRUE,
    allow_fonepay BOOLEAN DEFAULT TRUE,
    is_sold_out BOOLEAN DEFAULT FALSE,
    sold_count INTEGER DEFAULT 0,
    sizes TEXT DEFAULT '',
    colors TEXT DEFAULT '',
    vendor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    ad_id UUID REFERENCES public.expenses(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Website Product Images
CREATE TABLE IF NOT EXISTS public.website_product_images (
    id BIGSERIAL PRIMARY KEY,
    product_id BIGINT REFERENCES public.website_products(id) ON DELETE CASCADE,
    image_url TEXT NOT NULL,
    is_primary BOOLEAN DEFAULT FALSE,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Website Product Variations
CREATE TABLE IF NOT EXISTS public.website_product_variations (
    id BIGSERIAL PRIMARY KEY,
    product_id BIGINT REFERENCES public.website_products(id) ON DELETE CASCADE,
    label TEXT NOT NULL,
    value TEXT NOT NULL,
    sort_order INTEGER DEFAULT 0
);

-- Website Variants (Linked to physical inventory product)
CREATE TABLE IF NOT EXISTS public.website_variants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id BIGINT REFERENCES public.website_products(id) ON DELETE CASCADE,
    color TEXT DEFAULT 'Standard',
    size TEXT DEFAULT 'Universal',
    sku TEXT,
    price NUMERIC DEFAULT NULL,
    inventory_product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
    is_bundle BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Website Variant Bundles (Combos)
CREATE TABLE IF NOT EXISTS public.website_variant_bundles (
    id BIGSERIAL PRIMARY KEY,
    bundle_variant_id UUID REFERENCES public.website_variants(id) ON DELETE CASCADE,
    child_inventory_id UUID REFERENCES public.products(id) ON DELETE CASCADE,
    quantity INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(bundle_variant_id, child_inventory_id)
);

-- Website Orders
CREATE TABLE IF NOT EXISTS public.website_orders (
    id BIGSERIAL PRIMARY KEY,
    order_number TEXT NOT NULL UNIQUE DEFAULT CONCAT('WO-', LPAD(FLOOR(RANDOM()*900000+100000)::TEXT, 6, '0')),
    customer_name TEXT NOT NULL,
    email TEXT DEFAULT '',
    phone TEXT NOT NULL,
    phone2 TEXT DEFAULT '',
    address TEXT NOT NULL,
    city TEXT DEFAULT 'Kathmandu',
    payment_method TEXT DEFAULT 'COD',
    payment_status TEXT DEFAULT 'pending',
    status TEXT DEFAULT 'processing' CHECK (status IN ('processing','sent','delivered','returned','cancelled')),
    total_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
    shipping_fee NUMERIC(10,2) NOT NULL DEFAULT 0,
    notes TEXT DEFAULT '',
    sale_id UUID REFERENCES public.sales(id) ON DELETE SET NULL,
    ad_id UUID REFERENCES public.expenses(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Website Order Items
CREATE TABLE IF NOT EXISTS public.website_order_items (
    id BIGSERIAL PRIMARY KEY,
    order_id BIGINT REFERENCES public.website_orders(id) ON DELETE CASCADE,
    variant_id UUID REFERENCES public.website_variants(id) ON DELETE SET NULL,
    product_id BIGINT REFERENCES public.website_products(id) ON DELETE SET NULL,
    product_title TEXT NOT NULL,
    product_image TEXT DEFAULT '',
    quantity INTEGER NOT NULL DEFAULT 1,
    unit_price NUMERIC(10,2) NOT NULL DEFAULT 0,
    sku TEXT DEFAULT '',
    vendor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL
);

-- Website Order Returns
CREATE TABLE IF NOT EXISTS public.website_order_returns (
    id BIGSERIAL PRIMARY KEY,
    order_id BIGINT REFERENCES public.website_orders(id) ON DELETE SET NULL,
    order_number TEXT,
    customer_phone TEXT,
    type TEXT,
    message TEXT,
    media JSONB DEFAULT '[]'::jsonb,
    status TEXT DEFAULT 'pending',
    admin_notes TEXT,
    vendor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Website Customers
CREATE TABLE IF NOT EXISTS public.website_customers (
    phone TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    pin_hash TEXT,
    address TEXT,
    city TEXT,
    shopy_coins NUMERIC DEFAULT 0,
    login_attempts INT DEFAULT 0,
    locked_until TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Customer Sessions
CREATE TABLE IF NOT EXISTS public.customer_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_phone TEXT NOT NULL REFERENCES public.website_customers(phone) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Website OTPs
CREATE TABLE IF NOT EXISTS public.website_otps (
    phone TEXT PRIMARY KEY,
    otp_code TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Coin Transactions
CREATE TABLE IF NOT EXISTS public.coin_transactions (
    id BIGSERIAL PRIMARY KEY,
    customer_phone TEXT NOT NULL REFERENCES public.website_customers(phone) ON DELETE CASCADE,
    amount NUMERIC NOT NULL DEFAULT 0,
    type TEXT NOT NULL DEFAULT 'adjustment',
    description TEXT,
    reference_id TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Website Delivery Branches
CREATE TABLE IF NOT EXISTS public.website_delivery_branches (
    id BIGSERIAL PRIMARY KEY,
    city TEXT NOT NULL UNIQUE,
    coverage_area TEXT DEFAULT 'All over the city',
    shipping_fee NUMERIC(10,2) DEFAULT 0,
    vendor_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    delivery_time TEXT DEFAULT '2-4 Days',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Website Settings
CREATE TABLE IF NOT EXISTS public.website_settings (
    key TEXT PRIMARY KEY,
    value TEXT DEFAULT '',
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Website Product Ratings
CREATE TABLE IF NOT EXISTS public.website_product_ratings (
    id BIGSERIAL PRIMARY KEY,
    order_id BIGINT REFERENCES public.website_orders(id) ON DELETE SET NULL,
    product_id BIGINT REFERENCES public.website_products(id) ON DELETE CASCADE,
    customer_phone TEXT,
    customer_name TEXT,
    rating NUMERIC NOT NULL,
    comment TEXT,
    reward_status TEXT DEFAULT 'pending',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. CHATBOT TABLES
CREATE TABLE IF NOT EXISTS public.chatbot_products (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    price DECIMAL(10, 2) DEFAULT 0.00,
    sizes TEXT[] DEFAULT '{}',
    image_url TEXT,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, NOW()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.chatbot_faqs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    question TEXT NOT NULL,
    answer TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, NOW()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.chatbot_notifications (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    customer_name TEXT,
    psid TEXT,
    last_message TEXT,
    status TEXT CHECK (status IN ('unresolved', 'resolved')) DEFAULT 'unresolved',
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, NOW()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.chatbot_shortcuts (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    label TEXT NOT NULL,
    payload TEXT NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, NOW()) NOT NULL
);

-- 5. VIEWS
-- Inventory Stock View
DROP VIEW IF EXISTS public.inventory_stock_view CASCADE;
CREATE OR REPLACE VIEW public.inventory_stock_view WITH (security_invoker = true) AS
SELECT
    p.id,
    p.name,
    p.sku,
    p.description,
    p.image_url,
    p.vendor_id,
    COALESCE(SUM(pl.quantity_remaining), 0)::INT AS available_stock
FROM public.products p
LEFT JOIN public.product_lots pl ON pl.product_id = p.id
GROUP BY p.id, p.name, p.sku, p.description, p.image_url, p.vendor_id;

-- Website Variant Stock View
DROP VIEW IF EXISTS public.website_variant_stock_view CASCADE;
CREATE OR REPLACE VIEW public.website_variant_stock_view
WITH (security_invoker = on) AS
WITH lot_summaries AS (
    SELECT id, available_stock FROM public.inventory_stock_view
),
bundle_stock_calc AS (
    SELECT
        vb.bundle_variant_id,
        MIN(FLOOR(COALESCE(ls.available_stock, 0) / vb.quantity))::INT AS bundle_stock
    FROM public.website_variant_bundles vb
    LEFT JOIN lot_summaries ls ON ls.id = vb.child_inventory_id
    GROUP BY vb.bundle_variant_id
)
SELECT
    v.id              AS variant_id,
    v.product_id      AS parent_product_id,
    v.color,
    v.size,
    v.sku,
    v.price,
    v.inventory_product_id,
    v.is_bundle,
    CASE
        WHEN v.is_bundle THEN COALESCE(bs.bundle_stock, 0)
        ELSE COALESCE(ls.available_stock, 0)
    END AS current_stock
FROM public.website_variants v
LEFT JOIN bundle_stock_calc bs ON bs.bundle_variant_id = v.id
LEFT JOIN lot_summaries     ls ON ls.id = v.inventory_product_id;

-- Vendor Store Profiles View
DROP VIEW IF EXISTS public.vendor_store_profiles CASCADE;
CREATE OR REPLACE VIEW public.vendor_store_profiles
WITH (security_invoker = on) AS
SELECT
    id,
    store_name,
    full_name,
    avatar_url,
    is_verified,
    phone,
    whatsapp,
    address,
    city,
    description,
    created_at
FROM public.profiles;

GRANT SELECT ON public.vendor_store_profiles TO anon, authenticated;

-- 6. HELPER FUNCTIONS
-- is_admin_or_staff()
CREATE OR REPLACE FUNCTION public.is_admin_or_staff()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = auth.uid()
      AND role IN ('admin', 'staff')
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_admin_or_staff() TO anon, authenticated;

-- current_vendor_id()
CREATE OR REPLACE FUNCTION public.current_vendor_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN p.role = 'vendor' THEN p.id
    WHEN p.role = 'staff' AND p.vendor_id IS NOT NULL THEN p.vendor_id
    ELSE NULL
  END
  FROM public.profiles p
  WHERE p.id = auth.uid();
$$;

GRANT EXECUTE ON FUNCTION public.current_vendor_id() TO anon, authenticated;

-- is_vendor_member(owner_id)
CREATE OR REPLACE FUNCTION public.is_vendor_member(owner_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT owner_id = public.current_vendor_id();
$$;

GRANT EXECUTE ON FUNCTION public.is_vendor_member(UUID) TO anon, authenticated;

-- create_vendor_staff_profile
CREATE OR REPLACE FUNCTION public.create_vendor_staff_profile(
    p_user_id UUID,
    p_full_name TEXT,
    p_email TEXT,
    p_permissions TEXT,
    p_vendor_id UUID
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF p_permissions NOT IN ('read_only', 'read_write') THEN
        RAISE EXCEPTION 'Invalid permissions level.';
    END IF;

    IF p_vendor_id IS DISTINCT FROM auth.uid() THEN
        RAISE EXCEPTION 'Staff must be linked to your own store.';
    END IF;

    INSERT INTO public.profiles (id, full_name, email, role, permissions, vendor_id, created_at)
    VALUES (p_user_id, p_full_name, p_email, 'staff', p_permissions, p_vendor_id, now())
    ON CONFLICT (id) DO UPDATE SET
        full_name = EXCLUDED.full_name,
        email = EXCLUDED.email,
        role = 'staff',
        permissions = EXCLUDED.permissions,
        vendor_id = EXCLUDED.vendor_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_vendor_staff_profile(UUID, TEXT, TEXT, TEXT, UUID) TO authenticated;

-- handle_new_user (auth.users trigger)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (
    id,
    email,
    full_name,
    role,
    permissions,
    store_name,
    plan,
    vendor_id
  ) VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'role', 'staff'),
    COALESCE(NEW.raw_user_meta_data->>'permissions', 'read_write'),
    NEW.raw_user_meta_data->>'store_name',
    COALESCE(NEW.raw_user_meta_data->>'plan', 'free'),
    (NEW.raw_user_meta_data->>'vendor_id')::uuid
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    full_name = COALESCE(NULLIF(EXCLUDED.full_name, ''), profiles.full_name),
    role = COALESCE(EXCLUDED.role, profiles.role),
    store_name = COALESCE(EXCLUDED.store_name, profiles.store_name);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 7. ORDER AND INVENTORY RPCs & TRIGGERS
-- sync_website_order_status
CREATE OR REPLACE FUNCTION public.sync_website_order_status()
RETURNS TRIGGER AS $$
BEGIN
    IF (OLD.parcel_status IS DISTINCT FROM NEW.parcel_status) THEN
        UPDATE public.website_orders 
        SET status = NEW.parcel_status,
            updated_at = NOW()
        WHERE sale_id = NEW.id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_sale_status_update ON public.sales;
CREATE TRIGGER on_sale_status_update
AFTER UPDATE ON public.sales
FOR EACH ROW
EXECUTE FUNCTION public.sync_website_order_status();

-- auto_fill_order_item_vendor
CREATE OR REPLACE FUNCTION public.auto_fill_order_item_vendor()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_vendor UUID;
BEGIN
    IF NEW.vendor_id IS NULL THEN
        SELECT p.vendor_id INTO v_vendor
        FROM public.website_variants wv
        LEFT JOIN public.products p ON p.id = wv.inventory_product_id
        WHERE wv.id = NEW.variant_id
        LIMIT 1;

        IF v_vendor IS NULL THEN
            SELECT wp.vendor_id INTO v_vendor
            FROM public.website_variants wv
            JOIN public.website_products wp ON wp.id = wv.product_id
            WHERE wv.id = NEW.variant_id
            LIMIT 1;
        END IF;

        NEW.vendor_id := v_vendor;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_fill_order_item_vendor ON public.website_order_items;
CREATE TRIGGER trg_auto_fill_order_item_vendor
BEFORE INSERT ON public.website_order_items
FOR EACH ROW
EXECUTE FUNCTION public.auto_fill_order_item_vendor();

-- resolve_return_vendor
CREATE OR REPLACE FUNCTION public.resolve_return_vendor()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_vendor_count INT;
    v_vendor_id    UUID;
BEGIN
    IF NEW.vendor_id IS NULL AND NEW.order_id IS NOT NULL THEN
        SELECT COUNT(DISTINCT s.v), (array_agg(DISTINCT s.v))[1]
        INTO v_vendor_count, v_vendor_id
        FROM (
            SELECT COALESCE(woi.vendor_id, p.vendor_id) AS v
            FROM public.website_order_items woi
            JOIN public.website_variants wv ON wv.id = woi.variant_id
            LEFT JOIN public.products p ON p.id = wv.inventory_product_id
            WHERE woi.order_id = NEW.order_id
        ) s
        WHERE s.v IS NOT NULL;

        IF v_vendor_count = 1 THEN
            NEW.vendor_id := v_vendor_id;
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_return_resolve_vendor ON public.website_order_returns;
CREATE TRIGGER on_return_resolve_vendor
BEFORE INSERT OR UPDATE OF order_id ON public.website_order_returns
FOR EACH ROW EXECUTE FUNCTION public.resolve_return_vendor();

-- credit_coins_on_return_rejected
CREATE OR REPLACE FUNCTION public.credit_coins_on_return_rejected()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_phone TEXT;
BEGIN
    IF NEW.status <> 'rejected' THEN
        RETURN NEW;
    END IF;

    IF TG_OP = 'UPDATE' AND OLD.status = 'rejected' THEN
        RETURN NEW;
    END IF;

    SELECT o.phone INTO v_phone
    FROM public.website_orders o
    WHERE o.id = NEW.order_id
    LIMIT 1;

    IF v_phone IS NOT NULL THEN
        UPDATE public.website_customers
        SET shopy_coins = COALESCE(shopy_coins, 0) + 15
        WHERE phone = v_phone;

        INSERT INTO public.coin_transactions (customer_phone, amount, type, description)
        VALUES (v_phone, 15, 'return_rejected', 'Return request rejected - compensation');
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_return_rejected_credit_coins ON public.website_order_returns;
CREATE TRIGGER on_return_rejected_credit_coins
AFTER INSERT OR UPDATE OF status ON public.website_order_returns
FOR EACH ROW EXECUTE FUNCTION public.credit_coins_on_return_rejected();

-- confirm_website_payment
CREATE OR REPLACE FUNCTION public.confirm_website_payment(
    p_order_number TEXT,
    p_payment_details TEXT,
    p_status TEXT DEFAULT 'unpaid'
)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_sale_id UUID;
BEGIN
    UPDATE public.website_orders
    SET 
        notes = CASE 
            WHEN notes IS NULL OR notes = '' THEN p_payment_details 
            ELSE notes || E'\n' || p_payment_details 
        END,
        payment_status = p_status
    WHERE order_number = p_order_number
    RETURNING sale_id INTO v_sale_id;

    IF v_sale_id IS NOT NULL THEN
        UPDATE public.sales
        SET 
            payment_status = p_status,
            notes = CASE 
                WHEN notes IS NULL OR notes = '' THEN p_payment_details 
                ELSE notes || E'\n' || p_payment_details 
            END
        WHERE id = v_sale_id;
    END IF;

    RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.confirm_website_payment(TEXT, TEXT, TEXT) TO public, anon, authenticated;

-- create_atomic_website_order
CREATE OR REPLACE FUNCTION public.create_atomic_website_order(
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
    -- 1. Secure Coin Verification
    IF p_coins_used > 0 THEN
        SELECT COALESCE(shopy_coins, 0)
        INTO v_current_coins
        FROM public.website_customers
        WHERE phone = p_phone
        FOR UPDATE;

        IF v_current_coins < p_coins_used THEN
            RAISE EXCEPTION 'INSUFFICIENT_COINS';
        END IF;
    END IF;

    -- 2. System user (Admin)
    SELECT id INTO v_system_user_id
    FROM public.profiles
    WHERE role = 'admin'
    LIMIT 1;

    -- Calculate total quantity across items
    SELECT COALESCE(SUM((x->>'quantity')::int), 0)
    INTO v_total_qty
    FROM jsonb_array_elements(p_items) AS x;

    -- Get first item's inventory ID
    SELECT COALESCE(
        wv.inventory_product_id,
        (SELECT child_inventory_id FROM public.website_variant_bundles WHERE bundle_variant_id = wv.id LIMIT 1)
    )
    INTO v_first_inv_id
    FROM public.website_variants wv
    WHERE wv.id = (p_items->0->>'variant_id')::UUID
    LIMIT 1;

    -- 3. Insert into Sales
    INSERT INTO public.sales (
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

    -- 4. Insert into Website Orders
    INSERT INTO public.website_orders (
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

    -- 5. Process items and deduct stock
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
        SELECT * INTO v_variant_record
        FROM public.website_variants
        WHERE id = v_item.variant_id
        FOR UPDATE;

        SELECT vendor_id INTO v_item_vendor
        FROM public.website_products
        WHERE id = v_item.product_id
        LIMIT 1;

        SELECT image_url INTO v_item_image
        FROM public.website_product_images
        WHERE product_id = v_item.product_id
        ORDER BY is_primary DESC, sort_order ASC
        LIMIT 1;

        INSERT INTO public.website_order_items (
            order_id, variant_id, product_id, product_title, quantity, unit_price, sku, vendor_id, product_image
        )
        VALUES (
            v_order_id, v_item.variant_id, v_item.product_id, v_item.product_title,
            v_item.quantity, v_item.unit_price, v_item.sku, v_item_vendor, COALESCE(v_item_image, '')
        );

        IF v_variant_record.is_bundle THEN
            FOR v_sub_item IN
                SELECT child_inventory_id, quantity
                FROM public.website_variant_bundles
                WHERE bundle_variant_id = v_variant_record.id
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
            IF v_variant_record.inventory_product_id IS NULL THEN
                RAISE EXCEPTION 'MISSING_INVENTORY_LINK: %', v_item.product_title;
            END IF;

            v_remaining := v_item.quantity;

            INSERT INTO public.sale_items (sale_id, product_id, quantity, vendor_id)
            VALUES (
                v_sale_record_id,
                v_variant_record.inventory_product_id,
                v_remaining,
                (SELECT vendor_id FROM public.products WHERE id = v_variant_record.inventory_product_id)
            );

            FOR v_lot IN (
                SELECT id, quantity_remaining
                FROM public.product_lots
                WHERE product_id = v_variant_record.inventory_product_id
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
                VALUES (v_variant_record.inventory_product_id, 'sale', -v_deduction, v_lot.id, v_sale_record_id, v_system_user_id);

                EXIT WHEN v_remaining = 0;
            END LOOP;

            IF v_remaining > 0 THEN
                RAISE EXCEPTION 'INSUFFICIENT_STOCK: %', v_item.product_title;
            END IF;
        END IF;

    END LOOP;

    -- 6. Deduct coins if used
    IF p_coins_used > 0 THEN
        UPDATE public.website_customers
        SET shopy_coins = shopy_coins - p_coins_used
        WHERE phone = p_phone;

        INSERT INTO public.coin_transactions (customer_phone, amount, type, description)
        VALUES (p_phone, -p_coins_used, 'burn', 'Order #' || v_order_number);
    END IF;

    -- 7. Return Result
    RETURN jsonb_build_object(
        'success',      true,
        'sale_id',      v_sale_record_id,
        'order_id',     v_order_id,
        'order_number', v_order_number
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_atomic_website_order(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, JSONB, NUMERIC) TO public, anon, authenticated;

-- handle_website_order_cancellation
CREATE OR REPLACE FUNCTION public.handle_website_order_cancellation(
    p_order_id BIGINT,
    p_reason TEXT
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_sale_id UUID;
    v_current_status TEXT;
    v_trans RECORD;
BEGIN
    SELECT sale_id, status INTO v_sale_id, v_current_status 
    FROM public.website_orders 
    WHERE id = p_order_id;
    
    IF v_current_status = 'cancelled' THEN
        RETURN;
    END IF;

    UPDATE public.website_orders 
    SET status = 'cancelled', notes = p_reason, updated_at = NOW() 
    WHERE id = p_order_id;
    
    IF v_sale_id IS NOT NULL THEN
        UPDATE public.sales SET parcel_status = 'cancelled' WHERE id = v_sale_id;
        
        FOR v_trans IN 
            SELECT product_id, lot_id, ABS(quantity_changed) as qty 
            FROM public.transactions 
            WHERE sale_id = v_sale_id AND type = 'sale' 
        LOOP
            IF v_trans.lot_id IS NOT NULL THEN
                UPDATE public.product_lots 
                SET quantity_remaining = quantity_remaining + v_trans.qty 
                WHERE id = v_trans.lot_id;
            END IF;
            
            INSERT INTO public.transactions (product_id, lot_id, sale_id, type, quantity_changed, performed_by)
            VALUES (v_trans.product_id, v_trans.lot_id, v_sale_id, 'cancel', v_trans.qty, (SELECT id FROM public.profiles LIMIT 1));
        END LOOP;
    END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.handle_website_order_cancellation(BIGINT, TEXT) TO anon, authenticated;

-- 8. CUSTOMER SESSION MANAGEMENT & PROFILE RPCs
CREATE OR REPLACE FUNCTION public.private_customer_from_session(p_token TEXT)
RETURNS public.website_customers
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE v_customer public.website_customers;
BEGIN
  SELECT c.* INTO v_customer
  FROM public.customer_sessions s JOIN public.website_customers c ON c.phone = s.customer_phone
  WHERE s.token_hash = encode(digest(p_token, 'sha256'), 'hex') AND s.expires_at > now();
  RETURN v_customer;
END;
$$;

CREATE OR REPLACE FUNCTION public.private_create_customer_session(p_phone TEXT)
RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE v_token TEXT := encode(gen_random_bytes(32), 'hex');
BEGIN
  DELETE FROM public.customer_sessions WHERE customer_phone = p_phone OR expires_at <= now();
  INSERT INTO public.customer_sessions(customer_phone, token_hash, expires_at)
  VALUES (p_phone, encode(digest(v_token, 'sha256'), 'hex'), now() + interval '30 days');
  RETURN v_token;
END;
$$;

CREATE OR REPLACE FUNCTION public.customer_login(p_phone TEXT, p_pin TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE c public.website_customers; v_token TEXT;
BEGIN
  SELECT * INTO c FROM public.website_customers WHERE phone = right(regexp_replace(p_phone, '\D', '', 'g'), 10) LIMIT 1;
  IF c.phone IS NULL OR c.pin_hash <> crypt(p_pin, c.pin_hash) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid phone number or PIN');
  END IF;
  v_token := public.private_create_customer_session(c.phone);
  RETURN jsonb_build_object('success', true, 'session_token', v_token,
    'customer', jsonb_build_object('phone', c.phone, 'name', c.name, 'address', c.address, 'city', c.city, 'shopy_coins', c.shopy_coins, 'created_at', c.created_at));
END;
$$;

CREATE OR REPLACE FUNCTION public.customer_register(p_name TEXT, p_phone TEXT, p_pin TEXT, p_address TEXT, p_city TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE v_phone TEXT := right(regexp_replace(p_phone, '\D', '', 'g'), 10); c public.website_customers; v_token TEXT;
BEGIN
  IF p_pin !~ '^[0-9]{4}$' THEN RETURN jsonb_build_object('success', false, 'error', 'PIN must be exactly 4 digits'); END IF;
  IF EXISTS (SELECT 1 FROM public.website_customers WHERE phone = v_phone) THEN RETURN jsonb_build_object('success', false, 'error', 'This phone number is already registered. Please login instead.'); END IF;
  INSERT INTO public.website_customers(name, phone, pin_hash, address, city) VALUES (p_name, v_phone, crypt(p_pin, gen_salt('bf', 12)), p_address, p_city) RETURNING * INTO c;
  v_token := public.private_create_customer_session(c.phone);
  RETURN jsonb_build_object('success', true, 'session_token', v_token, 'customer', jsonb_build_object('phone', c.phone, 'name', c.name, 'address', c.address, 'city', c.city, 'shopy_coins', c.shopy_coins, 'created_at', c.created_at));
END;
$$;

CREATE OR REPLACE FUNCTION public.customer_setup_pin(p_phone TEXT, p_pin TEXT, p_name TEXT DEFAULT NULL, p_address TEXT DEFAULT NULL, p_city TEXT DEFAULT NULL)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE v_phone TEXT := right(regexp_replace(p_phone, '\D', '', 'g'), 10); c public.website_customers; v_token TEXT;
BEGIN
  IF p_pin !~ '^[0-9]{4}$' THEN RETURN jsonb_build_object('success', false, 'error', 'PIN must be exactly 4 digits'); END IF;
  SELECT * INTO c FROM public.website_customers WHERE phone = v_phone LIMIT 1;
  IF c.phone IS NULL THEN
    INSERT INTO public.website_customers(name, phone, pin_hash, address, city) VALUES (COALESCE(NULLIF(p_name, ''), 'Customer'), v_phone, crypt(p_pin, gen_salt('bf', 12)), p_address, p_city) RETURNING * INTO c;
  ELSE
    UPDATE public.website_customers SET pin_hash=crypt(p_pin, gen_salt('bf', 12)), name=COALESCE(NULLIF(p_name, ''), name), address=COALESCE(NULLIF(p_address, ''), address), city=COALESCE(NULLIF(p_city, ''), city) WHERE phone=v_phone RETURNING * INTO c;
  END IF;
  v_token := public.private_create_customer_session(c.phone);
  RETURN jsonb_build_object('success', true, 'session_token', v_token, 'customer', jsonb_build_object('phone', c.phone, 'name', c.name, 'address', c.address, 'city', c.city, 'shopy_coins', c.shopy_coins, 'created_at', c.created_at));
END;
$$;

CREATE OR REPLACE FUNCTION public.customer_session_profile(p_token TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE c public.website_customers := public.private_customer_from_session(p_token);
BEGIN
  IF c.phone IS NULL THEN RETURN jsonb_build_object('success', false); END IF;
  RETURN jsonb_build_object('success', true, 'customer', jsonb_build_object('phone', c.phone, 'name', c.name, 'address', c.address, 'city', c.city, 'shopy_coins', c.shopy_coins, 'created_at', c.created_at));
END;
$$;

CREATE OR REPLACE FUNCTION public.customer_update_profile(p_token TEXT, p_name TEXT, p_address TEXT, p_city TEXT)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE c public.website_customers := public.private_customer_from_session(p_token);
BEGIN
  IF c.phone IS NULL THEN RETURN false; END IF;
  UPDATE public.website_customers SET name=p_name, address=p_address, city=p_city WHERE phone=c.phone;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.customer_change_pin(p_token TEXT, p_current_pin TEXT, p_new_pin TEXT)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE c public.website_customers := public.private_customer_from_session(p_token);
BEGIN
  IF c.phone IS NULL OR p_new_pin !~ '^[0-9]{4}$' OR c.pin_hash <> crypt(p_current_pin, c.pin_hash) THEN RETURN false; END IF;
  UPDATE public.website_customers SET pin_hash=crypt(p_new_pin, gen_salt('bf', 12)) WHERE phone=c.phone;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.customer_orders(p_token TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE c public.website_customers := public.private_customer_from_session(p_token); v_orders JSONB;
BEGIN
  IF c.phone IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Session expired'); END IF;
  SELECT COALESCE(jsonb_agg(x), '[]'::jsonb) INTO v_orders FROM (
    SELECT o.*, (SELECT COALESCE(jsonb_agg(i), '[]'::jsonb) FROM public.website_order_items i WHERE i.order_id=o.id) AS items
    FROM public.website_orders o WHERE o.phone=c.phone ORDER BY o.created_at DESC
  ) x;
  RETURN jsonb_build_object('success', true, 'orders', v_orders);
END;
$$;

CREATE OR REPLACE FUNCTION public.customer_returns(p_token TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE c public.website_customers := public.private_customer_from_session(p_token); v_returns JSONB;
BEGIN
  IF c.phone IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Session expired'); END IF;
  SELECT COALESCE(jsonb_agg(r), '[]'::jsonb) INTO v_returns FROM public.website_order_returns r WHERE r.customer_phone=c.phone;
  RETURN jsonb_build_object('success', true, 'returns', v_returns);
END;
$$;

CREATE OR REPLACE FUNCTION public.customer_submit_rating(p_token TEXT, p_order_id BIGINT, p_product_id BIGINT, p_rating INT, p_comment TEXT)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE c public.website_customers := public.private_customer_from_session(p_token);
BEGIN
  IF c.phone IS NULL OR p_rating NOT BETWEEN 1 AND 5 THEN RETURN false; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.website_orders o JOIN public.website_order_items i ON i.order_id=o.id WHERE o.id=p_order_id AND o.phone=c.phone AND i.product_id=p_product_id AND o.status='delivered') THEN RETURN false; END IF;
  INSERT INTO public.website_product_ratings(order_id, product_id, customer_phone, customer_name, rating, comment) VALUES (p_order_id, p_product_id, c.phone, c.name, p_rating, p_comment);
  UPDATE public.website_customers SET shopy_coins=COALESCE(shopy_coins,0)+25 WHERE phone=c.phone;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_reset_customer_pin(p_phone TEXT, p_new_pin TEXT)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE v_updated BOOLEAN;
BEGIN
  IF NOT public.is_admin_or_staff() THEN
    RAISE EXCEPTION 'ADMIN_PIN_RESET_DENIED: the signed-in account needs an admin or staff profile';
  END IF;
  IF p_new_pin !~ '^[0-9]{4}$' THEN
    RAISE EXCEPTION 'ADMIN_PIN_RESET_DENIED: PIN must be exactly four digits';
  END IF;
  UPDATE public.website_customers SET pin_hash=crypt(p_new_pin, gen_salt('bf', 12)) WHERE phone=p_phone;
  v_updated := FOUND;
  IF NOT v_updated THEN
    RAISE EXCEPTION 'ADMIN_PIN_RESET_DENIED: customer not found';
  END IF;
  DELETE FROM public.customer_sessions WHERE customer_phone=p_phone;
  RETURN v_updated;
END;
$$;

GRANT EXECUTE ON FUNCTION public.customer_login(TEXT,TEXT), public.customer_register(TEXT,TEXT,TEXT,TEXT,TEXT), public.customer_setup_pin(TEXT,TEXT,TEXT,TEXT,TEXT), public.customer_session_profile(TEXT), public.customer_update_profile(TEXT,TEXT,TEXT,TEXT), public.customer_change_pin(TEXT,TEXT,TEXT), public.customer_orders(TEXT), public.customer_returns(TEXT), public.customer_submit_rating(TEXT,BIGINT,BIGINT,INT,TEXT), public.admin_reset_customer_pin(TEXT,TEXT) TO anon, authenticated;

-- 9. ROW LEVEL SECURITY (RLS) POLICIES
-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_lots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sale_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.income_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.website_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.website_product_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.website_product_variations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.website_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.website_variant_bundles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.website_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.website_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.website_order_returns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.website_customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.website_otps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coin_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_auth_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.website_payment_intents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.website_delivery_branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.website_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.website_product_ratings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chatbot_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chatbot_faqs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chatbot_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chatbot_shortcuts ENABLE ROW LEVEL SECURITY;

-- Profiles policies
DROP POLICY IF EXISTS profiles_self_read ON public.profiles;
CREATE POLICY profiles_self_read ON public.profiles FOR SELECT TO authenticated
  USING (
    id = auth.uid()
    OR public.is_admin_or_staff()
    OR vendor_id = auth.uid()
    OR (role = 'vendor' AND id = public.current_vendor_id())
  );

DROP POLICY IF EXISTS profiles_self_create_staff ON public.profiles;
CREATE POLICY profiles_self_create_staff ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (
    (id = auth.uid() AND role IN ('staff', 'vendor') AND vendor_id IS NOT DISTINCT FROM public.current_vendor_id())
    OR public.is_admin_or_staff()
    OR (
      role = 'staff'
      AND vendor_id = auth.uid()
      AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'vendor')
    )
  );

DROP POLICY IF EXISTS profiles_self_update ON public.profiles;
CREATE POLICY profiles_self_update ON public.profiles FOR UPDATE TO authenticated
  USING (
    id = auth.uid()
    OR public.is_admin_or_staff()
    OR vendor_id = auth.uid()
  )
  WITH CHECK (
    (id = auth.uid() AND role IN ('staff', 'vendor') AND vendor_id IS NOT DISTINCT FROM public.current_vendor_id())
    OR public.is_admin_or_staff()
    OR (
      role = 'staff'
      AND vendor_id = auth.uid()
      AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'vendor')
    )
  );

DROP POLICY IF EXISTS profiles_admin_delete ON public.profiles;
CREATE POLICY profiles_admin_delete ON public.profiles FOR DELETE TO authenticated
  USING (
    public.is_admin_or_staff()
    OR (
      role = 'staff'
      AND vendor_id = auth.uid()
      AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'vendor')
    )
  );

-- Products policies
CREATE POLICY "Admin and staff full access products" ON public.products FOR ALL TO authenticated
  USING (public.is_admin_or_staff()) WITH CHECK (public.is_admin_or_staff());
CREATE POLICY "Vendors manage own products" ON public.products FOR ALL TO authenticated
  USING (vendor_id = public.current_vendor_id()) WITH CHECK (vendor_id = public.current_vendor_id());

-- Product Lots policies
CREATE POLICY "Admin and staff full access lots" ON public.product_lots FOR ALL TO authenticated
  USING (public.is_admin_or_staff()) WITH CHECK (public.is_admin_or_staff());
CREATE POLICY "Vendors manage own lots" ON public.product_lots FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.products p WHERE p.id = product_lots.product_id AND p.vendor_id = public.current_vendor_id()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.products p WHERE p.id = product_lots.product_id AND p.vendor_id = public.current_vendor_id()));

-- Sales policies
CREATE POLICY "Admin and staff full access sales" ON public.sales FOR ALL TO authenticated
  USING (public.is_admin_or_staff()) WITH CHECK (public.is_admin_or_staff());
CREATE POLICY "Vendors view and update sales with their products" ON public.sales FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.sale_items si JOIN public.products p ON p.id = si.product_id WHERE si.sale_id = sales.id AND p.vendor_id = public.current_vendor_id()));

-- Sale Items policies
CREATE POLICY "Admin and staff full access sale_items" ON public.sale_items FOR ALL TO authenticated
  USING (public.is_admin_or_staff()) WITH CHECK (public.is_admin_or_staff());
CREATE POLICY "Vendors manage own sale items" ON public.sale_items FOR ALL TO authenticated
  USING (vendor_id = public.current_vendor_id() OR EXISTS (SELECT 1 FROM public.products p WHERE p.id = sale_items.product_id AND p.vendor_id = public.current_vendor_id()));

-- Expenses policies
CREATE POLICY "Admin and staff full access expenses" ON public.expenses FOR ALL TO authenticated
  USING (public.is_admin_or_staff()) WITH CHECK (public.is_admin_or_staff());
CREATE POLICY "Vendors manage own expenses" ON public.expenses FOR ALL TO authenticated
  USING (vendor_id = public.current_vendor_id()) WITH CHECK (vendor_id = public.current_vendor_id());

-- Transactions policies
CREATE POLICY "Admin and staff full access transactions" ON public.transactions FOR ALL TO authenticated
  USING (public.is_admin_or_staff()) WITH CHECK (public.is_admin_or_staff());
CREATE POLICY "Vendors view own transactions" ON public.transactions FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.products p WHERE p.id = transactions.product_id AND p.vendor_id = public.current_vendor_id()));

-- Income Entries policies
CREATE POLICY "income_entries_select" ON public.income_entries FOR SELECT TO authenticated USING (true);
CREATE POLICY "income_entries_insert" ON public.income_entries FOR INSERT TO authenticated WITH CHECK (recorded_by = auth.uid());
CREATE POLICY "income_entries_update" ON public.income_entries FOR UPDATE TO authenticated USING (
  recorded_by = auth.uid() OR public.is_admin_or_staff() OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'vendor' AND EXISTS (SELECT 1 FROM public.profiles s WHERE s.id = income_entries.recorded_by AND s.vendor_id = auth.uid()))
);

-- Website Products policies
CREATE POLICY "Public read active website products" ON public.website_products FOR SELECT TO anon, authenticated
  USING (is_active = TRUE OR public.is_admin_or_staff() OR vendor_id = public.current_vendor_id());
CREATE POLICY "Admin staff full access website products" ON public.website_products FOR ALL TO authenticated
  USING (public.is_admin_or_staff()) WITH CHECK (public.is_admin_or_staff());
CREATE POLICY "Vendors manage own website products" ON public.website_products FOR ALL TO authenticated
  USING (vendor_id = public.current_vendor_id()) WITH CHECK (vendor_id = public.current_vendor_id());

-- Website Product Images policies
CREATE POLICY "Public read product images" ON public.website_product_images FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Admin staff manage images" ON public.website_product_images FOR ALL TO authenticated
  USING (public.is_admin_or_staff()) WITH CHECK (public.is_admin_or_staff());
CREATE POLICY "Vendors manage own images" ON public.website_product_images FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.website_products wp WHERE wp.id = product_id AND wp.vendor_id = public.current_vendor_id()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.website_products wp WHERE wp.id = product_id AND wp.vendor_id = public.current_vendor_id()));

-- Website Product Variations policies
CREATE POLICY "Public read variations" ON public.website_product_variations FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Admin staff manage variations" ON public.website_product_variations FOR ALL TO authenticated
  USING (public.is_admin_or_staff()) WITH CHECK (public.is_admin_or_staff());
CREATE POLICY "Vendors manage variations" ON public.website_product_variations FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.website_products wp WHERE wp.id = product_id AND wp.vendor_id = public.current_vendor_id()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.website_products wp WHERE wp.id = product_id AND wp.vendor_id = public.current_vendor_id()));

-- Website Variants policies
CREATE POLICY "Public read variants" ON public.website_variants FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Admin staff manage variants" ON public.website_variants FOR ALL TO authenticated
  USING (public.is_admin_or_staff()) WITH CHECK (public.is_admin_or_staff());
CREATE POLICY "Vendors manage own variants" ON public.website_variants FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.website_products wp WHERE wp.id = product_id AND wp.vendor_id = public.current_vendor_id()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.website_products wp WHERE wp.id = product_id AND wp.vendor_id = public.current_vendor_id()));

-- Website Variant Bundles policies
CREATE POLICY "Public read bundles" ON public.website_variant_bundles FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Admin staff manage bundles" ON public.website_variant_bundles FOR ALL TO authenticated
  USING (public.is_admin_or_staff()) WITH CHECK (public.is_admin_or_staff());
CREATE POLICY "Vendors manage own bundles" ON public.website_variant_bundles FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.website_variants v JOIN public.website_products wp ON wp.id = v.product_id WHERE v.id = bundle_variant_id AND wp.vendor_id = public.current_vendor_id()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.website_variants v JOIN public.website_products wp ON wp.id = v.product_id WHERE v.id = bundle_variant_id AND wp.vendor_id = public.current_vendor_id()));

-- Website Orders policies
CREATE POLICY "Admin staff full access orders" ON public.website_orders FOR ALL TO authenticated
  USING (public.is_admin_or_staff()) WITH CHECK (public.is_admin_or_staff());
CREATE POLICY "Vendors view their orders" ON public.website_orders FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.website_order_items i WHERE i.order_id = website_orders.id AND i.vendor_id = public.current_vendor_id()));

-- Website Order Items policies
CREATE POLICY "Admin staff full access order items" ON public.website_order_items FOR ALL TO authenticated
  USING (public.is_admin_or_staff()) WITH CHECK (public.is_admin_or_staff());
CREATE POLICY "Vendors read own order items" ON public.website_order_items FOR SELECT TO authenticated
  USING (vendor_id = public.current_vendor_id());

-- Website Order Returns policies
CREATE POLICY "Public insert returns" ON public.website_order_returns FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Admin staff full access returns" ON public.website_order_returns FOR ALL TO authenticated
  USING (public.is_admin_or_staff()) WITH CHECK (public.is_admin_or_staff());
CREATE POLICY "Vendors manage own returns" ON public.website_order_returns FOR ALL TO authenticated
  USING (vendor_id = public.current_vendor_id()) WITH CHECK (vendor_id = public.current_vendor_id());

-- Website Delivery Branches policies
CREATE POLICY "Public read delivery branches" ON public.website_delivery_branches FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Admin staff manage branches" ON public.website_delivery_branches FOR ALL TO authenticated
  USING (public.is_admin_or_staff()) WITH CHECK (public.is_admin_or_staff());

-- Website Settings policies
CREATE POLICY "Public read safe settings" ON public.website_settings FOR SELECT TO anon, authenticated
  USING (key !~* '(secret|password|token|private|service[_-]?role|api[_-]?key)' OR public.is_admin_or_staff());
CREATE POLICY "Admin staff manage settings" ON public.website_settings FOR ALL TO authenticated
  USING (public.is_admin_or_staff()) WITH CHECK (public.is_admin_or_staff());

-- Website Product Ratings policies
CREATE POLICY "Public read product ratings" ON public.website_product_ratings FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Admin staff manage ratings" ON public.website_product_ratings FOR ALL TO authenticated
  USING (public.is_admin_or_staff()) WITH CHECK (public.is_admin_or_staff());

-- Chatbot policies
CREATE POLICY "Public read chatbot products" ON public.chatbot_products FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Admin manage chatbot products" ON public.chatbot_products FOR ALL TO authenticated USING (public.is_admin_or_staff());
CREATE POLICY "Public read chatbot faqs" ON public.chatbot_faqs FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Admin manage chatbot faqs" ON public.chatbot_faqs FOR ALL TO authenticated USING (public.is_admin_or_staff());
CREATE POLICY "Public read notifications" ON public.chatbot_notifications FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Chatbot insert notifications" ON public.chatbot_notifications FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Admin manage notifications" ON public.chatbot_notifications FOR ALL TO authenticated USING (public.is_admin_or_staff());
CREATE POLICY "Public read shortcuts" ON public.chatbot_shortcuts FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Admin manage shortcuts" ON public.chatbot_shortcuts FOR ALL TO authenticated USING (public.is_admin_or_staff());

-- 10. REALTIME PUBLICATION
DO $$
BEGIN
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.website_orders; EXCEPTION WHEN others THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.website_order_returns; EXCEPTION WHEN others THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.sales; EXCEPTION WHEN others THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.products; EXCEPTION WHEN others THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.product_lots; EXCEPTION WHEN others THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.expenses; EXCEPTION WHEN others THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.income_entries; EXCEPTION WHEN others THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.website_customers; EXCEPTION WHEN others THEN NULL; END;
END $$;

-- 11. DEFAULT SETTINGS & DELIVERY BRANCHES SEED
INSERT INTO public.website_settings (key, value) VALUES
    ('hero_title', 'Smart Shopping Made Easy'),
    ('hero_subtitle', 'Get the best deals on electronics and apparel with lightning-fast delivery across Nepal.'),
    ('hero_badge', 'Nepal''s Most Trusted Store'),
    ('hero_cta', 'Shop Now'),
    ('store_name', 'Shopy Nepal'),
    ('store_tagline', 'Your one-stop destination for smart shopping in Nepal.'),
    ('store_phone', '+977-9845877777'),
    ('store_email', 'singhsujit431@gmail.com'),
    ('store_address', 'Kathmandu, Nepal'),
    ('facebook_url', '#'),
    ('instagram_url', '#'),
    ('tiktok_url', '#'),
    ('esewa_environment', 'test'),
    ('esewa_merchant_code', 'EPAYTEST'),
    ('esewa_secret_key', '8gBm/:&EnhH.1/q')
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.website_delivery_branches (city, coverage_area, shipping_fee) VALUES
    ('Kathmandu', 'Within Ring Road & Immediate Suburbs', 100),
    ('Lalitpur', 'Inside Valley areas', 100),
    ('Bhaktapur', 'City limits', 150),
    ('Pokhara', 'Lakeside and City areas', 200),
    ('Outside Valley', 'All major hubs except above', 250)
ON CONFLICT (city) DO NOTHING;

-- 12. BACKFILL PROFILES FOR EXISTING AUTH USERS
INSERT INTO public.profiles (
  id,
  email,
  full_name,
  role,
  permissions,
  store_name,
  plan,
  vendor_id
)
SELECT
  id,
  email,
  COALESCE(raw_user_meta_data->>'full_name', CASE WHEN email = 'ssujit905@gmail.com' THEN 'Sujit Singh' ELSE '' END),
  CASE WHEN email = 'ssujit905@gmail.com' THEN 'admin' ELSE COALESCE(raw_user_meta_data->>'role', 'staff') END,
  COALESCE(raw_user_meta_data->>'permissions', 'read_write'),
  raw_user_meta_data->>'store_name',
  COALESCE(raw_user_meta_data->>'plan', 'free'),
  (raw_user_meta_data->>'vendor_id')::uuid
FROM auth.users
ON CONFLICT (id) DO UPDATE SET
  email = EXCLUDED.email,
  role = EXCLUDED.role,
  full_name = EXCLUDED.full_name,
  permissions = EXCLUDED.permissions,
  store_name = EXCLUDED.store_name,
  plan = EXCLUDED.plan;
