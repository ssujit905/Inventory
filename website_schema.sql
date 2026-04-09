-- ============================================================
-- SHOPY NEPAL WEBSITE SCHEMA
-- Run this in your Supabase SQL editor
-- ============================================================

-- 1. Website Products
CREATE TABLE IF NOT EXISTS website_products (
    id BIGSERIAL PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT DEFAULT '',
    price NUMERIC(10,2) NOT NULL DEFAULT 0,
    original_price NUMERIC(10,2) DEFAULT NULL,
    category TEXT DEFAULT 'General',
    city TEXT DEFAULT 'Kathmandu',
    delivery_days TEXT DEFAULT '2-4',
    is_active BOOLEAN DEFAULT TRUE,
    is_prepaid BOOLEAN DEFAULT FALSE,
    is_prebook BOOLEAN DEFAULT FALSE,
    is_sold_out BOOLEAN DEFAULT FALSE,
    sold_count INTEGER DEFAULT 0,
    sizes TEXT DEFAULT '',
    colors TEXT DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Website Product Images (multiple per product)
CREATE TABLE IF NOT EXISTS website_product_images (
    id BIGSERIAL PRIMARY KEY,
    product_id BIGINT REFERENCES website_products(id) ON DELETE CASCADE,
    image_url TEXT NOT NULL,
    is_primary BOOLEAN DEFAULT FALSE,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Website Product Variations (sizes, colors, etc.)
CREATE TABLE IF NOT EXISTS website_product_variations (
    id BIGSERIAL PRIMARY KEY,
    product_id BIGINT REFERENCES website_products(id) ON DELETE CASCADE,
    label TEXT NOT NULL,   -- e.g. "Color", "Size"
    value TEXT NOT NULL,   -- e.g. "Red", "XL"
    sort_order INTEGER DEFAULT 0
);

-- 4. Website Orders
CREATE TABLE IF NOT EXISTS website_orders (
    id BIGSERIAL PRIMARY KEY,
    order_number TEXT NOT NULL UNIQUE DEFAULT CONCAT('WO-', LPAD(FLOOR(RANDOM()*900000+100000)::TEXT, 6, '0')),
    customer_name TEXT NOT NULL,
    email TEXT DEFAULT '',
    phone TEXT NOT NULL,
    phone2 TEXT DEFAULT '',
    address TEXT NOT NULL,
    city TEXT DEFAULT 'Kathmandu',
    payment_method TEXT DEFAULT 'COD',
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending','confirmed','processing','shipped','delivered','cancelled')),
    total_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
    shipping_fee NUMERIC(10,2) NOT NULL DEFAULT 0,
    notes TEXT DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Website Order Items
CREATE TABLE IF NOT EXISTS website_order_items (
    id BIGSERIAL PRIMARY KEY,
    order_id BIGINT REFERENCES website_orders(id) ON DELETE CASCADE,
    product_id BIGINT REFERENCES website_products(id) ON DELETE SET NULL,
    product_title TEXT NOT NULL,
    product_image TEXT DEFAULT '',
    quantity INTEGER NOT NULL DEFAULT 1,
    unit_price NUMERIC(10,2) NOT NULL DEFAULT 0
);

-- 6. Website Settings (key-value store)
CREATE TABLE IF NOT EXISTS website_settings (
    key TEXT PRIMARY KEY,
    value TEXT DEFAULT '',
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default settings
INSERT INTO website_settings (key, value) VALUES
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
    ('twitter_url', '#')
ON CONFLICT (key) DO NOTHING;

-- ============================================================
-- STORAGE BUCKET (run separately if needed)
-- ============================================================
-- In Supabase dashboard: Storage → New Bucket → "website-images" → Public

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE website_orders;

-- Row-Level Security (allow public reads, only authenticated writes)
ALTER TABLE website_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE website_product_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE website_product_variations ENABLE ROW LEVEL SECURITY;
ALTER TABLE website_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE website_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE website_settings ENABLE ROW LEVEL SECURITY;

-- Public can read active products
CREATE POLICY "Public read active products" ON website_products FOR SELECT USING (is_active = TRUE);
CREATE POLICY "Public read product images" ON website_product_images FOR SELECT USING (TRUE);
CREATE POLICY "Public read product variations" ON website_product_variations FOR SELECT USING (TRUE);
CREATE POLICY "Public read settings" ON website_settings FOR SELECT USING (TRUE);

-- Public can insert orders (guest checkout)
CREATE POLICY "Public insert orders" ON website_orders FOR INSERT WITH CHECK (TRUE);
CREATE POLICY "Public insert order items" ON website_order_items FOR INSERT WITH CHECK (TRUE);
-- Necessary to allow retrieve ID after insertion for order items
CREATE POLICY "Public read guest orders" ON website_orders FOR SELECT USING (TRUE);
CREATE POLICY "Public read guest items" ON website_order_items FOR SELECT USING (TRUE);

-- Authenticated users (app) can do everything
CREATE POLICY "Authenticated full access products" ON website_products FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated full access images" ON website_product_images FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated full access variations" ON website_product_variations FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated full access orders" ON website_orders FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated full access order items" ON website_order_items FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated full access settings" ON website_settings FOR ALL USING (auth.role() = 'authenticated');

-- ============================================================
-- 7. Website Customers (For Hybrid Checkout Model)
-- ============================================================
CREATE TABLE IF NOT EXISTS website_customers (
    phone TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    pin_hash TEXT NOT NULL,
    address TEXT,
    city TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS for Customers
ALTER TABLE website_customers ENABLE ROW LEVEL SECURITY;

-- Allow public inserts for the post-checkout prompt
CREATE POLICY "Public insert customers" ON website_customers FOR INSERT WITH CHECK (TRUE);

-- Authenticated desktop app has full access
CREATE POLICY "Authenticated full access customers" ON website_customers FOR ALL USING (auth.role() = 'authenticated');

-- 8. Website Delivery Branches (Dynamic checkout)
CREATE TABLE IF NOT EXISTS website_delivery_branches (
    id BIGSERIAL PRIMARY KEY,
    city TEXT NOT NULL UNIQUE,
    coverage_area TEXT DEFAULT 'All over the city',
    shipping_fee NUMERIC(10,2) DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE website_delivery_branches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read delivery branches" ON website_delivery_branches FOR SELECT USING (TRUE);
CREATE POLICY "Authenticated full access branches" ON website_delivery_branches FOR ALL USING (auth.role() = 'authenticated');

-- Insert some default delivery data Center as requested by the user during the troubleshooting process
INSERT INTO website_delivery_branches (city, coverage_area, shipping_fee) VALUES
    ('Kathmandu', 'Within Ring Road & Immediate Suburbs', 100),
    ('Lalitpur', 'Inside Valley areas', 100),
    ('Bhaktapur', 'City limits', 150),
    ('Pokhara', 'Lakeside and City areas', 200),
    ('Outside Valley', 'All major hubs except above', 250)
ON CONFLICT (city) DO NOTHING;

-- PublicUsers can verify themselves (login) using matching phone and PIN
-- In a real production setup, PINs should be verified on a secure server edge function.
CREATE POLICY "Public read own customer" ON website_customers FOR SELECT USING (TRUE);
