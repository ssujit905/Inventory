-- 1. Add ad_id column to website_products
ALTER TABLE website_products ADD COLUMN IF NOT EXISTS ad_id UUID REFERENCES expenses(id);

-- 2. Add ad_id column to website_orders (already did this, but ensuring it)
ALTER TABLE website_orders ADD COLUMN IF NOT EXISTS ad_id UUID REFERENCES expenses(id);
