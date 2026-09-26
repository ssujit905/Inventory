-- ============================================================
-- PRODUCT NOTIFY REQUESTS (back-in-stock alerts)
-- Run this in your Supabase SQL editor
-- Website guests submit name/address/phone when a specific
-- color+size variation is out of stock. Staff reads in dashboard.
-- ============================================================

CREATE TABLE IF NOT EXISTS product_notify_requests (
    id BIGSERIAL PRIMARY KEY,
    product_id BIGINT REFERENCES website_products(id) ON DELETE CASCADE,
    variant_id UUID NULL,
    color TEXT DEFAULT '',
    size TEXT DEFAULT '',
    customer_name TEXT NOT NULL,
    phone TEXT NOT NULL,
    address TEXT NOT NULL,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending','notified','cancelled')),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE product_notify_requests ENABLE ROW LEVEL SECURITY;

-- Guests can submit a notify request (no public read: protects phone numbers)
DROP POLICY IF EXISTS "Public insert notify requests" ON product_notify_requests;
CREATE POLICY "Public insert notify requests"
ON product_notify_requests FOR INSERT WITH CHECK (TRUE);

-- Authenticated staff/admin can do everything (view + mark notified)
DROP POLICY IF EXISTS "Authenticated full access notify requests" ON product_notify_requests;
CREATE POLICY "Authenticated full access notify requests"
ON product_notify_requests FOR ALL USING (auth.role() = 'authenticated');

CREATE INDEX IF NOT EXISTS idx_notify_product ON product_notify_requests(product_id);
CREATE INDEX IF NOT EXISTS idx_notify_status ON product_notify_requests(status);
